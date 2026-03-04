const SANDBOX_URL = chrome.runtime.getURL("src/sandbox/code-execution.html");

const MAX_READY_WAIT_MS = 5000;
const EXTRA_RESPONSE_BUFFER_MS = 1200;

let sandboxFrame = null;
let sandboxReady = false;
let sandboxReadyPromise = null;
let sandboxReadyResolve = null;

const pendingRequests = new Map();

function buildRequestId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function ensureSandboxFrame() {
  if (sandboxFrame) return sandboxFrame;
  sandboxFrame = document.createElement("iframe");
  sandboxFrame.setAttribute("sandbox", "allow-scripts");
  sandboxFrame.setAttribute("aria-hidden", "true");
  sandboxFrame.style.position = "absolute";
  sandboxFrame.style.left = "-9999px";
  sandboxFrame.style.top = "-9999px";
  sandboxFrame.style.width = "1px";
  sandboxFrame.style.height = "1px";
  sandboxFrame.style.border = "0";
  sandboxFrame.src = SANDBOX_URL;
  document.body.appendChild(sandboxFrame);
  return sandboxFrame;
}

function ensureSandboxReady() {
  if (sandboxReady) return Promise.resolve();
  if (sandboxReadyPromise) return sandboxReadyPromise;

  ensureSandboxFrame();

  sandboxReadyPromise = new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      sandboxReadyPromise = null;
      sandboxReadyResolve = null;
      reject(new Error("Sandbox iframe load timeout"));
    }, MAX_READY_WAIT_MS);

    sandboxReadyResolve = () => {
      clearTimeout(timeoutId);
      resolve();
    };
  });

  return sandboxReadyPromise;
}

function handleSandboxMessage(event) {
  if (event.source !== sandboxFrame?.contentWindow) return;
  const payload = event.data || {};

  if (payload.type === "myz-sandbox-ready") {
    sandboxReady = true;
    if (sandboxReadyResolve) sandboxReadyResolve();
    sandboxReadyResolve = null;
    return;
  }

  if (payload.type !== "myz-sandbox-exec-result") return;
  const id = payload.id;
  if (!id) return;
  const pending = pendingRequests.get(id);
  if (!pending) return;
  pendingRequests.delete(id);
  clearTimeout(pending.timeoutId);
  pending.resolve(payload);
}

window.addEventListener("message", handleSandboxMessage);

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== "myz:executeSandboxedCode") return;

  const requestId = buildRequestId();
  const payload = message?.payload || {};
  const timeoutMs = Number(payload.timeoutMs) || 0;
  const responseTimeoutMs =
    Math.min(Math.max(timeoutMs, 100), 5000) + EXTRA_RESPONSE_BUFFER_MS;

  ensureSandboxReady()
    .then(() => {
      const target = sandboxFrame?.contentWindow;
      if (!target) {
        sendResponse({ ok: false, error: "Sandbox iframe 未就绪。" });
        return;
      }

      const timeoutId = setTimeout(() => {
        pendingRequests.delete(requestId);
        sendResponse({ ok: false, error: "Sandbox 响应超时。" });
      }, responseTimeoutMs);

      pendingRequests.set(requestId, {
        resolve: (result) => sendResponse(result),
        timeoutId,
      });

      target.postMessage(
        {
          type: "myz-sandbox-exec",
          id: requestId,
          code: payload.code,
          timeoutMs: payload.timeoutMs,
          maxResultChars: payload.maxResultChars,
        },
        "*",
      );
    })
    .catch((error) => {
      const messageText = String(
        error?.message || error || "Sandbox 初始化失败。",
      );
      sendResponse({ ok: false, error: messageText });
    });

  return true;
});
