# v19-suite-tool-dashboard-extraction 需求与计划

## Vision
- 让 `@myz-suite/desktop` 成为 `myz-annotator` 的 desktop version，优先提供笔记与摘要管理闭环。
- 以 Tauri 为桌面宿主，后续承接 Agentic workflow，而不是继续维护一套独立占位应用。

## Scope
- 清空 `@myz-suite/desktop` 现有前端占位逻辑与 Tauri MCP/runtime 逻辑。
- 统一 `@myz-suite/desktop` 与 `myz-annotator` 的前端基础栈和 workspace 依赖策略。
- 规划并迁移共享 dashboard shell、highlights、chat、settings、宿主适配层。
- 为 desktop 宿主落地本地文件存储与同步能力适配，而不是复用 extension background 存储。
- 为 desktop 宿主落地 chat 的本地会话存储与 desktop-native runtime，而不是保留 extension-only chat bridge。
- 在共享层中预留移动端窄屏与触控约束。

## Non-Goals
- 本阶段不保留 `@myz-suite/desktop` 旧首页、监控、设置的信息架构。
- 本阶段不迁入完整 chat runtime 或 agent execution flow。
- 本阶段不交付 mobile extension 成品包。

## Acceptance Criteria
- `@myz-suite/desktop` 不再保留旧的前端页面树与 Tauri MCP/runtime 逻辑。
- app 仅保留最小 Tauri + Vue 启动骨架，能继续承接共享 workspace。
- 后续共享层设计以 `MyZRecord` 和宿主接口为中心，不再直接依赖旧占位结构。
- desktop 宿主通过本地文件仓储读取和写入记录、设置与主题数据，不直接依赖 extension background 存储。
- desktop 宿主具备与 extension 等价的同步适配入口，sync 不再是 extension-only 能力。
- `@myz-suite/desktop` 提供与 annotator dashboard 对齐的主导航与主页面结构，至少覆盖 highlights、chat、settings。
- desktop chat 使用本地会话存储与 desktop-native runtime，不依赖 `chrome.storage`、`chrome.runtime.onMessage` 或 extension sidepanel storage。

## Delivery Phases
- P0：清空 `@myz-suite/desktop` 现有逻辑，保留最小启动骨架
- P1：统一前端依赖与 package 策略
- P2：定义 host interfaces，明确本地文件仓储与 sync adapters
- P3：迁移 dashboard shell、导航与 highlights 主路径
- P4：迁移 settings 全部分组与 AI 设置页
- P5：迁移 chat UI，并替换为 desktop-native runtime / local conversation storage
- P6：接入 extension / tauri / mobile-extension host adapters 并补齐移动端约束

## Change Log
- 2026-04-29：移除 `@myz-suite/desktop` 旧前端路由、页面、设置占位组件，以及 Tauri MCP/runtime 逻辑；建立最小重构入口页。
- 2026-04-29：确认 desktop 宿主采用本地文件存储，并同步适配 sync 功能。
- 2026-04-29：新增 `@myz/dashboard-core`，统一定义 record/settings/theme/sync host interfaces 与 extension/desktop/mobile-extension capability presets。
- 2026-04-29：新增 `@myz/notes-workspace`，抽出共享 notes workspace shell 与 records/settings/sync 路由骨架，并让 `@myz-suite/desktop` 直接消费该共享包。
- 2026-04-29：为 `@myz-suite/desktop` 接入 Tauri 本地文件 record/settings/theme/sync adapters，并让共享 notes workspace 读取真实本地数据。
- 2026-04-29：为 `myz-annotator` 增加 extension host adapter，复用共享 dashboard host contracts；当前未切换现有 dashboard UI，仅先建立 bridge。
- 2026-04-29：调整迁移目标，明确 desktop 必须承接 annotator 的完整 dashboard UI，包括 highlights、settings 与 chat；chat 同步切到 desktop-native runtime 与本地会话存储。
- 2026-04-30：新增 host feature presets，作为 dashboard 的宿主级功能开关；desktop 默认隐藏社区导入等 extension-only 能力，并修正 desktop `<select>` 控件视觉样式。
- 2026-04-29：完成 `@myz-suite/desktop` chat slice：`/chat` 接入真实聊天页、会话列表与消息组件；会话/消息持久化改为 Tauri app data JSON；AI 请求改为 desktop 端直接读取本地 AI 设置并通过 provider 客户端流式返回，不再依赖 extension messaging 或 sidepanel storage。
- 2026-04-30：为 desktop chat 增加本地 Agent 基础约束：首次进入时自动创建 `~/.myz-desktop/workspace` 与默认 `AGENTS.md`；chat runtime 会把该 workspace 作为默认上下文，并把 Agent 工作范围限制为该根目录；同时新增 desktop-only persona / role prompt 配置。
- 2026-04-30：为 desktop chat 接入首批本地 workspace tools（`List` / `Read` / `Write` / `Edit` / `Glob`），provider tool-calling 结果会直接回写到 chat 消息流；同时为 Tauri workspace 命令补充 Rust 单测，覆盖根目录约束、文件读写、编辑、列表、glob 与越界拒绝路径。
- 2026-04-30：修正 desktop AI settings 分叉：恢复 Provider 模型列表的 `/models` 加载按钮与 catalog 状态；desktop Agent 路由仅保留 Conversation；同步修正一批 Provider / Model 控件的 light/dark 文本与按钮样式。
- 2026-04-30：将桌面模块目录从 `myz-suite-tool/` 改名为 `myz-desktop/`，同步更新 workspace / linked project / 直接文档引用；新增 `@myz/dashboard-ai-settings`，先抽出共享的 AI settings 基础 UI（`ToggleSwitch`、`AiHeadersEditor`、`AiModelListEditor`、`AiProviderList`、`providerCatalog`、`factories`），并让 desktop 与 annotator 通过 thin re-export 共享这一层实现。
