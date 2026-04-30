import type { ToolExecutionResult } from "@myz/ai-core/types";
import type {
  ProviderToolCall,
  ProviderToolSpec,
} from "@myz/ai-core/providers/types";
import { desktopAgentHost } from "../../host/desktop";
import type { DesktopStoredSettings } from "../types/settings";

const DESKTOP_LOCAL_TOOL_SPECS: ProviderToolSpec[] = [
  {
    type: "function",
    function: {
      name: "List",
      description: "列出 workspace 内的目录和文件。",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "相对 workspace root 的目录路径，默认为 .",
          },
          depth: {
            type: "number",
            minimum: 0,
            maximum: 6,
            description: "递归深度，默认 2",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "Read",
      description: "读取 workspace 内文本文件内容。",
      parameters: {
        type: "object",
        required: ["path"],
        properties: {
          path: {
            type: "string",
            description: "相对 workspace root 的文件路径",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "Write",
      description: "在 workspace 内创建或覆盖文本文件。",
      parameters: {
        type: "object",
        required: ["path", "content"],
        properties: {
          path: {
            type: "string",
            description: "相对 workspace root 的文件路径",
          },
          content: {
            type: "string",
            description: "要写入的文本内容",
          },
          mode: {
            type: "string",
            description: "overwrite、append 或 create，默认 overwrite",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "Edit",
      description: "在 workspace 内按字符串查找并替换文本文件内容。",
      parameters: {
        type: "object",
        required: ["path", "find", "replace"],
        properties: {
          path: {
            type: "string",
            description: "相对 workspace root 的文件路径",
          },
          find: {
            type: "string",
            description: "待替换的原始文本",
          },
          replace: {
            type: "string",
            description: "替换后的文本",
          },
          replaceAll: {
            type: "string",
            description: "传入 true 时替换全部匹配",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "Glob",
      description: "按 glob 模式搜索 workspace 内的文件路径。",
      parameters: {
        type: "object",
        required: ["pattern"],
        properties: {
          pattern: {
            type: "string",
            description: "相对 workspace root 的 glob 模式，例如 notes/**/*.md",
          },
        },
      },
    },
  },
];

export const DESKTOP_LOCAL_TOOL_NAMES = DESKTOP_LOCAL_TOOL_SPECS.map(
  (tool) => tool.function.name,
);

function parseArgs(toolCall: ProviderToolCall): Record<string, unknown> {
  const rawArgs = toolCall.function.arguments;
  if (!rawArgs) {
    return {};
  }
  try {
    const parsed = JSON.parse(rawArgs);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function textResult(value: unknown): ToolExecutionResult {
  return {
    content: [
      {
        type: "text",
        text:
          typeof value === "string" ? value : JSON.stringify(value, null, 2),
      },
    ],
    data: value,
  };
}

export function getDesktopLocalToolSpecs(
  settings: DesktopStoredSettings,
): ProviderToolSpec[] {
  const enabled = new Set(settings.aiLocalTools.enabledToolNames || []);
  return DESKTOP_LOCAL_TOOL_SPECS.filter((tool) =>
    enabled.has(tool.function.name),
  );
}

export async function executeDesktopLocalToolCall(
  toolCall: ProviderToolCall,
): Promise<ToolExecutionResult> {
  const args = parseArgs(toolCall);

  switch (toolCall.function.name) {
    case "List": {
      const result = await desktopAgentHost.listWorkspace(
        typeof args.path === "string" ? args.path : undefined,
        typeof args.depth === "number" ? args.depth : undefined,
      );
      return textResult(result);
    }
    case "Read": {
      const path = typeof args.path === "string" ? args.path : "";
      if (!path.trim()) {
        throw new Error("Read 工具必须提供 path");
      }
      const result = await desktopAgentHost.readWorkspaceFile(path);
      return textResult(result);
    }
    case "Write": {
      const path = typeof args.path === "string" ? args.path : "";
      const content = typeof args.content === "string" ? args.content : "";
      if (!path.trim()) {
        throw new Error("Write 工具必须提供 path");
      }
      const result = await desktopAgentHost.writeWorkspaceFile({
        path,
        content,
        mode: typeof args.mode === "string" ? args.mode : undefined,
      });
      return textResult(result);
    }
    case "Edit": {
      const path = typeof args.path === "string" ? args.path : "";
      const find = typeof args.find === "string" ? args.find : "";
      const replace = typeof args.replace === "string" ? args.replace : "";
      if (!path.trim()) {
        throw new Error("Edit 工具必须提供 path");
      }
      if (!find) {
        throw new Error("Edit 工具必须提供 find");
      }
      const result = await desktopAgentHost.editWorkspaceFile({
        path,
        find,
        replace,
        replaceAll:
          args.replaceAll === true || args.replaceAll === "true"
            ? true
            : undefined,
      });
      return textResult(result);
    }
    case "Glob": {
      const pattern = typeof args.pattern === "string" ? args.pattern : "";
      if (!pattern.trim()) {
        throw new Error("Glob 工具必须提供 pattern");
      }
      const result = await desktopAgentHost.globWorkspace(pattern);
      return textResult(result);
    }
    default:
      throw new Error(`暂不支持的本地工具：${toolCall.function.name}`);
  }
}
