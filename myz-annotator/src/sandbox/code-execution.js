const MIN_TIMEOUT_MS = 100;
const MAX_TIMEOUT_MS = 5000;
const DEFAULT_TIMEOUT_MS = 1000;

const MIN_RESULT_CHARS = 200;
const MAX_RESULT_CHARS = 8000;
const DEFAULT_MAX_RESULT_CHARS = 2000;

const MAX_CODE_CHARS = 5000;

function clampNumber(value, min, max, fallback) {
  if (typeof value !== "number" || Number.isNaN(value)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(value)));
}

function postToParent(payload) {
  window.parent?.postMessage(payload, "*");
}

function normalizeCode(value) {
  const code = typeof value === "string" ? value.trim() : "";
  if (!code) {
    throw new Error("请输入要执行的 JavaScript 代码。");
  }
  if (code.length > MAX_CODE_CHARS) {
    throw new Error(`代码过长（最多 ${MAX_CODE_CHARS} 字符）。`);
  }
  return code;
}

function serializeResult(value, maxChars) {
  let text = "";
  let resultType = typeof value;

  if (value === null) {
    text = "null";
    resultType = "null";
  } else if (typeof value === "string") {
    text = value;
  } else if (
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "bigint"
  ) {
    text = String(value);
  } else {
    try {
      const json = JSON.stringify(value);
      text = typeof json === "string" ? json : String(value);
    } catch {
      text = String(value);
    }
  }

  const truncated = text.length > maxChars;
  if (truncated) {
    text = `${text.slice(0, Math.max(maxChars - 1, 0))}…`;
  }

  return { text, resultType, truncated };
}

function createWorker() {
  const source = `
    self.onmessage = async (event) => {
      const code = typeof event.data?.code === "string" ? event.data.code : ""
      const logs = []
      let logChars = 0
      const maxLogLines = 20
      const maxLogChars = 2000
      const maxLogLineChars = 300

      const serializeArg = (value) => {
        if (value === null) return "null"
        if (value === undefined) return "undefined"
        const type = typeof value
        if (type === "string") return value
        if (type === "number" || type === "boolean" || type === "bigint") return String(value)
        try {
          const json = JSON.stringify(value)
          return typeof json === "string" ? json : String(value)
        } catch {
          return String(value)
        }
      }

      const pushLog = (args) => {
        if (logs.length >= maxLogLines || logChars >= maxLogChars) return
        let line = args.map(serializeArg).join(" ")
        if (line.length > maxLogLineChars) {
          line = line.slice(0, Math.max(maxLogLineChars - 1, 0)) + "…"
        }
        const remaining = maxLogChars - logChars
        if (line.length > remaining) {
          if (remaining > 1) {
            line = line.slice(0, Math.max(remaining - 1, 0)) + "…"
            logs.push(line)
          }
          logChars = maxLogChars
          return
        }
        logs.push(line)
        logChars += line.length
      }

      console.log = (...args) => {
        pushLog(args)
      }

      try {
        let value = (0, eval)(code)
        if (value && typeof value.then === "function") {
          value = await value
        }
        self.postMessage({ ok: true, value, logs })
      } catch (error) {
        self.postMessage({ ok: false, error: String(error?.message || error), logs })
      }
    }
  `;
  const blob = new Blob([source], { type: "text/javascript" });
  const blobUrl = URL.createObjectURL(blob);
  const worker = new Worker(blobUrl);
  URL.revokeObjectURL(blobUrl);
  return worker;
}

function runInWorker(code, timeoutMs) {
  return new Promise((resolve, reject) => {
    const worker = createWorker();
    const timeoutId = setTimeout(() => {
      worker.terminate();
      reject(new Error("执行超时。"));
    }, timeoutMs);

    worker.onmessage = (event) => {
      clearTimeout(timeoutId);
      worker.terminate();
      const payload = event.data || {};
      if (payload.ok) {
        resolve({
          value: payload.value,
          logs: Array.isArray(payload.logs) ? payload.logs : [],
        });
        return;
      }
      const error = new Error(payload.error || "执行失败。");
      error.logs = Array.isArray(payload.logs) ? payload.logs : [];
      reject(error);
    };

    worker.onerror = (event) => {
      clearTimeout(timeoutId);
      worker.terminate();
      reject(new Error(event?.message || "Worker 出错。"));
    };

    worker.postMessage({ code });
  });
}

window.addEventListener("message", async (event) => {
  const payload = event.data || {};
  if (payload.type !== "myz-sandbox-exec") return;

  const id = payload.id;
  if (!id) return;

  try {
    const code = normalizeCode(payload.code);
    const timeoutMs = clampNumber(
      payload.timeoutMs,
      MIN_TIMEOUT_MS,
      MAX_TIMEOUT_MS,
      DEFAULT_TIMEOUT_MS,
    );
    const maxResultChars = clampNumber(
      payload.maxResultChars,
      MIN_RESULT_CHARS,
      MAX_RESULT_CHARS,
      DEFAULT_MAX_RESULT_CHARS,
    );

    const result = await runInWorker(code, timeoutMs);
    const serialized = serializeResult(result.value, maxResultChars);
    postToParent({
      type: "myz-sandbox-exec-result",
      id,
      ok: true,
      resultText: serialized.text,
      resultType: serialized.resultType,
      truncated: serialized.truncated,
      consoleLogs: result.logs,
    });
  } catch (error) {
    const logs = Array.isArray(error?.logs) ? error.logs : [];
    postToParent({
      type: "myz-sandbox-exec-result",
      id,
      ok: false,
      error: String(error?.message || error || "执行失败。"),
      consoleLogs: logs,
    });
  }
});

postToParent({ type: "myz-sandbox-ready" });
