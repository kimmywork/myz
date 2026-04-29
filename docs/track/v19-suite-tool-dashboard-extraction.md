# v19-suite-tool-dashboard-extraction 需求与计划

## Vision
- 让 `@myz-suite/desktop` 成为 `myz-annotator` 的 desktop version，优先提供笔记与摘要管理闭环。
- 以 Tauri 为桌面宿主，后续承接 Agentic workflow，而不是继续维护一套独立占位应用。

## Scope
- 清空 `@myz-suite/desktop` 现有前端占位逻辑与 Tauri MCP/runtime 逻辑。
- 统一 `@myz-suite/desktop` 与 `myz-annotator` 的前端基础栈和 workspace 依赖策略。
- 规划并迁移共享 dashboard shell、notes workspace、宿主适配层。
- 为 desktop 宿主落地本地文件存储与同步能力适配，而不是复用 extension background 存储。
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

## Delivery Phases
- P0：清空 `@myz-suite/desktop` 现有逻辑，保留最小启动骨架
- P1：统一前端依赖与 package 策略
- P2：定义 host interfaces，明确本地文件仓储与 sync adapters
- P3：抽取共享 shell、导航与 notes workspace
- P4：接入 extension / tauri / mobile-extension host adapters
- P4：补齐 Agent 与 AI 设置扩展位

## Change Log
- 2026-04-29：移除 `@myz-suite/desktop` 旧前端路由、页面、设置占位组件，以及 Tauri MCP/runtime 逻辑；建立最小重构入口页。
- 2026-04-29：确认 desktop 宿主采用本地文件存储，并同步适配 sync 功能。
- 2026-04-29：新增 `@myz/dashboard-core`，统一定义 record/settings/theme/sync host interfaces 与 extension/desktop/mobile-extension capability presets。
- 2026-04-29：新增 `@myz/notes-workspace`，抽出共享 notes workspace shell 与 records/settings/sync 路由骨架，并让 `@myz-suite/desktop` 直接消费该共享包。
- 2026-04-29：为 `@myz-suite/desktop` 接入 Tauri 本地文件 record/settings/theme/sync adapters，并让共享 notes workspace 读取真实本地数据。
- 2026-04-29：为 `myz-annotator` 增加 extension host adapter，复用共享 dashboard host contracts；当前未切换现有 dashboard UI，仅先建立 bridge。
