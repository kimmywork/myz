import type { Tool } from "@modelcontextprotocol/sdk/types.js";

/**
 * Local tools available to the AI assistant.
 *
 * Notes:
 * - Keep this file side-effect free so it can be safely imported by UI code.
 * - Tool implementations live in `local.ts`.
 */
export const LOCAL_TOOL_DEFINITIONS: Tool[] = [
  {
    name: "SelectTools",
    description:
      "当你需要调用工具但不确定该用哪些工具时，先调用这个工具：用中文描述你的信息需求，系统会选择并启用最相关的工具（在后续 tool call 中可用），以减少工具定义占用的 token。",
    inputSchema: {
      type: "object",
      required: ["need"],
      properties: {
        need: {
          type: "string",
          description: "用中文描述你需要通过工具完成的具体需求/目标。",
        },
      },
    },
  },
  {
    name: "PromptingAgent",
    description:
      "子任务代理：自动组装提示词并执行一次性任务，可选择工具与技能，返回模型结果。",
    inputSchema: {
      type: "object",
      required: ["prompt"],
      properties: {
        prompt: {
          type: "string",
          description: "子任务目标或需要处理的文本。",
        },
        system: {
          type: "string",
          description: "额外系统提示（可选）。",
        },
        toolNames: {
          type: "array",
          items: { type: "string" },
          description: "允许使用的工具名称列表（可选，默认自动选择）。",
        },
        skillNames: {
          type: "array",
          items: { type: "string" },
          description: "允许使用的技能名称列表（可选，默认自动选择）。",
        },
        outputFormat: {
          type: "string",
          enum: ["text", "json"],
          default: "text",
          description: "期望输出格式（默认 text）。",
        },
        maxOutputTokens: {
          type: "integer",
          minimum: 64,
          maximum: 2048,
          description: "最大输出 tokens（可选）。",
        },
      },
    },
  },
  {
    name: "WebSearch",
    description:
      "通过浏览器打开搜索引擎页面进行网页搜索，并返回前几条结果（标题/链接/摘要），需要结合 WebFetch 一起使用。",
    inputSchema: {
      type: "object",
      required: ["query"],
      properties: {
        query: {
          type: "string",
          description: "搜索关键词。",
        },
        engine: {
          type: "string",
          enum: ["bing", "google"],
          default: "bing",
          description: "搜索引擎（默认 bing）。",
        },
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 10,
          default: 5,
          description: "返回的搜索结果数量上限，默认 5。",
        },
      },
    },
  },
  {
    name: "WebFetch",
    description:
      "通过浏览器打开指定 URL，启发式提取网页主体内容详情（适用于访问搜索结果详情并进一步阅读/总结）。",
    inputSchema: {
      type: "object",
      required: ["url"],
      properties: {
        url: {
          type: "string",
          description: "要访问的网页 URL（仅支持 http/https）。",
        },
        maxChars: {
          type: "integer",
          minimum: 1000,
          maximum: 60000,
          default: 15000,
          description: "返回内容最大字符数（默认 15000）。",
        },
      },
    },
  },
  {
    name: "CodeExecution",
    description:
      "在扩展沙箱 iframe 中执行 JavaScript 代码并返回结果（无扩展权限，适合轻量计算/文本处理）。",
    inputSchema: {
      type: "object",
      required: ["code"],
      properties: {
        code: {
          type: "string",
          description: "要执行的 JavaScript 代码（建议返回表达式结果）。",
        },
        timeoutMs: {
          type: "integer",
          minimum: 100,
          maximum: 5000,
          default: 1000,
          description: "执行超时时间（毫秒），默认 1000。",
        },
        maxResultChars: {
          type: "integer",
          minimum: 200,
          maximum: 8000,
          default: 2000,
          description: "返回结果最大字符数，超出将截断。",
        },
      },
    },
  },
  {
    name: "List",
    description:
      "列出虚拟文件系统中的文件列表（用于管理记忆）；支持 /skills 路径查看已启用的技能文件。",
    inputSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "目录路径（相对路径，默认根目录）。",
        },
        recursive: {
          type: "boolean",
          description: "是否递归列出（默认 true）。",
        },
      },
    },
  },
  {
    name: "Read",
    description:
      "读取虚拟文件系统中的文件内容；支持 /skills/{skill}/... 路径读取技能文件。",
    inputSchema: {
      type: "object",
      required: ["path"],
      properties: {
        path: {
          type: "string",
          description: "文件路径（相对路径）。",
        },
        start_line: {
          type: "integer",
          minimum: 1,
          description: "起始行（1-based，可选）。",
        },
        end_line: {
          type: "integer",
          minimum: 1,
          description: "结束行（1-based，可选）。",
        },
      },
    },
  },
  {
    name: "Write",
    description:
      "写入虚拟文件系统中的文件内容；未指定行号则覆盖，指定行号则插入（/skills 路径不可写）。",
    inputSchema: {
      type: "object",
      required: ["path", "content"],
      properties: {
        path: {
          type: "string",
          description: "文件路径（相对路径）。",
        },
        content: {
          type: "string",
          description: "要写入的文本内容。",
        },
        line: {
          type: "integer",
          minimum: 1,
          description: "插入的起始行（1-based，可选）。",
        },
        append: {
          type: "boolean",
          description: "是否追加到末尾（默认 false）。",
        },
      },
    },
  },
  {
    name: "Edit",
    description: "在虚拟文件系统中精确替换文本内容（/skills 路径不可写）。",
    inputSchema: {
      type: "object",
      required: ["path", "old_string", "new_string"],
      properties: {
        path: {
          type: "string",
          description: "文件路径（相对路径）。",
        },
        old_string: {
          type: "string",
          description: "要被替换的原文本。",
        },
        new_string: {
          type: "string",
          description: "替换后的新文本。",
        },
        replace_all: {
          type: "boolean",
          description: "是否替换所有匹配（默认 false）。",
        },
      },
    },
  },
  {
    name: "Glob",
    description:
      "按 glob 模式匹配虚拟文件系统中的文件路径（支持 /skills/...）。",
    inputSchema: {
      type: "object",
      required: ["pattern"],
      properties: {
        pattern: {
          type: "string",
          description: "glob 模式（如 **/*.md）。",
        },
      },
    },
  },
  {
    name: "Task",
    description: "任务管理工具（仅用于 Superpower Mode）。",
    inputSchema: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["init", "update", "get", "list", "complete_all"],
          description: "任务动作类型。",
        },
        payload: {
          type: "object",
          description:
            "可选的统一载荷（推荐）。若提供，优先使用 payload 内字段。",
          additionalProperties: true,
        },
        goal: {
          type: "string",
          description: "当前任务目标或用户需求。",
        },
        assumptions: {
          type: "array",
          description: "计划假设列表。",
          items: { type: "string" },
        },
        summary: {
          type: "string",
          description: "计划级摘要或阶段进展说明。",
        },
        outcome: {
          type: "string",
          description: "计划或任务的最终结果说明。",
        },
        tasks: {
          type: "array",
          description: "任务列表。",
          items: {
            type: "object",
            required: ["title"],
            properties: {
              title: { type: "string", description: "任务标题。" },
              priority: {
                type: "string",
                enum: ["low", "medium", "high"],
                description: "任务优先级。",
              },
              owner: {
                type: "string",
                enum: [
                  "planner",
                  "executor",
                  "research",
                  "automation",
                  "review",
                ],
                description: "任务角色归属。",
              },
              blockedBy: {
                type: "array",
                items: { type: "string" },
                description: "阻塞该任务的任务 ID 列表。",
              },
              blocks: {
                type: "array",
                items: { type: "string" },
                description: "该任务阻塞的任务 ID 列表。",
              },
              category: {
                type: "string",
                enum: ["quick", "research", "automation", "reasoning"],
                description: "任务类别。",
              },
              skills: {
                type: "array",
                items: { type: "string" },
                description: "建议技能列表。",
              },
              summary: {
                type: "string",
                description: "任务摘要或完成标准。",
              },
              notes: {
                type: "array",
                items: { type: "string" },
                description: "任务备注或执行观察。",
              },
              outcome: {
                type: "string",
                description: "任务完成后的结果说明。",
              },
            },
          },
        },
        taskId: {
          type: "string",
          description: "任务 ID（task 级更新时使用）。",
        },
        status: {
          type: "string",
          description: "状态值（task 或 plan 级 update 用）。",
          enum: ["pending", "in_progress", "done", "blocked", "planning", "executing"],
        },
        patch: {
          type: "object",
          description: "任务或计划的补丁字段（update 用）。",
          additionalProperties: true,
        },
        currentTaskId: {
          type: "string",
          description: "更新当前任务 ID（仅计划级更新）。",
        },
        note: {
          type: "string",
          description: "追加一条任务备注。",
        },
        onlyUnblocked: {
          type: "boolean",
          description: "list 动作：仅返回未阻塞任务（默认 true）。",
        },
        statusList: {
          type: "array",
          description: "list 动作：按状态过滤。",
          items: { type: "string" },
        },
      },
    },
  },
  {
    name: "ListTabs",
    description: "获取当前窗口的标签页列表（仅用于 Superpower Mode）。",
    inputSchema: {
      type: "object",
      properties: {
        currentWindow: {
          type: "boolean",
          description: "仅返回当前窗口标签页（默认 true）。",
        },
      },
    },
  },
  {
    name: "GotoPage",
    description: "在当前标签页访问指定 URL（仅用于 Superpower Mode）。",
    inputSchema: {
      type: "object",
      required: ["url"],
      properties: {
        tabId: { type: "integer", description: "标签页 ID（可选）。" },
        url: { type: "string", description: "需要访问的完整 URL。" },
      },
    },
  },
  {
    name: "NewTab",
    description: "打开新标签页访问指定 URL（仅用于 Superpower Mode）。",
    inputSchema: {
      type: "object",
      required: ["url"],
      properties: {
        url: { type: "string", description: "需要访问的完整 URL。" },
        active: {
          type: "boolean",
          description: "是否激活新标签页（默认 true）。",
        },
      },
    },
  },
  {
    name: "ActivateTab",
    description: "激活指定标签页（仅用于 Superpower Mode）。",
    inputSchema: {
      type: "object",
      required: ["tabId"],
      properties: {
        tabId: { type: "integer", description: "标签页 ID。" },
      },
    },
  },
  {
    name: "RunDomActions",
    description: "在当前标签页执行 DOM 操作（仅用于 Superpower Mode）。",
    inputSchema: {
      type: "object",
      required: ["actions"],
      properties: {
        tabId: { type: "integer", description: "标签页 ID（可选）。" },
        truncate: {
          type: "boolean",
          default: false,
          description: "是否截断 tool 返回内容（默认 false）。",
        },
        actions: {
          type: "array",
          description: "DOM 操作列表。",
          items: {
            type: "object",
            required: ["type"],
            properties: {
              type: {
                type: "string",
                enum: [
                  "query",
                  "click",
                  "scrollIntoView",
                  "scrollBy",
                  "input",
                  "keypress",
                  "focus",
                  "getText",
                  "getHtml",
                  "getAttribute",
                  "getRect",
                  "captureViewport",
                  "queryViewport",
                  "elementFromPoint",
                ],
              },
              selector: { type: "string", description: "CSS / XPath 选择器。" },
              selectorType: {
                type: "string",
                enum: ["css", "xpath"],
                description: "选择器类型（默认 css）。",
              },
              batch: {
                type: ["integer", "boolean"],
                description:
                  "批量匹配数量（可选；>1 或 true 时对多个元素执行）。",
                minimum: 1,
                maximum: 50,
              },
              value: { type: "string", description: "输入值或参数。" },
              key: { type: "string", description: "按键值（keypress）。" },
              code: {
                type: "string",
                description: "按键 code（keypress，可选）。",
              },
              ctrlKey: {
                type: "boolean",
                description: "Ctrl 修饰键（keypress）。",
              },
              altKey: {
                type: "boolean",
                description: "Alt 修饰键（keypress）。",
              },
              shiftKey: {
                type: "boolean",
                description: "Shift 修饰键（keypress）。",
              },
              metaKey: {
                type: "boolean",
                description: "Meta/Command 修饰键（keypress）。",
              },
              repeat: {
                type: "boolean",
                description: "重复按键（keypress）。",
              },
              location: {
                type: "number",
                description: "按键位置（keypress，可选）。",
              },
              attribute: {
                type: "string",
                description: "属性名（getAttribute）。",
              },
              scrollTop: {
                type: "number",
                description: "滚动偏移 Y（scrollBy）。",
              },
              scrollLeft: {
                type: "number",
                description: "滚动偏移 X（scrollBy）。",
              },
              x: {
                type: "number",
                description: "视口坐标 X（elementFromPoint）。",
              },
              y: {
                type: "number",
                description: "视口坐标 Y（elementFromPoint）。",
              },
              limit: {
                type: "number",
                description: "返回元素数量上限（queryViewport）。",
              },
              quality: {
                type: "number",
                description:
                  "截图质量（0-100，仅 jpeg；默认 70；普通屏缩放至约 0.4，高分屏缩放至 0.25）。",
              },
            },
          },
        },
      },
    },
  },
  {
    name: "GetPageContext",
    description: "获取当前标签页的页面上下文（仅用于 Superpower Mode）。",
    inputSchema: {
      type: "object",
      properties: {
        tabId: { type: "integer", description: "标签页 ID（可选）。" },
        includeContent: {
          type: "boolean",
          description: "是否包含正文内容（默认 true）。",
        },
      },
    },
  },
  {
    name: "EvalInPage",
    description:
      "在页面上下文执行 JS 代码并返回结果（仅用于 Superpower Mode；可能受页面 CSP 限制）。",
    inputSchema: {
      type: "object",
      required: ["code"],
      properties: {
        tabId: { type: "integer", description: "标签页 ID（可选）。" },
        code: {
          type: "string",
          description: "需要执行的 JS 代码字符串。",
        },
        truncate: {
          type: "boolean",
          description: "是否截断 tool 返回内容（默认 true）。",
        },
      },
    },
  },
];

export const LOCAL_TOOL_NAMES = LOCAL_TOOL_DEFINITIONS.map((tool) => tool.name);

export const SUPERPOWER_TOOL_NAMES = [
  "Task",
  "PromptingAgent",
  "ListTabs",
  "ActivateTab",
  "GotoPage",
  "NewTab",
  "RunDomActions",
  "GetPageContext",
  "EvalInPage",
];
