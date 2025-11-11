(() => {
  console.log("MyZ Danmaku: content script loaded");
  if (!location.hostname.includes("youtube.com")) {
    return;
  }

  const TIME_PREFIX_REGEX = /^\s*\[?((?:\d{1,2}:)?\d{1,2}:\d{2})\]?\s*(?:-|\u2013|\u2014)?\s*/;
  const MAX_FETCH_PAGES = 12;
  const BRIDGE_REQUEST = "myz-danmaku:requestCredentials";
  const BRIDGE_RESPONSE = "myz-danmaku:credentials";

  const danmakuMap = new Map();
  let danmakuList = [];
  let nextDanmakuIndex = 0;
  let lastVideoTime = 0;
  let currentVideoId = null;
  let videoElement = null;
  let overlayElement = null;
  let publishButton = null;
  let commentObserver = null;
  let controlsObserver = null;
  let loginCheckTimer = null;
  let loginNotice = null;
  let navigationObserver = null;
  let navigationScheduled = false;
  let fetchAbortController = null;
  let commentRefreshTimer = null;
  let isFetchingComments = false;
  let fetchPending = false;
  let rebuildScheduled = false;
  let fetchRetryTimer = null;
  let bridgeReady = null;
  let cachedInnertube = null;
  let debugLoggedComments = 0;

  function ensurePageBridge() {
    if (bridgeReady) {
      return bridgeReady;
    }
    bridgeReady = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.type = "text/javascript";
      script.src = chrome.runtime.getURL("content/bridge.js");
      script.dataset.bridgeRequest = BRIDGE_REQUEST;
      script.dataset.bridgeResponse = BRIDGE_RESPONSE;
      script.addEventListener("load", () => {
        script.remove();
        resolve();
      });
      script.addEventListener("error", () => {
        script.remove();
        console.error("MyZ Danmaku: failed to inject bridge script");
        bridgeReady = null;
        reject(new Error("bridge injection failed"));
      });
      (document.head || document.documentElement).appendChild(script);
    });
    return bridgeReady;
  }

  function handleBridgeMessage(event) {
    if (event.source !== window) {
      return;
    }
    const data = event.data;
    if (!data || data.type !== BRIDGE_RESPONSE) {
      return;
    }
    if (data.payload && data.payload.apiKey && data.payload.context) {
      cachedInnertube = data.payload;
      console.log("MyZ Danmaku: received innertube credentials");
      if (!isFetchingComments && currentVideoId && danmakuMap.size === 0) {
        loadDanmakuFromApi({ force: true });
      } else if (isFetchingComments) {
        fetchPending = true;
      }
    } else {
      console.warn("MyZ Danmaku: bridge returned empty credentials", data);
      scheduleFetchRetry();
    }
  }

  function requestInnertubeCredentials() {
    ensurePageBridge()
      .then(() => {
        window.postMessage({ type: BRIDGE_REQUEST }, "*");
      })
      .catch(error => {
        console.error("MyZ Danmaku: unable to request credentials", error);
        scheduleFetchRetry();
      });
  }

  function init() {
    window.addEventListener("message", handleBridgeMessage);
    requestInnertubeCredentials();
    console.log("MyZ Danmaku: init navigation handlers");
    handleNavigation();
    window.addEventListener("yt-navigate-finish", handleNavigation);
    window.addEventListener("yt-page-data-updated", handleNavigation);
    document.addEventListener("yt-page-data-updated", handleNavigation);
    navigationObserver = new MutationObserver(scheduleNavigationCheck);
    navigationObserver.observe(document.body, { childList: true, subtree: true });
  }

  function scheduleNavigationCheck() {
    if (navigationScheduled) {
      return;
    }
    navigationScheduled = true;
    window.requestAnimationFrame(() => {
      navigationScheduled = false;
      handleNavigation();
    });
  }

  function handleNavigation() {
    const videoId = extractVideoId();
    console.debug("MyZ Danmaku: handleNavigation", { videoId, currentVideoId });
    if (!videoId) {
      if (currentVideoId) {
        cleanupForVideo();
      }
      currentVideoId = null;
      return;
    }

    if (videoId === currentVideoId) {
      if (!isFetchingComments && danmakuMap.size === 0) {
        console.log("MyZ Danmaku: retry fetch for existing video");
        loadDanmakuFromApi({ force: true });
      }
      return;
    }

    cleanupForVideo();
    currentVideoId = videoId;
    console.log("MyZ Danmaku: detected new video", { videoId });
    setupForVideo();
  }

  function setupForVideo() {
    resetDanmakuState();
    ensureOverlay();

    if (!isLoggedIn()) {
      showLoginRequirement();
      scheduleLoginRecheck();
      notifyBackgroundClear();
      return;
    }

    removeLoginNotice();
    injectPublishButton();
    attachVideoListeners();
    observeComments();
    console.log("MyZ Danmaku: starting initial fetch");
    requestInnertubeCredentials();
    loadDanmakuFromApi({ force: true });
    startCommentRefreshCycle();
  }

  function cleanupForVideo() {
    abortCommentFetch();
    stopCommentRefreshCycle();
    cancelFetchRetry();
    if (loginCheckTimer) {
      window.clearInterval(loginCheckTimer);
      loginCheckTimer = null;
    }
    resetDanmakuState();
    detachVideoListeners();
    stopCommentObserver();
    stopControlsObserver();
    removePublishButton();
    removeLoginNotice();
    danmakuMap.clear();
    if (overlayElement) {
      overlayElement.remove();
      overlayElement = null;
    }
    if (currentVideoId) {
      notifyBackgroundClear();
    }
  }

  function resetDanmakuState() {
    danmakuMap.clear();
    danmakuList = [];
    nextDanmakuIndex = 0;
    lastVideoTime = 0;
    if (overlayElement) {
      overlayElement.querySelectorAll(".myz-danmaku-bullet").forEach(node => node.remove());
    }
  }

  function extractVideoId() {
    try {
      const url = new URL(location.href);
      if (url.pathname === "/watch") {
        return url.searchParams.get("v");
      }
      return null;
    } catch (_) {
      return null;
    }
  }

  function isLoggedIn() {
    return Boolean(document.querySelector("#avatar-btn"));
  }

  function scheduleLoginRecheck() {
    if (loginCheckTimer) {
      return;
    }
    loginCheckTimer = window.setInterval(() => {
      if (isLoggedIn()) {
        window.clearInterval(loginCheckTimer);
        loginCheckTimer = null;
        setupForVideo();
      }
    }, 2000);
  }

  function ensureOverlay() {
    if (overlayElement && overlayElement.isConnected) {
      overlayElement.innerHTML = "";
      return;
    }
    const container = document.querySelector(".html5-video-container");
    if (!container) {
      window.setTimeout(ensureOverlay, 500);
      return;
    }
    overlayElement = document.createElement("div");
    overlayElement.id = "myz-danmaku-overlay";
    container.appendChild(overlayElement);
  }

  function showLoginRequirement() {
    ensureOverlay();
    if (!overlayElement || loginNotice) {
      return;
    }
    loginNotice = document.createElement("div");
    loginNotice.className = "myz-danmaku-login";
    loginNotice.textContent = "Please sign in to YouTube to use danmaku";
    overlayElement.appendChild(loginNotice);
  }

  function removeLoginNotice() {
    if (loginNotice) {
      loginNotice.remove();
      loginNotice = null;
    }
  }

  function injectPublishButton() {
    removePublishButton();
    const controls = document.querySelector(".ytp-right-controls");
    if (!controls) {
      window.setTimeout(injectPublishButton, 500);
      return;
    }
    publishButton = document.createElement("button");
    publishButton.type = "button";
    publishButton.className = "ytp-button myz-danmaku-publish";
    publishButton.title = "Publish danmaku";
    publishButton.textContent = "DM";
    publishButton.addEventListener("click", handlePublishClick);
    controls.prepend(publishButton);
    startControlsObserver(controls);
  }

  function removePublishButton() {
    if (publishButton) {
      publishButton.removeEventListener("click", handlePublishClick);
      publishButton.remove();
      publishButton = null;
    }
  }

  function startControlsObserver(controls) {
    stopControlsObserver();
    controlsObserver = new MutationObserver(() => {
      if (!publishButton || !controls.contains(publishButton)) {
        injectPublishButton();
      }
    });
    controlsObserver.observe(controls, { childList: true });
  }

  function stopControlsObserver() {
    if (controlsObserver) {
      controlsObserver.disconnect();
      controlsObserver = null;
    }
  }

  function handlePublishClick() {
    if (!isLoggedIn()) {
      console.warn("MyZ Danmaku: blocking publish, user not logged in");
      showLoginRequirement();
      return;
    }
    const video = getVideoElement();
    if (!video) {
      return;
    }
    const timeSeconds = Math.floor(video.currentTime);
    const timeLabel = formatTimeLabel(timeSeconds);
    const message = window.prompt("Enter danmaku text") || "";
    const trimmed = message.trim();
    if (!trimmed) {
      return;
    }
    const commentText = `${timeLabel} ${trimmed}`;
    postComment(commentText);
  }

  function getVideoElement() {
    if (videoElement && videoElement.isConnected) {
      return videoElement;
    }
    videoElement = document.querySelector("video.html5-main-video");
    return videoElement || null;
  }

  function attachVideoListeners() {
    const video = getVideoElement();
    if (!video) {
      window.setTimeout(attachVideoListeners, 500);
      return;
    }
    detachVideoListeners();
    videoElement = video;
    videoElement.addEventListener("timeupdate", handleTimeUpdate);
    videoElement.addEventListener("seeking", handleSeeking);
  }

  function detachVideoListeners() {
    if (videoElement) {
      videoElement.removeEventListener("timeupdate", handleTimeUpdate);
      videoElement.removeEventListener("seeking", handleSeeking);
    }
    videoElement = null;
  }

  function handleTimeUpdate() {
    if (!danmakuList.length || !videoElement) {
      return;
    }
    const current = videoElement.currentTime;
    if (current + 0.3 < lastVideoTime) {
      resetPlaybackPointer(current);
    }
    lastVideoTime = current;
    while (nextDanmakuIndex < danmakuList.length && danmakuList[nextDanmakuIndex].timeSeconds <= current) {
      const item = danmakuList[nextDanmakuIndex];
      if (current - item.timeSeconds <= 0.5) {
        showDanmaku(item);
      }
      nextDanmakuIndex += 1;
    }
  }

  function handleSeeking() {
    if (!videoElement) {
      return;
    }
    resetPlaybackPointer(videoElement.currentTime);
  }

  function resetPlaybackPointer(currentTime) {
    let index = danmakuList.findIndex(item => item.timeSeconds > currentTime);
    if (index === -1) {
      index = danmakuList.length;
    }
    nextDanmakuIndex = index;
    lastVideoTime = currentTime;
  }

  function showDanmaku(item) {
    ensureOverlay();
    if (!overlayElement) {
      return;
    }
    console.debug("MyZ Danmaku: rendering bullet", item);
    const bullet = document.createElement("div");
    bullet.className = "myz-danmaku-bullet";
    bullet.textContent = item.body;
    bullet.style.top = `${Math.floor(Math.random() * 70)}%`;
    bullet.dataset.time = item.timeLabel;
    overlayElement.appendChild(bullet);
    window.setTimeout(() => {
      bullet.remove();
    }, 8000);
  }

  function observeComments() {
    stopCommentObserver();
    const container = document.querySelector("#comments #contents");
    if (!container) {
      window.setTimeout(observeComments, 1000);
      return;
    }
    parseCommentContainer(container);
    commentObserver = new MutationObserver(mutations => {
      for (const mutation of mutations) {
        mutation.addedNodes.forEach(node => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            parseCommentContainer(node);
          }
        });
      }
    });
    commentObserver.observe(container, { childList: true, subtree: true });
  }

  function stopCommentObserver() {
    if (commentObserver) {
      commentObserver.disconnect();
      commentObserver = null;
    }
  }

  function parseCommentContainer(root) {
    if (!(root instanceof Element)) {
      return;
    }
    if (root.matches("ytd-comment-thread-renderer")) {
      parseComment(root);
      return;
    }
    root.querySelectorAll("ytd-comment-thread-renderer").forEach(node => parseComment(node));
  }

  function parseComment(node) {
    if (!(node instanceof HTMLElement)) {
      return;
    }
    const textNode = node.querySelector("#content-text");
    if (!textNode) {
      return;
    }
  const rawText = (textNode.textContent || "").trim();
  const timeMatch = rawText.match(TIME_PREFIX_REGEX);
    if (!timeMatch) {
      return;
    }
    const label = timeMatch[1];
    const seconds = toSeconds(label);
    if (seconds === null) {
      return;
    }
    const id = extractCommentId(node, rawText, seconds);
    const body = rawText.slice(timeMatch[0].length).trim() || rawText;
    const authorNode = node.querySelector("#author-text span");
    const author = authorNode ? authorNode.textContent.trim() : "";
    addDanmakuEntry({
      id,
      timeSeconds: seconds,
      timeLabel: formatTimeLabel(seconds),
      body,
      author,
      rawText,
      permalink: buildCommentLink(seconds)
    });
  }

  function extractCommentId(node, rawText, seconds) {
    const commentId = node.getAttribute("data-comment-id") || node.dataset?.commentId;
    if (commentId) {
      return commentId;
    }
    return `${seconds}-${hashString(rawText)}`;
  }

  function addDanmakuEntry(entry) {
    if (!entry) {
      return;
    }
    const existing = danmakuMap.get(entry.id);
    if (existing && existing.rawText === entry.rawText) {
      return;
    }
    danmakuMap.set(entry.id, entry);
    scheduleDanmakuRebuild();
  }

  function scheduleDanmakuRebuild() {
    if (rebuildScheduled) {
      return;
    }
    rebuildScheduled = true;
    window.requestAnimationFrame(() => {
      rebuildScheduled = false;
      rebuildDanmakuList();
    });
  }

  function rebuildDanmakuList() {
    danmakuList = Array.from(danmakuMap.values()).sort((a, b) => a.timeSeconds - b.timeSeconds);
    const current = videoElement ? videoElement.currentTime : 0;
    resetPlaybackPointer(current);
    syncDanmakuWithBackground();
  }

  function syncDanmakuWithBackground() {
    if (!currentVideoId) {
      return;
    }
    const items = danmakuList.slice(0, 200);
    console.debug("MyZ Danmaku: sync background", {
      count: danmakuList.length,
      videoId: currentVideoId,
      title: getVideoTitle()
    });
    chrome.runtime.sendMessage({
      type: "danmaku:update",
      count: danmakuList.length,
      list: items,
      videoId: currentVideoId,
      title: getVideoTitle()
    });
  }

  function notifyBackgroundClear() {
    chrome.runtime.sendMessage({ type: "danmaku:clear" });
  }

  function getVideoTitle() {
    const node = document.querySelector("h1.ytd-watch-metadata yt-formatted-string");
    if (node && node.textContent) {
      return node.textContent.trim();
    }
    return document.title.replace(/ - YouTube$/, "").trim();
  }

  function postComment(commentText) {
    const simplebox = document.querySelector("ytd-comment-simplebox-renderer");
    if (!simplebox) {
      window.alert("Comment box not found. Scroll to load the comment section and try again.");
      return;
    }
    const placeholder = simplebox.querySelector("#placeholder-area");
    if (placeholder) {
      placeholder.click();
    }
    const editor = simplebox.querySelector("#contenteditable-root");
    if (!editor) {
      window.alert("Cannot write comment. Please try again later.");
      return;
    }
    editor.focus();
    editor.textContent = commentText;
    const inputEvent = new Event("input", { bubbles: true });
    editor.dispatchEvent(inputEvent);
    const submitButton = simplebox.querySelector("#submit-button tp-yt-paper-button");
    if (submitButton) {
      submitButton.click();
      window.setTimeout(() => loadDanmakuFromApi(), 4000);
    } else {
      window.alert("Submit button not found. Please post the comment manually.");
    }
  }

  function startCommentRefreshCycle() {
    stopCommentRefreshCycle();
    commentRefreshTimer = window.setInterval(() => {
      loadDanmakuFromApi();
    }, 60000);
  }

  function stopCommentRefreshCycle() {
    if (commentRefreshTimer) {
      window.clearInterval(commentRefreshTimer);
      commentRefreshTimer = null;
    }
  }

  function abortCommentFetch() {
    if (fetchAbortController) {
      fetchAbortController.abort();
      fetchAbortController = null;
    }
  }

  function scheduleFetchRetry(delay = 1500) {
    cancelFetchRetry();
    fetchRetryTimer = window.setTimeout(() => {
      fetchRetryTimer = null;
      loadDanmakuFromApi({ force: true });
    }, delay);
  }

  function cancelFetchRetry() {
    if (fetchRetryTimer) {
      window.clearTimeout(fetchRetryTimer);
      fetchRetryTimer = null;
    }
  }

  async function loadDanmakuFromApi(options = {}) {
    if (!currentVideoId) {
      return;
    }
    const credentials = getInnertubeCredentials();
    if (!credentials) {
      console.warn("MyZ Danmaku: innertube credentials missing, scheduling retry");
      scheduleFetchRetry();
      return;
    }
    if (isFetchingComments) {
      fetchPending = true;
      return;
    }
    console.log("MyZ Danmaku: fetch start", { videoId: currentVideoId, force: Boolean(options.force) });
    isFetchingComments = true;
    fetchPending = false;
    abortCommentFetch();
    const controller = new AbortController();
    fetchAbortController = controller;

    try {
      const aggregated = [];
      const seen = new Set();
      let initialBatch = extractInitialCommentBatch();
      console.log("MyZ Danmaku: initial batch", {
        renderers: initialBatch.renderers.length,
        continuation: Boolean(initialBatch.continuation)
      });
      if (!initialBatch.renderers.length && !initialBatch.continuation) {
        console.warn("MyZ Danmaku: initial batch empty, requesting fallback data");
        const commentSource = extractCommentParams();
        console.log("MyZ Danmaku: comment params", commentSource);
        if (commentSource?.params) {
          const apiInitial = await requestCommentsByParams(credentials, commentSource.params, controller.signal);
          if (apiInitial) {
            console.log("MyZ Danmaku: API initial comments received via params");
            initialBatch = parseCommentsPayload(apiInitial);
          }
        } else if (commentSource?.continuation) {
          const apiInitial = await requestCommentsPage(credentials, commentSource.continuation, controller.signal);
          if (apiInitial) {
            console.log("MyZ Danmaku: API initial comments received via continuation");
            initialBatch = parseCommentsPayload(apiInitial);
          }
        } else {
          console.warn("MyZ Danmaku: no comment params available for fallback");
        }
        if (!initialBatch.renderers.length && !initialBatch.continuation) {
          console.warn("MyZ Danmaku: fallback batch still empty, scheduling retry");
          scheduleFetchRetry();
        }
      }
      initialBatch.renderers.forEach(renderer => {
        const entry = normalizeCommentFromRenderer(renderer);
        if (entry && !seen.has(entry.id)) {
          seen.add(entry.id);
          aggregated.push(entry);
        }
      });

      let continuation = initialBatch.continuation;
      let pageCount = 0;

      while (continuation && pageCount < MAX_FETCH_PAGES && !controller.signal.aborted) {
        pageCount += 1;
        const payload = await requestCommentsPage(credentials, continuation, controller.signal);
        if (!payload) {
          console.warn("MyZ Danmaku: continuation fetch failed, scheduling retry");
          scheduleFetchRetry(4000);
          break;
        }
        const parsed = parseCommentsPayload(payload);
        console.log("MyZ Danmaku: continuation batch", {
          renderers: parsed.renderers.length,
          continuation: Boolean(parsed.continuation)
        });
        parsed.renderers.forEach(renderer => {
          const entry = normalizeCommentFromRenderer(renderer);
          if (entry && !seen.has(entry.id)) {
            seen.add(entry.id);
            aggregated.push(entry);
          }
        });
        if (!parsed.continuation || parsed.continuation === continuation) {
          break;
        }
        continuation = parsed.continuation;
      }

      if (!aggregated.length && !options.force) {
        console.log("MyZ Danmaku: no new danmaku from fetch");
        return;
      }

      const mergedMap = new Map();
      aggregated.forEach(entry => mergedMap.set(entry.id, entry));
      danmakuMap.forEach((value, key) => {
        if (!mergedMap.has(key)) {
          mergedMap.set(key, value);
        }
      });

      const changed = options.force || hasDanmakuChanged(danmakuMap, mergedMap);
      if (!changed) {
        return;
      }

      danmakuMap.clear();
      mergedMap.forEach((value, key) => danmakuMap.set(key, value));
      rebuildScheduled = false;
      rebuildDanmakuList();
      if (danmakuMap.size > 0) {
        cancelFetchRetry();
      }
      console.log("MyZ Danmaku: applied", { count: danmakuMap.size });
    } catch (error) {
      if (!controller.signal.aborted) {
        console.error("MyZ Danmaku: comment fetch failed", error);
        scheduleFetchRetry(4000);
      }
    } finally {
      if (fetchAbortController === controller) {
        fetchAbortController = null;
      }
      isFetchingComments = false;
      if (fetchPending) {
        fetchPending = false;
        console.log("MyZ Danmaku: repeating fetch after pending flag");
        loadDanmakuFromApi();
      }
    }
  }

  function getInnertubeCredentials() {
    if (cachedInnertube && cachedInnertube.apiKey && cachedInnertube.context) {
      return cachedInnertube;
    }
    const config = window.ytcfg;
    if (!config || typeof config.get !== "function") {
      requestInnertubeCredentials();
      return null;
    }
    const apiKey = config.get("INNERTUBE_API_KEY");
    const context = config.get("INNERTUBE_CONTEXT");
    const visitorData = config.get("VISITOR_DATA");
    const clientName = config.get("INNERTUBE_CLIENT_NAME");
    const clientVersion = config.get("INNERTUBE_CLIENT_VERSION");
    if (!apiKey || !context) {
      requestInnertubeCredentials();
      return null;
    }
    cachedInnertube = { apiKey, context, visitorData, clientName, clientVersion };
    return cachedInnertube;
  }

  function createRequestHeaders(credentials) {
    const headers = {
      "Content-Type": "application/json"
    };
    if (credentials.visitorData) {
      headers["X-Goog-Visitor-Id"] = credentials.visitorData;
    }
    if (credentials.clientName) {
      headers["X-YouTube-Client-Name"] = String(credentials.clientName);
    }
    if (credentials.clientVersion) {
      headers["X-YouTube-Client-Version"] = String(credentials.clientVersion);
    }
    return headers;
  }

  function extractInitialCommentBatch(data = window.ytInitialData) {
    const initialData = data;
    if (!initialData) {
      return { renderers: [], continuation: null };
    }
    const section = findCommentSection(initialData);
    if (!section) {
      return { renderers: [], continuation: null };
    }
    const renderers = [];
    let continuation = null;
    const contents = Array.isArray(section.contents) ? section.contents : [];
    contents.forEach(item => {
      if (item.commentThreadRenderer) {
        renderers.push(item.commentThreadRenderer);
      }
      const token = extractContinuationToken(item);
      if (token) {
        continuation = token;
      }
    });
    return { renderers, continuation };
  }

  function findCommentSection(initialData) {
    const results = initialData?.contents?.twoColumnWatchNextResults?.results?.results?.contents;
    if (Array.isArray(results)) {
      for (const item of results) {
        const section = item?.itemSectionRenderer;
        if (section?.sectionIdentifier === "comment-item-section") {
          return section;
        }
      }
    }
    const engagementPanels = initialData?.engagementPanels;
    if (Array.isArray(engagementPanels)) {
      for (const panel of engagementPanels) {
        const renderer = panel?.engagementPanelSectionListRenderer;
        if (renderer?.targetId === "comments-section") {
          const contents = renderer?.content?.sectionListRenderer?.contents;
          if (Array.isArray(contents)) {
            for (const item of contents) {
              const section = item?.itemSectionRenderer;
              if (section?.sectionIdentifier === "comment-item-section") {
                return section;
              }
            }
          }
        }
      }
    }
    return null;
  }

  function extractContinuationToken(node) {
    if (!node || typeof node !== "object") {
      return null;
    }
    const renderer = node.continuationItemRenderer;
    if (!renderer) {
      return null;
    }
    const commandToken = renderer?.continuationEndpoint?.continuationCommand?.token;
    if (commandToken) {
      return commandToken;
    }
    const buttonToken = renderer?.button?.buttonRenderer?.command?.continuationCommand?.token;
    if (buttonToken) {
      return buttonToken;
    }
    const nextData = renderer?.continuationEndpoint?.nextContinuationData?.continuation;
    if (nextData) {
      return nextData;
    }
    return null;
  }

  function extractCommentParams(data = window.ytInitialData) {
    const initialData = data;
    if (!initialData) {
      return null;
    }
    const panels = initialData?.engagementPanels;
    if (Array.isArray(panels)) {
      for (const panel of panels) {
        const renderer = panel?.engagementPanelSectionListRenderer;
        const endpoint = renderer?.header?.engagementPanelTitleHeaderRenderer?.navigationEndpoint?.getCommentsSectionEndpoint;
        if (endpoint?.params) {
          return { params: endpoint.params };
        }
      }
    }
    const results = initialData?.contents?.twoColumnWatchNextResults?.results?.results?.contents;
    if (Array.isArray(results)) {
      for (const item of results) {
        const commentsEntry = item?.commentsEntryPointHeaderRenderer;
        const endpoint = commentsEntry?.navigationEndpoint?.getCommentsSectionEndpoint;
        if (endpoint?.params) {
          return { params: endpoint.params };
        }
        const section = item?.itemSectionRenderer;
        if (section && section.sectionIdentifier === "comment-item-section") {
          const sectionContents = Array.isArray(section.contents) ? section.contents : [];
          for (const contentItem of sectionContents) {
            const token = extractContinuationToken(contentItem);
            if (token) {
              return { continuation: token };
            }
          }
        }
      }
    }
    const conversationBar = initialData?.conversationBar?.liveChatRenderer?.header?.liveChatHeaderRenderer?.viewSelector?.liveChatViewSelectorRenderer;
    const liveEndpoint = conversationBar?.subMenuItems?.[0]?.navigationEndpoint?.liveChatItemContextMenuEndpoint?.params;
    if (liveEndpoint) {
      return { params: liveEndpoint };
    }
    return null;
  }

  async function requestCommentsPage(credentials, continuation, signal) {
    const endpoint = `https://www.youtube.com/youtubei/v1/next?key=${credentials.apiKey}`;
    const headers = createRequestHeaders(credentials);
    const payload = {
      context: deepClone(credentials.context),
      continuation
    };
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        credentials: "include",
        headers,
        body: JSON.stringify(payload),
        signal
      });
      if (!response.ok) {
        return null;
      }
      return response.json();
    } catch (_) {
      return null;
    }
  }

  async function requestCommentsByParams(credentials, params, signal) {
    const endpoint = `https://www.youtube.com/youtubei/v1/next?key=${credentials.apiKey}`;
    const headers = createRequestHeaders(credentials);
    const payload = {
      context: deepClone(credentials.context),
      params
    };
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        credentials: "include",
        headers,
        body: JSON.stringify(payload),
        signal
      });
      if (!response.ok) {
        console.warn("MyZ Danmaku: params request failed", { status: response.status, statusText: response.statusText });
        return null;
      }
      return response.json();
    } catch (_) {
      console.warn("MyZ Danmaku: params request error", error);
      return null;
    }
  }

  function parseCommentsPayload(payload) {
    const renderers = [];
    let continuation = null;

    const contents = Array.isArray(payload?.contents) ? payload.contents : [];
    contents.forEach(item => {
      const section = item?.commentSectionRenderer;
      if (!section) {
        return;
      }
      const sectionContents = Array.isArray(section.contents) ? section.contents : [];
      sectionContents.forEach(contentItem => {
        if (contentItem.commentThreadRenderer) {
          renderers.push(contentItem.commentThreadRenderer);
        }
        const token = extractContinuationToken(contentItem);
        if (token) {
          continuation = token;
        }
      });
      const sectionContinuation = section?.continuations?.[0]?.nextContinuationData?.continuation;
      if (sectionContinuation) {
        continuation = sectionContinuation;
      }
    });

    const endpoints = payload?.onResponseReceivedEndpoints;
    if (Array.isArray(endpoints)) {
      for (const endpoint of endpoints) {
        const reload = endpoint?.reloadContinuationItemsCommand?.continuationItems;
        const append = endpoint?.appendContinuationItemsAction?.continuationItems;
        const items = reload || append;
        if (Array.isArray(items)) {
          items.forEach(item => {
            if (item.commentThreadRenderer) {
              renderers.push(item.commentThreadRenderer);
            }
            const token = extractContinuationToken(item);
            if (token) {
              continuation = token;
            }
          });
        }
      }
    }

    const section = payload?.continuationContents?.commentSectionContinuation;
    if (section) {
      const contents = Array.isArray(section.contents) ? section.contents : [];
      contents.forEach(item => {
        if (item.commentThreadRenderer) {
          renderers.push(item.commentThreadRenderer);
        }
      });
      const next = section.continuations?.[0]?.nextContinuationData?.continuation;
      if (next) {
        continuation = next;
      }
    }

    return { renderers, continuation };
  }

  function normalizeCommentFromRenderer(renderer) {
    const comment = renderer?.comment?.commentRenderer;
    if (!comment) {
      return null;
    }
    const commentId = comment.commentId;
    const rawText = extractRunsText(comment.contentText) || "";
    const trimmed = rawText.trim();
    if (debugLoggedComments < 10) {
      console.debug("MyZ Danmaku: comment text", { trimmed, commentId });
      debugLoggedComments += 1;
    }
    if (!trimmed) {
      return null;
    }
    const timeMatch = trimmed.match(TIME_PREFIX_REGEX);
    if (!timeMatch) {
      if (debugLoggedComments < 20) {
        console.debug("MyZ Danmaku: skipping non-timestamp comment", { trimmed });
        debugLoggedComments += 1;
      }
      return null;
    }
    const seconds = toSeconds(timeMatch[1]);
    if (seconds === null) {
      return null;
    }
    const body = trimmed.slice(timeMatch[0].length).trim() || trimmed;
    const author = extractRunsText(comment.authorText) || "";
    return {
      id: commentId || `${seconds}-${hashString(trimmed)}`,
      timeSeconds: seconds,
      timeLabel: formatTimeLabel(seconds),
      body,
      author,
      rawText: trimmed,
      permalink: buildCommentLink(seconds)
    };
  }

  function extractRunsText(value) {
    if (!value) {
      return "";
    }
    if (typeof value === "string") {
      return value;
    }
    if (Array.isArray(value)) {
      return value.map(extractRunsText).join("");
    }
    if (value.simpleText) {
      return value.simpleText;
    }
    if (Array.isArray(value.runs)) {
      return value.runs.map(run => run.text || "").join("");
    }
    return "";
  }

  function hasDanmakuChanged(prevMap, nextMap) {
    if (prevMap.size !== nextMap.size) {
      return true;
    }
    for (const [key, value] of nextMap.entries()) {
      const existing = prevMap.get(key);
      if (!existing) {
        return true;
      }
      if (existing.rawText !== value.rawText) {
        return true;
      }
    }
    return false;
  }

  function toSeconds(label) {
    const parts = label.split(":").map(Number);
    if (parts.some(Number.isNaN)) {
      return null;
    }
    if (parts.length === 3) {
      return parts[0] * 3600 + parts[1] * 60 + parts[2];
    }
    if (parts.length === 2) {
      return parts[0] * 60 + parts[1];
    }
    return null;
  }

  function formatTimeLabel(seconds) {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    if (hrs > 0) {
      return `${pad(hrs)}:${pad(mins)}:${pad(secs)}`;
    }
    return `${pad(mins)}:${pad(secs)}`;
  }

  function pad(value) {
    return value < 10 ? `0${value}` : String(value);
  }

  function buildCommentLink(seconds) {
    if (!currentVideoId) {
      return "";
    }
    const time = Math.max(0, Math.floor(seconds));
    return `https://www.youtube.com/watch?v=${currentVideoId}&t=${time}s`;
  }

  function hashString(text) {
    let hash = 0;
    for (let i = 0; i < text.length; i += 1) {
      hash = (hash << 5) - hash + text.charCodeAt(i);
      hash |= 0;
    }
    return String(hash >>> 0);
  }

  function deepClone(value) {
    if (typeof structuredClone === "function") {
      try {
        return structuredClone(value);
      } catch (_) {
        // Fallback to JSON-based clone when structuredClone fails.
      }
    }
    if (value === undefined) {
      return undefined;
    }
    try {
      return JSON.parse(JSON.stringify(value));
    } catch (_) {
      return value;
    }
  }

  init();
})();
