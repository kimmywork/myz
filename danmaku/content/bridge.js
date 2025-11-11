(() => {
  const script = document.currentScript;
  const requestType = script && script.dataset && script.dataset.bridgeRequest ? script.dataset.bridgeRequest : "myz-danmaku:requestCredentials";
  const responseType = script && script.dataset && script.dataset.bridgeResponse ? script.dataset.bridgeResponse : "myz-danmaku:credentials";

  function readInnertube() {
    const cfg = window.ytcfg && window.ytcfg.data_ ? window.ytcfg.data_ : {};
    return {
      apiKey: cfg.INNERTUBE_API_KEY,
      context: cfg.INNERTUBE_CONTEXT,
      visitorData: cfg.VISITOR_DATA,
      clientName: cfg.INNERTUBE_CLIENT_NAME,
      clientVersion: cfg.INNERTUBE_CLIENT_VERSION
    };
  }

  window.addEventListener("message", event => {
    if (event.source !== window) {
      return;
    }
    const data = event.data;
    if (!data || data.type !== requestType) {
      return;
    }
    try {
      const payload = readInnertube();
      window.postMessage({ type: responseType, payload }, "*");
    } catch (error) {
      window.postMessage({ type: responseType, payload: null, error: error ? String(error) : "unknown" }, "*");
    }
  });
})();
