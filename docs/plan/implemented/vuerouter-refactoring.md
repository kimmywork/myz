# Dashboard + Settings Vue Router Refactoring Plan

## 背景与现状
- Dashboard 目前通过 `uiStore.panel` 在同一页面内切换「标注列表 / 设置」。`AppShell` 里条件渲染 `FilterToolbar` / `HighlightsPane` / `SettingsPane`。
- Settings 是单页纵向堆叠（导入 / 社区导入 / 同步 / AI），没有导航和分区切换。
- AI 设置是一个巨型 section，内部包含 Provider / Agent / MCP / Tools / Skills / Vector Search 等多个子区块。

## 目标
- 用 Vue Router 将 Dashboard 页面拆分为可路由的页面，避免依赖局部状态切换。
- Settings 改成带 Sidebar 的结构，并将每个 section 拆成独立路由。
- AI 设置的每一个子项也拆成独立路由。
- 保持现有数据/状态逻辑（Pinia store）不破坏现有功能。

## 路由结构设计（Dashboard）

> 采用 `createWebHashHistory`，确保在 Chrome extension 的 options page 中稳定工作。

```
/                          -> redirect /highlights
/highlights                -> HighlightsPage (FilterToolbar + HighlightsPane)
/settings                  -> SettingsLayout (redirect /settings/import)
  /settings/import         -> SettingsImportPage (ImportHighlightsSection)
  /settings/social         -> SettingsSocialPage (SocialImportSection)
  /settings/sync           -> SettingsSyncPage (SyncSection)
  /settings/ai             -> SettingsAiLayout (redirect /settings/ai/providers)
    /settings/ai/providers -> AiProvidersPage
    /settings/ai/agents    -> AiAgentsPage
    /settings/ai/mcp       -> AiMcpPage
    /settings/ai/tools     -> AiLocalToolsPage
    /settings/ai/skills    -> AiSkillsPage
    /settings/ai/vector    -> AiVectorSearchPage
```

## Settings Sidebar 结构

Sidebar 分组建议（路由与结构一致）：

- 数据导入
  - 导入标注（/settings/import）
  - 社区导入（/settings/social）
- 同步
  - 加密同步（/settings/sync）
- AI 助理
  - Provider / Models（/settings/ai/providers）
  - Agent 路由（/settings/ai/agents）
  - MCP 服务器（/settings/ai/mcp）
  - 本地 Tools（/settings/ai/tools）
  - Skills（/settings/ai/skills）
  - Vector Search（/settings/ai/vector）

Sidebar 组件建议：
- 根据 routes 的 meta 生成分组与条目，避免硬编码重复。
- 选中状态基于当前路由自动高亮。
- AI 子路由共用 `SettingsAiLayout` 顶部的开关栏（启用/禁用智能助理）。

## Settings 页面拆分方案

### 现有 section → 新页面映射
- ImportHighlightsSection → SettingsImportPage
- SocialImportSection → SettingsSocialPage
- SyncSection → SettingsSyncPage
- AiSettings → 拆分为多个页面（见下节）

### AI Settings 拆分细节
从 `AiSettings` 内部拆分为以下独立页面，每个页面保留原来的逻辑/交互：
- AiProvidersPage
  - Provider 列表 + Provider 编辑器 + 测试连接
- AiAgentsPage
  - Agent routing 配置
- AiMcpPage
  - MCP 服务器列表编辑
- AiLocalToolsPage
  - 本地 Tools 选择与保存
- AiSkillsPage
  - Skills 配置
- AiVectorSearchPage
  - Vector Search 配置

**共享逻辑建议**
- 把 `AiSettings` 中的状态/保存逻辑拆成 `useAiSettings()` composable 或按页面拆分 store 状态，以防重复加载/保存逻辑。
- `aiAssistantEnabled` 开关可放在 `SettingsAiLayout` 顶部，供所有 AI 子页面共用。

## Layout/组件结构调整

### AppShell
- 由条件渲染改为 `<RouterView />`，`RecordModal` 保持常驻。
- `FilterToolbar` 移入 `HighlightsPage` 内部。

### DashboardNavbar
- 使用 `RouterLink` 导航到 `/highlights` 与 `/settings`。
- 活跃状态基于 `useRoute()` 判断（例如 `route.path.startsWith('/settings')`）。

### SettingsLayout
- 结构：Header + Sidebar + `<RouterView />`。
- “返回标注”按钮改为跳转 `/highlights`。

## Store 与状态调整
- `uiStore.panel` / `showSettings` / `showHighlights` 替换为路由导航。
- `uiStore.view`（卡片/列表）保留。
- `uiStore.filters` / `modalState` / `renderHighlight` 等保持不变。

## 实施步骤（建议）
1. 引入 Vue Router 依赖 + 新增 router 文件。
2. 新建 `HighlightsPage` 与 `SettingsLayout`，完成 `/highlights` 与 `/settings/*` 路由。
3. 将现有 Settings sections 拆分为单独页面，并接入 Sidebar。
4. 拆分 `AiSettings` 成多个页面与共享逻辑。
5. 清理 `uiStore.panel` 的残留逻辑与旧切换按钮。

## 非 Dashboard 部分：Router 是否必要？

### Popup
- 现状：单一页面（搜索 + 列表 + 操作），逻辑集中，无多视图分区。
- 评估：引入 Router 价值不高，反而增加体积与复杂度。
- 结论：暂不引入 Router。

### Side Panel
- 现状：内部通过 `uiStore.view` 在 chat / history / related 之间切换。
- 评估：可以用路由表达，但当前页面层级不深、无强烈深链接需求；sidepanel 也并非用户会复制路径的场景。
- 结论：暂不引入 Router；若未来新增更多模块或需要 URL 级状态恢复再考虑。

## 风险与注意点
- Chrome extension options page 需要 hash history，避免刷新丢路由。
- AI 设置拆分后需避免重复保存逻辑和状态漂移。
- `RecordModal` 要确保仍能在新路由结构下使用（建议保持全局挂载）。

