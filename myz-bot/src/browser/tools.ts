import type { Tool } from "@modelcontextprotocol/sdk/types.js"
import type { ToolExecutionResult } from "@myz/ai-core/types"
import type { BrowserManager } from "./lifecycle"
import { validateUrl, validateJsExpression, validateSelector, sanitizeTextContent } from "./security"

function textBlock(text: string): ToolExecutionResult {
  return { content: [{ type: "text", text }] }
}

function errorBlock(text: string): ToolExecutionResult {
  return { content: [{ type: "text", text }], isError: true }
}

export function createBrowserTools(options: {
  browserManager: BrowserManager
}): { definitions: Tool[]; handlers: Record<string, (args: Record<string, unknown>) => Promise<ToolExecutionResult>> } {
  const { browserManager } = options

  const definitions: Tool[] = [
    {
      name: "BrowserOpen",
      description: "打开浏览器并导航到指定 URL。如果浏览器已经打开，则直接导航到新 URL。",
      inputSchema: {
        type: "object",
        required: ["url"],
        properties: {
          url: { type: "string", description: "要打开的 URL（必须是 http 或 https）" },
          waitUntil: {
            type: "string",
            enum: ["load", "domcontentloaded", "networkidle", "commit"],
            description: "等待页面加载到哪个阶段，默认 networkidle",
          },
        },
      },
    },
    {
      name: "BrowserNavigate",
      description: "在已打开的浏览器中导航到新 URL。",
      inputSchema: {
        type: "object",
        required: ["url"],
        properties: {
          url: { type: "string" },
          waitUntil: {
            type: "string",
            enum: ["load", "domcontentloaded", "networkidle", "commit"],
          },
        },
      },
    },
    {
      name: "BrowserClick",
      description: "点击页面上的元素。使用 CSS 选择器或文本选择器定位元素。",
      inputSchema: {
        type: "object",
        required: ["selector"],
        properties: {
          selector: { type: "string", description: "CSS 选择器或 Playwright 选择器" },
          timeoutMs: { type: "integer", description: "超时毫秒数，默认 10000" },
        },
      },
    },
    {
      name: "BrowserType",
      description: "在页面元素中输入文本。",
      inputSchema: {
        type: "object",
        required: ["selector", "text"],
        properties: {
          selector: { type: "string" },
          text: { type: "string", description: "要输入的文本" },
          clear: { type: "boolean", description: "输入前是否先清空，默认 true" },
          pressEnter: { type: "boolean", description: "输入后是否按回车，默认 false" },
          timeoutMs: { type: "integer" },
        },
      },
    },
    {
      name: "BrowserScreenshot",
      description: "截取当前页面的截图，返回 base64 编码的图片。",
      inputSchema: {
        type: "object",
        properties: {
          fullPage: { type: "boolean", description: "是否截取整个页面，默认 false（仅视口）" },
          selector: { type: "string", description: "仅截取某个元素（可选）" },
          quality: { type: "integer", description: "JPEG 质量 1-100，默认 80" },
        },
      },
    },
    {
      name: "BrowserEvaluate",
      description: "在当前页面上下文中执行 JavaScript 代码并返回结果。",
      inputSchema: {
        type: "object",
        required: ["expression"],
        properties: {
          expression: { type: "string", description: "要执行的 JavaScript 表达式" },
        },
      },
    },
    {
      name: "BrowserContent",
      description: "获取当前页面的内容（文本或 HTML）。",
      inputSchema: {
        type: "object",
        properties: {
          format: {
            type: "string",
            enum: ["text", "html"],
            description: "返回格式，默认 text",
          },
          selector: { type: "string", description: "仅获取某个元素的内容（可选）" },
        },
      },
    },
    {
      name: "BrowserClose",
      description: "关闭浏览器并释放资源。",
      inputSchema: {
        type: "object",
        properties: {},
      },
    },
  ]

  const handlers: Record<string, (args: Record<string, unknown>) => Promise<ToolExecutionResult>> = {
    BrowserOpen: async (args) => {
      try {
        const url = typeof args.url === "string" ? args.url.trim() : ""
        const urlCheck = validateUrl(url)
        if (!urlCheck.ok) return errorBlock(urlCheck.reason!)

        const waitUntil = typeof args.waitUntil === "string" ? args.waitUntil : "networkidle"
        const session = await browserManager.getSession()
        await session.page.goto(url, { waitUntil: waitUntil as any })
        return textBlock(`已打开: ${session.page.url()}`)
      } catch (error) {
        return errorBlock(`打开失败: ${(error as Error).message}`)
      }
    },

    BrowserNavigate: async (args) => {
      try {
        const url = typeof args.url === "string" ? args.url.trim() : ""
        const urlCheck = validateUrl(url)
        if (!urlCheck.ok) return errorBlock(urlCheck.reason!)

        const waitUntil = typeof args.waitUntil === "string" ? args.waitUntil : "networkidle"
        const session = await browserManager.getSession()
        await session.page.goto(url, { waitUntil: waitUntil as any })
        return textBlock(`已导航到: ${session.page.url()}`)
      } catch (error) {
        return errorBlock(`导航失败: ${(error as Error).message}`)
      }
    },

    BrowserClick: async (args) => {
      try {
        const selector = typeof args.selector === "string" ? args.selector.trim() : ""
        const selCheck = validateSelector(selector)
        if (!selCheck.ok) return errorBlock(selCheck.reason!)

        const timeoutMs = typeof args.timeoutMs === "number" ? args.timeoutMs : 10000
        const session = await browserManager.getSession()
        await session.page.locator(selector).first().click({ timeout: timeoutMs })
        return textBlock(`已点击: ${selector}`)
      } catch (error) {
        return errorBlock(`点击失败: ${(error as Error).message}`)
      }
    },

    BrowserType: async (args) => {
      try {
        const selector = typeof args.selector === "string" ? args.selector.trim() : ""
        const text = typeof args.text === "string" ? args.text : ""
        const selCheck = validateSelector(selector)
        if (!selCheck.ok) return errorBlock(selCheck.reason!)

        const clear = args.clear !== false
        const pressEnter = Boolean(args.pressEnter)
        const timeoutMs = typeof args.timeoutMs === "number" ? args.timeoutMs : 10000
        const session = await browserManager.getSession()
        const locator = session.page.locator(selector).first()
        if (clear) {
          await locator.fill("", { timeout: timeoutMs })
        }
        await locator.type(text, { timeout: timeoutMs })
        if (pressEnter) {
          await session.page.keyboard.press("Enter")
        }
        return textBlock(`已输入: ${text.slice(0, 100)}`)
      } catch (error) {
        return errorBlock(`输入失败: ${(error as Error).message}`)
      }
    },

    BrowserScreenshot: async (args) => {
      try {
        const session = await browserManager.getSession()
        const fullPage = Boolean(args.fullPage)
        const selector = typeof args.selector === "string" ? args.selector.trim() : ""
        const quality = typeof args.quality === "number"
          ? Math.max(1, Math.min(100, args.quality))
          : 80

        if (selector) {
          const selCheck = validateSelector(selector)
          if (!selCheck.ok) return errorBlock(selCheck.reason!)
          const element = session.page.locator(selector).first()
          const buffer = await element.screenshot({ type: "jpeg", quality })
          return {
            content: [
              { type: "text", text: `截图: ${selector}` },
              { type: "image", data: buffer.toString("base64"), mimeType: "image/jpeg" },
            ],
          }
        }

        const buffer = await session.page.screenshot({
          type: "jpeg",
          quality,
          fullPage,
        })
        const url = session.page.url()
        return {
          content: [
            { type: "text", text: `截图: ${url}${fullPage ? " (全页)" : ""}` },
            { type: "image", data: buffer.toString("base64"), mimeType: "image/jpeg" },
          ],
        }
      } catch (error) {
        return errorBlock(`截图失败: ${(error as Error).message}`)
      }
    },

    BrowserEvaluate: async (args) => {
      try {
        const expression = typeof args.expression === "string" ? args.expression.trim() : ""
        const exprCheck = validateJsExpression(expression)
        if (!exprCheck.ok) return errorBlock(exprCheck.reason!)

        const session = await browserManager.getSession()
        const result = await session.page.evaluate(expression)
        const text = typeof result === "string" ? result : JSON.stringify(result, null, 2)
        return textBlock(sanitizeTextContent(text))
      } catch (error) {
        return errorBlock(`执行失败: ${(error as Error).message}`)
      }
    },

    BrowserContent: async (args) => {
      try {
        const session = await browserManager.getSession()
        const format = typeof args.format === "string" ? args.format : "text"
        const selector = typeof args.selector === "string" ? args.selector.trim() : ""

        let content = ""
        if (selector) {
          const selCheck = validateSelector(selector)
          if (!selCheck.ok) return errorBlock(selCheck.reason!)
          const element = session.page.locator(selector).first()
          if (format === "html") {
            content = await element.innerHTML()
          } else {
            content = await element.innerText()
          }
        } else {
          if (format === "html") {
            content = await session.page.content()
          } else {
            content = await session.page.innerText("body")
          }
        }
        return textBlock(sanitizeTextContent(content))
      } catch (error) {
        return errorBlock(`获取内容失败: ${(error as Error).message}`)
      }
    },

    BrowserClose: async () => {
      try {
        await browserManager.close()
        return textBlock("浏览器已关闭")
      } catch (error) {
        return errorBlock(`关闭失败: ${(error as Error).message}`)
      }
    },
  }

  return { definitions, handlers }
}
