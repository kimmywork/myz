import { registerMessageHandler } from "./handler";

type DomAction = {
  type:
    | "query"
    | "click"
    | "scrollIntoView"
    | "scrollBy"
    | "input"
    | "keypress"
    | "focus"
    | "getText"
    | "getHtml"
    | "getAttribute"
    | "getRect"
    | "captureViewport"
    | "queryViewport"
    | "elementFromPoint";
  selector?: string;
  selectorType?: "css" | "xpath";
  batch?: number | boolean;
  value?: string;
  key?: string;
  code?: string;
  ctrlKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
  metaKey?: boolean;
  repeat?: boolean;
  location?: number;
  attribute?: string;
  scrollTop?: number;
  scrollLeft?: number;
  x?: number;
  y?: number;
  limit?: number;
  format?: string;
  quality?: number;
};

function resolveElement(selector?: string, selectorType?: string) {
  if (!selector || typeof selector !== "string") return null;
  const mode = selectorType === "xpath" ? "xpath" : "css";
  if (mode === "xpath") {
    try {
      const result = document.evaluate(
        selector,
        document,
        null,
        XPathResult.FIRST_ORDERED_NODE_TYPE,
        null,
      );
      const node = result.singleNodeValue;
      return node instanceof Element ? node : null;
    } catch {
      return null;
    }
  }
  try {
    return document.querySelector(selector);
  } catch {
    return null;
  }
}

function resolveElements(selector?: string, selectorType?: string): Element[] {
  if (!selector || typeof selector !== "string") return [];
  const mode = selectorType === "xpath" ? "xpath" : "css";
  if (mode === "xpath") {
    try {
      const snapshot = document.evaluate(
        selector,
        document,
        null,
        XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
        null,
      );
      const results: Element[] = [];
      for (let i = 0; i < snapshot.snapshotLength; i += 1) {
        const node = snapshot.snapshotItem(i);
        if (node instanceof Element) {
          results.push(node);
        }
      }
      return results;
    } catch {
      return [];
    }
  }
  try {
    return Array.from(document.querySelectorAll(selector));
  } catch {
    return [];
  }
}

function escapeXPathLiteral(value: string) {
  if (!value.includes("'")) return `'${value}'`;
  if (!value.includes('"')) return `"${value}"`;
  const parts = value.split("'");
  const joined = parts.map((part) => `'${part}'`).join(", \"'\", ");
  return `concat(${joined})`;
}

function buildXPath(element: Element) {
  if (!element || element.nodeType !== Node.ELEMENT_NODE) return "";
  const id = (element as HTMLElement).id;
  if (id) {
    const escaped = typeof CSS !== "undefined" && CSS.escape ? CSS.escape(id) : id;
    const matches = document.querySelectorAll(`#${escaped}`);
    if (matches.length === 1) {
      return `//*[@id=${escapeXPathLiteral(id)}]`;
    }
  }
  const segments: string[] = [];
  let current: Element | null = element;
  while (current && current.nodeType === Node.ELEMENT_NODE) {
    const tag = current.tagName.toLowerCase();
    const parentElement: Element | null = current.parentElement;
    if (!parentElement) {
      segments.unshift(`/${tag}`);
      break;
    }
    const siblings = (Array.from(parentElement.children) as Element[]).filter(
      (child: Element) => child.tagName.toLowerCase() === tag,
    );
    if (siblings.length > 1) {
      const index = siblings.indexOf(current) + 1;
      segments.unshift(`${tag}[${index}]`);
    } else {
      segments.unshift(tag);
    }
    current = parentElement;
  }
  if (!segments.length) return "";
  const normalized = segments[0].startsWith("/") ? segments.join("/") : `/${segments.join("/")}`;
  return normalized;
}

function setInputValue(element: Element, value: string) {
  const input = element as HTMLInputElement;
  const textArea = element as HTMLTextAreaElement;
  const isContentEditable = (element as HTMLElement).isContentEditable;

  if (isContentEditable) {
    (element as HTMLElement).textContent = value;
  } else if ("value" in input) {
    input.value = value;
  } else if ("value" in textArea) {
    textArea.value = value;
  }

  const inputEvent = new Event("input", { bubbles: true });
  const changeEvent = new Event("change", { bubbles: true });
  element.dispatchEvent(inputEvent);
  element.dispatchEvent(changeEvent);
}

function dispatchPointerEvent(
  element: Element,
  type: string,
  init: PointerEventInit,
) {
  if (typeof PointerEvent === "undefined") return;
  element.dispatchEvent(new PointerEvent(type, init));
}

function dispatchMouseEvent(element: Element, type: string, init: MouseEventInit) {
  element.dispatchEvent(new MouseEvent(type, init));
}

function dispatchKeyboardEvent(
  element: Element,
  type: string,
  init: KeyboardEventInit,
) {
  element.dispatchEvent(new KeyboardEvent(type, init));
}

function dispatchInputEvent(
  element: Element,
  type: string,
  init: InputEventInit,
) {
  if (typeof InputEvent === "undefined") return;
  element.dispatchEvent(new InputEvent(type, init));
}

function simulateClick(element: Element) {
  const rect = element.getBoundingClientRect();
  const clientX = rect.left + rect.width / 2;
  const clientY = rect.top + rect.height / 2;
  const baseInit = {
    bubbles: true,
    cancelable: true,
    composed: true,
    view: window,
    clientX,
    clientY,
    screenX: window.screenX + clientX,
    screenY: window.screenY + clientY,
  } satisfies MouseEventInit;

  const pointerInit: PointerEventInit = {
    ...baseInit,
    pointerId: 1,
    pointerType: "mouse",
    isPrimary: true,
    pressure: 0.5,
    buttons: 1,
  };

  try {
    dispatchPointerEvent(element, "pointerover", pointerInit);
    dispatchPointerEvent(element, "pointerenter", pointerInit);
    dispatchPointerEvent(element, "pointerdown", { ...pointerInit, buttons: 1 });
    dispatchMouseEvent(element, "mouseover", baseInit);
    dispatchMouseEvent(element, "mouseenter", baseInit);
    dispatchMouseEvent(element, "mousemove", baseInit);
    dispatchMouseEvent(element, "mousedown", { ...baseInit, buttons: 1 });

    dispatchPointerEvent(element, "pointerup", { ...pointerInit, buttons: 0 });
    dispatchMouseEvent(element, "mouseup", { ...baseInit, buttons: 0 });
    dispatchMouseEvent(element, "click", { ...baseInit, buttons: 0 });

    dispatchPointerEvent(element, "pointerout", { ...pointerInit, buttons: 0 });
    dispatchPointerEvent(element, "pointerleave", { ...pointerInit, buttons: 0 });
    dispatchMouseEvent(element, "mouseout", baseInit);
    dispatchMouseEvent(element, "mouseleave", baseInit);
  } catch {
    try {
      (element as HTMLElement).click();
    } catch {
      // ignore click fallback errors
    }
  }
}

function simulateKeypress(
  element: Element,
  options: {
    key: string;
    code?: string;
    ctrlKey?: boolean;
    altKey?: boolean;
    shiftKey?: boolean;
    metaKey?: boolean;
    repeat?: boolean;
    location?: number;
  },
) {
  const init: KeyboardEventInit = {
    key: options.key,
    code: options.code,
    ctrlKey: options.ctrlKey,
    altKey: options.altKey,
    shiftKey: options.shiftKey,
    metaKey: options.metaKey,
    repeat: options.repeat,
    location: options.location,
    bubbles: true,
    cancelable: true,
    composed: true,
  };
  dispatchKeyboardEvent(element, "keydown", init);
  dispatchKeyboardEvent(element, "keypress", init);
  dispatchKeyboardEvent(element, "keyup", init);
}

function simulateTyping(element: Element, value: string) {
  const text = typeof value === "string" ? value : "";
  if (!text) return;
  for (const char of text) {
    dispatchInputEvent(element, "beforeinput", {
      data: char,
      inputType: "insertText",
      bubbles: true,
      cancelable: true,
      composed: true,
    });
    simulateKeypress(element, { key: char });
    dispatchInputEvent(element, "input", {
      data: char,
      inputType: "insertText",
      bubbles: true,
      composed: true,
    });
  }
}

function sanitizeHtmlContent(element: Element) {
  const clone = element.cloneNode(true) as Element
  const removed = clone.querySelectorAll("script, style")
  removed.forEach((node) => node.remove())
  const nodes = clone.querySelectorAll("*")
  nodes.forEach((node) => {
    const attrs = Array.from(node.attributes)
    attrs.forEach((attr) => {
      const name = attr.name.toLowerCase()
      if (name === "style" || name.startsWith("on")) {
        node.removeAttribute(attr.name)
      }
    })
  })
  return clone.innerHTML || ""
}

function buildElementSnapshot(element: Element) {
  const rect = element.getBoundingClientRect();
  const text =
    (element as HTMLElement).innerText ||
    (element as HTMLElement).textContent ||
    "";
  const href = (element as HTMLAnchorElement).href || "";
  return {
    tagName: element.tagName,
    id: (element as HTMLElement).id || "",
    className: (element as HTMLElement).className || "",
    xpath: buildXPath(element),
    text: text.trim().slice(0, 200),
    href,
    rect: {
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
      top: rect.top,
      left: rect.left,
      right: rect.right,
      bottom: rect.bottom,
    },
  };
}

function normalizeBatchSize(value: any, fallback = 10) {
  if (value === true) return fallback;
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.max(1, Math.min(50, Math.floor(value)));
}

function isRectInViewport(rect: DOMRect) {
  const width = window.innerWidth || document.documentElement.clientWidth || 0;
  const height = window.innerHeight || document.documentElement.clientHeight || 0;
  return rect.bottom > 0 && rect.right > 0 && rect.top < height && rect.left < width;
}

function normalizeEvalResult(value: any): any {
  if (value == null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (value instanceof Element) {
    return buildElementSnapshot(value);
  }
  try {
    return structuredClone(value);
  } catch {
    // ignore
  }
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return String(value);
  }
}

export function initializeSuperpowerMessageHandlers() {
  registerMessageHandler(
    "myz:runDomActions",
    async (payload: { actions?: DomAction[] }) => {
      const actions = Array.isArray(payload?.actions) ? payload.actions : [];
      const results = actions.map((action) => {
        const type = action?.type;
        try {
          if (!type) {
            return { ok: false, error: "Missing action type" };
          }
          if (type === "captureViewport") {
            return { ok: false, error: "captureViewport 需由后台执行" };
          }
          if (type === "scrollBy") {
            const top = typeof action.scrollTop === "number" ? action.scrollTop : 0;
            const left = typeof action.scrollLeft === "number" ? action.scrollLeft : 0;
            window.scrollBy({ top, left, behavior: "smooth" });
            return { ok: true };
          }

          if (type === "elementFromPoint") {
            const x = typeof action.x === "number" ? action.x : null;
            const y = typeof action.y === "number" ? action.y : null;
            if (x == null || y == null) {
              return { ok: false, error: "Missing x/y for elementFromPoint" };
            }
            const element = document.elementFromPoint(x, y);
            if (!element) {
              return { ok: false, error: "Element not found at point" };
            }
            return {
              ok: true,
              result: buildElementSnapshot(element),
            };
          }

          if (type === "queryViewport") {
            const selector = action.selector;
            if (!selector) {
              return { ok: false, error: "Missing selector for queryViewport" };
            }
            const limit =
              typeof action.limit === "number"
                ? Math.max(1, Math.min(50, Math.floor(action.limit)))
                : 10;
            const nodes = resolveElements(selector, action.selectorType);
            const inView: any[] = [];
            for (const node of nodes) {
              if (!(node instanceof Element)) continue;
              const rect = node.getBoundingClientRect();
              if (!isRectInViewport(rect)) continue;
              inView.push({ xpath: buildXPath(node) });
              if (inView.length >= limit) break;
            }
            return {
              ok: true,
              result: {
                items: inView,
              },
            };
          }

          if (type === "keypress" && !action.selector) {
            const key = typeof action.key === "string" ? action.key : "";
            if (!key) {
              return { ok: false, error: "Missing key for keypress" };
            }
            const target =
              document.activeElement instanceof Element
                ? document.activeElement
                : document.body;
            if (!target) {
              return { ok: false, error: "No active element for keypress" };
            }
            simulateKeypress(target, {
              key,
              code: typeof action.code === "string" ? action.code : undefined,
              ctrlKey: Boolean(action.ctrlKey),
              altKey: Boolean(action.altKey),
              shiftKey: Boolean(action.shiftKey),
              metaKey: Boolean(action.metaKey),
              repeat: Boolean(action.repeat),
              location: typeof action.location === "number" ? action.location : undefined,
            });
            return { ok: true, result: { xpath: buildXPath(target) } };
          }

          const batchSize = normalizeBatchSize(action.batch);
          if (batchSize > 0) {
            const elements = resolveElements(action.selector, action.selectorType).slice(0, batchSize);
            if (!elements.length) {
              return { ok: false, error: "Element not found" };
            }
            switch (type) {
              case "query":
                return {
                  ok: true,
                  result: {
                    items: elements.map((item) => ({ xpath: buildXPath(item) })),
                  },
                };
              case "click":
                elements.forEach((item) => simulateClick(item));
                return {
                  ok: true,
                  result: {
                    matched: elements.length,
                    items: elements.map((item) => ({ xpath: buildXPath(item) })),
                  },
                };
              case "scrollIntoView":
                elements.forEach((item) =>
                  item.scrollIntoView({ behavior: "smooth", block: "center" }),
                );
                return {
                  ok: true,
                  result: {
                    matched: elements.length,
                    items: elements.map((item) => ({ xpath: buildXPath(item) })),
                  },
                };
              case "input":
                elements.forEach((item) => {
                  simulateClick(item);
                  setInputValue(item, typeof action.value === "string" ? action.value : "");
                  simulateTyping(item, typeof action.value === "string" ? action.value : "");
                });
                return {
                  ok: true,
                  result: {
                    matched: elements.length,
                    items: elements.map((item) => ({ xpath: buildXPath(item) })),
                  },
                };
              case "keypress": {
                if (!action.key) {
                  return { ok: false, error: "Missing key for keypress" };
                }
                elements.forEach((item) => {
                  simulateClick(item);
                  simulateKeypress(item, {
                    key: typeof action.key === "string" ? action.key : "",
                    code: typeof action.code === "string" ? action.code : undefined,
                    ctrlKey: Boolean(action.ctrlKey),
                    altKey: Boolean(action.altKey),
                    shiftKey: Boolean(action.shiftKey),
                    metaKey: Boolean(action.metaKey),
                    repeat: Boolean(action.repeat),
                    location:
                      typeof action.location === "number" ? action.location : undefined,
                  });
                });
                return {
                  ok: true,
                  result: {
                    matched: elements.length,
                    items: elements.map((item) => ({ xpath: buildXPath(item) })),
                  },
                };
              }
              case "focus":
                elements.forEach((item) => (item as HTMLElement).focus());
                return {
                  ok: true,
                  result: {
                    matched: elements.length,
                    items: elements.map((item) => ({ xpath: buildXPath(item) })),
                  },
                };
              case "getText":
                return {
                  ok: true,
                  result: {
                    matched: elements.length,
                    items: elements.map((item) => ({
                      xpath: buildXPath(item),
                      text: (item as HTMLElement).innerText || "",
                    })),
                  },
                };
              case "getHtml":
                return {
                  ok: true,
                  result: {
                    matched: elements.length,
                    items: elements.map((item) => ({
                      xpath: buildXPath(item),
                      html: sanitizeHtmlContent(item),
                    })),
                  },
                };
              case "getAttribute":
                return {
                  ok: true,
                  result: {
                    matched: elements.length,
                    items: elements.map((item) => ({
                      xpath: buildXPath(item),
                      attribute: action.attribute || "",
                      value: action.attribute ? item.getAttribute(action.attribute) : null,
                    })),
                  },
                };
              case "getRect":
                return {
                  ok: true,
                  result: {
                    matched: elements.length,
                    items: elements.map((item) => {
                      const rect = item.getBoundingClientRect();
                      return {
                        xpath: buildXPath(item),
                        x: rect.x,
                        y: rect.y,
                        width: rect.width,
                        height: rect.height,
                        top: rect.top,
                        left: rect.left,
                        right: rect.right,
                        bottom: rect.bottom,
                      };
                    }),
                  },
                };
              default:
                return { ok: false, error: "Unsupported action type" };
            }
          }

          const element = resolveElement(action.selector, action.selectorType);
          if (!element) {
            return { ok: false, error: "Element not found" };
          }

          switch (type) {
            case "query":
              return {
                ok: true,
                result: {
                  xpath: buildXPath(element),
                },
              };
            case "click":
              simulateClick(element);
              return { ok: true, result: { xpath: buildXPath(element) } };
            case "scrollIntoView":
              element.scrollIntoView({ behavior: "smooth", block: "center" });
              return { ok: true, result: { xpath: buildXPath(element) } };
            case "input":
              simulateClick(element);
              setInputValue(element, typeof action.value === "string" ? action.value : "");
              simulateTyping(element, typeof action.value === "string" ? action.value : "");
              return { ok: true, result: { xpath: buildXPath(element) } };
            case "keypress": {
              if (!action.key) {
                return { ok: false, error: "Missing key for keypress" };
              }
              simulateClick(element);
              simulateKeypress(element, {
                key: typeof action.key === "string" ? action.key : "",
                code: typeof action.code === "string" ? action.code : undefined,
                ctrlKey: Boolean(action.ctrlKey),
                altKey: Boolean(action.altKey),
                shiftKey: Boolean(action.shiftKey),
                metaKey: Boolean(action.metaKey),
                repeat: Boolean(action.repeat),
                location: typeof action.location === "number" ? action.location : undefined,
              });
              return { ok: true, result: { xpath: buildXPath(element) } };
            }
            case "focus":
              (element as HTMLElement).focus();
              return { ok: true, result: { xpath: buildXPath(element) } };
            case "getText":
              return {
                ok: true,
                result: {
                  xpath: buildXPath(element),
                  text: (element as HTMLElement).innerText || "",
                },
              };
            case "getHtml":
              return {
                ok: true,
                result: {
                  xpath: buildXPath(element),
                  html: sanitizeHtmlContent(element),
                },
              };
            case "getAttribute":
              return {
                ok: true,
                result: {
                  xpath: buildXPath(element),
                  attribute: action.attribute || "",
                  value: action.attribute
                    ? element.getAttribute(action.attribute)
                    : null,
                },
              };
            case "getRect": {
              const rect = element.getBoundingClientRect();
              return {
                ok: true,
                result: {
                  xpath: buildXPath(element),
                  x: rect.x,
                  y: rect.y,
                  width: rect.width,
                  height: rect.height,
                  top: rect.top,
                  left: rect.left,
                  right: rect.right,
                  bottom: rect.bottom,
                },
              };
            }
            default:
              return { ok: false, error: "Unsupported action type" };
          }
        } catch (error) {
          return { ok: false, error: (error as Error).message };
        }
      });

      return { results };
    },
  );

  registerMessageHandler(
    "myz:evalInPage",
    async (payload: { code?: string }) => {
      const code = typeof payload?.code === "string" ? payload.code : "";
      if (!code.trim()) {
        return { ok: false, error: "Missing code" };
      }
      try {
        const runner = new Function(
          `"use strict"; return (async () => { ${code}\n})();`,
        );
        const result = await runner();
        return {
          ok: true,
          result: normalizeEvalResult(result),
        };
      } catch (error) {
        return { ok: false, error: (error as Error).message };
      }
    },
  );
}
