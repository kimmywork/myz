/**
 * Local stand-ins for the chat sites used by `ask-deepseek.spec.ts`.
 *
 * They mirror the parts of each site the extension touches: the composer, the
 * hidden file input, paste handling, and the two ways a conversation is left
 * (an in-page "new chat" control, or a router that answers `popstate`).
 */

/**
 * DeepSeek conversation stub that, like the real app, reacts to `popstate`: the
 * extension can switch to a new chat without a reload (tier 2 of the switch).
 */
export const DEEPSEEK_ROUTER_STUB = `<!doctype html>
<html>
  <head><meta charset="utf-8" /><title>DeepSeek Router Stub</title></head>
  <body>
    <div id="view">Conversation with messages</div>
    <textarea id="composer" rows="3" style="width: 600px; height: 90px"></textarea>
    <input id="upload" type="file" accept="image/*" hidden />
    <script>
      window.__myzAiTest = { pastedFiles: 0, uploadedFiles: 0, pastedText: "", writes: 0 };
      const composer = document.getElementById("composer");
      composer.addEventListener("input", () => {
        window.__myzAiTest.writes += 1;
        localStorage.setItem(
          "myzWrites",
          String(Number(localStorage.getItem("myzWrites") || 0) + 1),
        );
      });
      // Same behaviour as the real SPA: a history event renders the new chat.
      window.addEventListener("popstate", () => {
        if (location.pathname === "/") {
          document.getElementById("view").textContent = "New chat";
          composer.value = "";
        }
      });
    </script>
  </body>
</html>`;

export const DEEPSEEK_STUB = `<!doctype html>
<html lang="zh">
  <head><meta charset="utf-8" /><title>DeepSeek Stub</title></head>
  <body>
    <div class="ds-toggle-button" id="think" tabindex="0" aria-pressed="false">深度思考</div>
    <div class="ds-toggle-button" id="search" tabindex="0" aria-pressed="true">智能搜索</div>
    <textarea id="composer" rows="3" style="width: 600px; height: 90px"></textarea>
    <input id="upload" type="file" accept="image/*" hidden />
    <script>
      window.__myzAiTest = { pastedFiles: 0, uploadedFiles: 0, pastedText: "", writes: 0 };
      for (const toggle of document.querySelectorAll(".ds-toggle-button")) {
        toggle.addEventListener("click", () => {
          const pressed = toggle.getAttribute("aria-pressed") === "true";
          toggle.setAttribute("aria-pressed", pressed ? "false" : "true");
        });
      }
      const composer = document.getElementById("composer");
      composer.addEventListener("input", () => {
        window.__myzAiTest.writes = (window.__myzAiTest.writes || 0) + 1;
        localStorage.setItem(
          "myzWrites",
          String(Number(localStorage.getItem("myzWrites") || 0) + 1),
        );
      });
      composer.addEventListener("paste", (event) => {
        const files = event.clipboardData ? event.clipboardData.files.length : 0;
        window.__myzAiTest.pastedFiles += files;
        window.__myzAiTest.pastedText += event.clipboardData
          ? event.clipboardData.getData("text/plain")
          : "";
        if (files > 0) event.preventDefault();
      });
      document.getElementById("upload").addEventListener("change", (event) => {
        window.__myzAiTest.uploadedFiles += event.target.files.length;
      });
    </script>
  </body>
</html>`;

/**
 * Qwen's stub: a plain composer with no mode toggles at all, mirroring the real
 * site (its "Select Mode" is a localized tools menu we deliberately leave alone).
 */
export const QWEN_STUB = `<!doctype html>
<html lang="zh">
  <head><meta charset="utf-8" /><title>Qwen Stub</title></head>
  <body>
    <textarea id="composer" class="message-input-textarea" rows="1" style="width: 500px; height: 32px"></textarea>
    <input id="upload" type="file" multiple hidden />
    <script>
      window.__myzAiTest = { pastedFiles: 0, uploadedFiles: 0, writes: 0 };
      const composer = document.getElementById("composer");
      composer.addEventListener("input", () => {
        window.__myzAiTest.writes += 1;
        localStorage.setItem("myzWrites", String(Number(localStorage.getItem("myzWrites") || 0) + 1));
      });
      composer.addEventListener("paste", (event) => {
        const files = event.clipboardData ? event.clipboardData.files.length : 0;
        window.__myzAiTest.pastedFiles += files;
        if (files > 0) event.preventDefault();
      });
      document.getElementById("upload").addEventListener("change", (event) => {
        window.__myzAiTest.uploadedFiles += event.target.files.length;
      });
    </script>
  </body>
</html>`;

/**
 * Qwen conversation stub: `/c/:id` looks like an old chat and offers the real
 * site's in-page "new chat" control (`.new-chat`), which swaps the view with
 * `pushState` — no document reload.
 */
export const QWEN_CONVERSATION_STUB = `<!doctype html>
<html lang="zh">
  <head><meta charset="utf-8" /><title>Qwen Conversation Stub</title></head>
  <body>
    <div class="new-chat" role="button" id="new-chat">+</div>
    <textarea id="composer" class="message-input-textarea" rows="1" style="width: 500px; height: 32px"></textarea>
    <input id="upload" type="file" multiple hidden />
    <script>
      window.__myzAiTest = { pastedFiles: 0, uploadedFiles: 0, writes: 0 };
      const composer = document.getElementById("composer");
      composer.addEventListener("input", () => {
        window.__myzAiTest.writes += 1;
        localStorage.setItem("myzWrites", String(Number(localStorage.getItem("myzWrites") || 0) + 1));
      });
      document.getElementById("new-chat").addEventListener("click", () => {
        // The real app may land on a draft route rather than the root; both are
        // "new chat" (this is the case the URL check used to reject).
        history.pushState({}, "", "/c/new-chat");
        composer.value = "";
        document.body.dataset.view = "new";
      });
    </script>
  </body>
</html>`;
