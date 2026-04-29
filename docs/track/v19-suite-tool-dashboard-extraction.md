# v19-suite-tool-dashboard-extraction 需求与计划

## Vision
- 让 `myz-suite-tool` 成为 `myz-annotator` 的 desktop version，优先提供“笔记 / 摘要管理闭环”。
- 将 `myz-annotator` dashboard 中可复用的 UI、状态模型与交互骨架抽取为宿主无关能力，后续可同时服务 Tauri desktop、浏览器扩展 dashboard，以及移动端扩展管理页。

## Background / Motivation
- `myz-annotator` dashboard 已具备较完整的记录浏览、设置、AI 配置与主题体验，但当前实现与 Chrome runtime、扩展消息层耦合。
- `myz-suite-tool` 已有 Tauri + Vue 的桌面壳，但页面仍以占位结构为主，尚未承接 annotator 的成熟能力。
- 如果继续分别演进 desktop、extension、mobile，会重复维护路由、布局、记录页和设置页，后续 Agent 集成成本会持续上升。

## Scope
- 清空 `myz-suite-tool` 现有业务逻辑、占位页、路由组织与本地状态实现，只保留最小 Tauri / Vite 启动骨架。
- 统一 `myz-annotator` dashboard 与 `myz-suite-tool` 的前端基础栈、依赖版本与 workspace 使用方式。
- 识别并抽取 dashboard 中“宿主无关”的能力：应用壳、导航、记录列表/详情、设置分组、主题、通用状态模型、通用视图模型。
- 为宿主相关能力建立适配层：Browser Extension Host、Tauri Host，并为移动端扩展页面预留第三类 Host。
- 第一阶段以“笔记 / 摘要管理闭环”为优先目标，覆盖记录浏览、筛选、详情、导入导出、基础设置。
- 为第二阶段 Agentic desktop 预留入口：AI Provider、Agent、MCP、Tool、Skill 的信息架构与桥接接口。

## Non-Goals
- 本阶段不重写 `myz-annotator` background/service worker 逻辑。
- 本阶段不一次性迁移全部 chat/agent 执行链路到 Tauri。
- 本阶段不交付 Edge mobile add-ons 或 Safari Mobile Extension 的完整发布包。
- 本阶段不引入新的跨端设计系统或重做品牌视觉。
- 本阶段不保留 `myz-suite-tool` 当前首页 / 监控 / 设置的既有占位信息架构。

## Data Model (schema-first)
- 继续以 `@myz/shared` 中的 `MyZRecord` 及相关 schema 作为笔记、高亮、摘要的统一记录模型，不创建平行记录结构。
- 新增宿主无关类型，建议落在 `packages/shared` 或新建跨端包中：
  - `HostKind`: `extension` | `tauri` | `mobile-extension`
  - `HostCapabilities`: 是否支持 runtime messaging、clipboard、local file access、window controls、background sync
  - `RecordRepository` 接口：`listRecords`、`getRecord`、`updateRecord`、`removeRecords`、`importRecords`、`exportRecords`
  - `SettingsRepository` 接口：`getSettings`、`updateSettings`
  - `ThemeRepository` 接口：`getTheme`、`setTheme`、`watchTheme`
  - `DashboardRouteMeta` / `NavigationSection`：统一导航与页面分组描述
- 约束：
  - 所有 UI 层仅依赖 repository 接口，不直接依赖 `chrome.*`、`navigator.clipboard`、`@tauri-apps/api`。
  - 宿主适配层负责把扩展消息、Tauri command、移动容器 API 映射为上述接口。

## UX / Flow
- Phase 0：统一依赖与工程骨架
  - 对齐 Vue / Vite / TypeScript / ESLint / Tailwind / Vue JSX / Pinia 版本。
  - 让 `myz-suite-tool` 接入 Pinia，并与 annotator 采用相同的路由与页面装配方式。
- Phase 1：抽取共享 shell 与 notes workspace
  - 抽出 AppShell、导航元数据、页面容器、空态/状态提示、主题能力。
  - 抽出记录列表、记录详情、筛选工具栏、导入导出入口。
- Phase 2：建立 Host Adapter
  - `annotator-extension-host`: 基于 `chrome.runtime` / `chrome.storage`
  - `suite-tool-tauri-host`: 基于 Tauri command / plugin / local persistence
  - `mobile-host`：先定义接口和受限能力矩阵，不立即发布
- Phase 3：为 Agentic desktop 预留扩展位
  - 保留 AI 设置路由结构，但先以配置管理为主，不强制迁入完整聊天运行时。

## Dependencies / Constraints
- 依赖模块：
  - `myz-annotator/src/dashboard`
  - `myz-annotator/src/shared`
  - `myz-suite-tool/src`
  - `packages/shared`
  - 后续可能新增 `packages/ui-shell` 或 `packages/notes-workspace`
- 约束：
  - `myz-annotator` 仍需保持浏览器扩展可运行。
  - Tauri 端不能直接复用任何依赖 `chrome.*` 的实现。
  - 移动端页面必须默认支持窄屏、触控、无 hover 的交互环境。
  - 可复用代码必须优先收敛到共享包，不能在两个 app 中复制粘贴演进。

## Acceptance Criteria
- Given `myz-suite-tool` 与 `myz-annotator` 同处 workspace，When 开始迁移，Then 两端使用同一组核心前端版本策略，并去除无必要的版本漂移。
- Given `myz-suite-tool` 进入重构，When 第一阶段启动实施，Then 当前 app 内的占位业务逻辑必须被移除，新的页面结构仅围绕共享 notes workspace 与宿主桥接重建。
- Given 共享 notes workspace 已接入，When 在 `myz-suite-tool` 打开记录列表，Then 页面不直接依赖 `chrome.runtime` 或 `chrome.storage`。
- Given 共享记录模型已落地，When 同一条 `MyZRecord` 在 extension 与 desktop 中展示，Then 标题、摘要、标签、来源与详情字段使用同一套 schema 与视图映射。
- Given 移动端 Host 未正式上线，When 在共享组件层审查实现，Then 所有关键页面均具备窄屏布局策略且不依赖 hover-only 交互。
- Given Agent 功能尚未完全迁入 desktop，When 完成第一阶段，Then AI/Agent 设置结构已可通过统一路由与 repository 接口继续扩展。
- Given annotator 仍需继续服务现有用户，When 抽取共享模块后，Then annotator dashboard 主路径功能不回退。

## Verification Plan
- `myz-annotator`: `npm run lint`、`npm run build`
- `myz-suite-tool`: `npm run lint`、`npm run build`
- 手动验证主路径：
  - extension dashboard 可进入高亮/笔记列表与设置页
  - suite tool 可进入 notes workspace，并能读取/更新记录仓储适配层
  - 窄屏宽度下导航、列表、详情布局不出现不可访问区域

## Risks / Rollback
- 风险：抽取过度会把扩展特有逻辑错误地推入共享层，导致桌面端与移动端都背上不必要依赖。
  - 回退：保持共享包只承载 schema、view model、shell、repository 接口；宿主实现继续各自保留。
- 风险：一次性迁移 chat/agent runtime 会放大范围。
  - 回退：第一阶段明确只迁 notes workspace 与 AI 配置骨架。
- 风险：移动端兼容若后置过久，桌面布局会固化为宽屏假设。
  - 回退：第一阶段即把断点、触控命中区、抽屉式导航纳入共享组件约束。

## Use Cases / Scenarios
- 主路径：桌面用户在 `myz-suite-tool` 中浏览笔记、高亮与 AI 摘要，按标签/站点筛选，并查看详情。
- 边界路径 1：扩展 dashboard 与桌面端读取同一条记录时，来源字段缺失，页面仍按统一 schema 正常回退展示。
- 边界路径 2：移动端窄屏下进入 notes workspace，侧边导航切换为抽屉或底部导航，列表和详情仍可访问。
- 失败路径：宿主 repository 初始化失败时，页面显示明确错误态与重试入口，而不是空白页。

## Boundary Conditions
- 空值：记录可能缺失 `summary`、`tags`、`sourceUrl`、`hostname`
- 数量：记录列表必须支持大量数据下的分页或渐进渲染策略
- 能力差异：mobile-host 不支持桌面窗口控制；extension-host 不支持本地文件系统直写
- 失败：Tauri command、extension messaging、同步接口均可能超时或无响应

## Proposed Extraction Strategy
- 推荐拆分为两层共享能力：
  1. `packages/shared`：继续承载 schema、通用类型、序列化与记录工具
  2. 新共享 UI/应用层包（建议 `packages/notes-workspace` 或 `packages/dashboard-core`）：
     - navigation meta
     - app shell / page container
     - notes workspace components
     - host-neutral stores / composables
     - repository interfaces
- `myz-annotator` 与 `myz-suite-tool` 仅保留宿主入口、桥接实现、路由装配与少量宿主特性。
- `myz-suite-tool` 先执行 hard reset，再作为共享包的第一个 Tauri 宿主接入样板，不沿用当前占位实现。

## Delivery Phases
- P0：清空 `myz-suite-tool` 现有业务逻辑，保留最小启动骨架
- P1：技术栈与 package 策略统一
- P2：共享 shell、主题、导航、Pinia 基础设施
- P3：记录仓储接口 + notes workspace 抽取
- P4：annotator / suite-tool 双宿主接入
- P5：移动端布局与交互约束补齐
- P6：AI/Agent 配置页迁移与 desktop 扩展位

## Open Questions
- `myz-suite-tool` 第一阶段的记录数据源是本地 Tauri 存储、sync-core、还是直接桥接 annotator 导出数据。
- 共享 UI 包是落在现有 `packages/shared` 继续扩展，还是新建独立包以避免数据层与视图层混杂。
- notes workspace 第一阶段是否包含“编辑摘要 / 新建摘要”能力，还是先只做浏览、筛选、导入导出闭环。
