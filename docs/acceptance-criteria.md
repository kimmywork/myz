## 当前自动化测试覆盖（快照：2025-10-30）

在 `extension/tests/extension` 目录下现有的 Playwright 测试文件（已存在并在本地进行了执行）：
- `highlight-toolbar.spec.js`
  - 高亮工具栏在选区出现（AC-01）
- `highlight-apply-and-persistence.spec.js`
  - 应用高亮并在重载后持久化（AC-02 / AC-03）
  - 删除高亮并验证 DOM 更新（AC-05）
- `popup.spec.js`
  - Popup 中展示保存条目并复制到剪贴板（AC-04）
- `dashboard.spec.js`
  - 列表 / 删除 / 导出（包含导出后不包含已删项）
  - 编辑 / 降级 / 导入（API 导入与文件导入）
  - Modal 标签与颜色编辑检查
  - 批量导入、搜索过滤与主机过滤
  - 无限滚动 sentinel 行为测试
- `complex-fixture.spec.js`
  - 在复杂 DOM（表格、代码块、details、重复行等）中创建高亮并验证持久化
  - 导出 Markdown 中包含代码片段与注释的验证
- `screenshot.spec.js`
  - 截图工具端到端：在选区上触发 capture，并使用 Playwright 的 download 事件断言下载发生

总结：当前测试覆盖了本文档 P0（AC-01/02/03/05）和多数 P1 用例（AC-04/06 的关键路径）、以及若干 P2/扩展场景（复杂页面、批量导入、无限滚动、导出格式）。

## 覆盖缺口 / 推荐新增测试（优先级排序）

下面列出我在对比当前 `extension/tests/extension` 后建议新增或明确化的用例，便于把验收文档（AC）和自动化测试保持一致：

1) iframe 内选择（AC-07） — 状态：未覆盖
  - 为什么：目前没有明确的 iframe 测试。如果扩展计划支持跨 iframe 的选区/高亮，此用例应自动化；否则在文档中标记为 N/A。
  - 建议：新增一个带 sandbox iframe 的 fixture，并设计一个 skipable 测试（若实现为 N/A，可将测试标记为 skip 并在文档中备注）。

2) LogSeq 同步 / 集成相关（部分在 docs 提到但未自动化）
  - 为什么：LogSeq 同步属于集成测试（依赖外部 HTTP API 与 token）。当前测试标记为可选/集成，但并未有自动化实现。
  - 建议：把它标记为集成套件（与 CI 分离）；对于单元级验证，模拟 `callLogseq` 的响应并在 background 层添加可注入的 stub，以进行快速验证。

3) 捕获（截图）路径的确定性与边缘情况
  - 现状：已添加 `screenshot.spec.js` 并迁移为使用 Playwright 的 `page.waitForEvent('download')`，这更可靠。但在 CI 上需要确保 headful Chromium 与下载许可/路径配置（见下面 CI 小节）。
  - 建议：增加一条断言使用 `download.saveAs()` 将下载保存到临时位置并对文件头检查（例如确认 PNG 魔数），以验证内容而非仅检查事件发生。

4) 服务工作线程 (service worker) 覆盖及 stub 灰度策略
  - 为什么：测试中有对 service worker 的 CDP 覆盖尝试（覆盖 `chrome.tabs.captureVisibleTab`），但这属于 best-effort。若想更稳定，可在测试构建中启用一个 test-mode（background 返回固定 data URL），或在 test helper 中提供一个可注入的 background stub。
  - 建议：在 `launch-extension` helper 或 CI 构建管线中提供 `TEST_MODE=1`（或将 background 在测试环境下额外导出一个小的 stub 文件），以保障在 CI / 无头环境中 capture 路径稳定。

5) 导入错误/冲突和回退策略（边界条件）
  - 为什么：现有测试覆盖导入成功路径，但未覆盖导入冲突、格式错误、部分失败回滚等。
  - 建议：添加导入失败与部分成功的单元测试（在 dashboard 测试中模拟 `myz:importHighlights` 返回失败、或上传损坏 JSON），验证 UI 的错误提示与回退行为。

6) 多标签/跨窗口同步（AC-09） — 状态：部分覆盖
  - 为什么：文档建议做跨标签同步（监听 storage changes）。当前没有明确自动化跨 tab 的 test 来验证实时更新（大多通过 reload 验证持久化）。
  - 建议：添加一个测试打开两个 tab、在一个 tab 用 runtime API 保存 highlight，另一个 tab 监听并验证 update 或在短时间内 reload 时能看到新记录。

7) 导出 Markdown 精确性（代码块、注释、颜色元数据）
  - 现状：`complex-fixture.spec.js` 验证了导出中包含代码相关片段与注释，但对 Markdown 格式边界（如 pre 内的语法高亮 spans 被移除、LogSeq 元数据的 single-colon 规则）没有逐字比较。
  - 建议：对导出文件做更严格的断言集合（检测 fenced codeblocks、未包含不应出现的 color 元信息、检测多行注释的换行保真）。

8) 性能 / 大数据集场景（可选）
  - 为什么：批量导入测试导入了 120 条记录并验证后端状态，但未对 UI 响应时间、内存占用或分页效率做 SLA 级别断言。
  - 建议：创建负载/性能标记测试（非必要作为功能测试），并在 CI 的 nightly 或专门 performance job 中运行。

## CI 与 Playwright 运行建议（为保证截图/下载和 headful 交互在 CI 上可靠）

- Playwright 的下载 API（`page.waitForEvent('download')`）已被用于截图测试，这比观察页面 click 更可靠。
- CI 必须运行 headful Chromium（或使用 Playwright 官方 Docker 镜像 / Playwright Action）以支持真实扩展 API 和 UI 交互。
  - 推荐：使用 Playwright 官方 action（或 playwright/devcontainers / playwright Docker image）并启用 headed mode +虚拟显示（如果在 Linux runner 上）。
- 在 CI workflow 中启用 artifact 收集（trace、video、service-worker / background console logs、Playwright trace files），以便定位偶发性失败。
- 在 CI 中执行测试前确保扩展已构建（`npm run build` 输出到 `extension/dist`），或者调整 `launch-extension` helper 以接受源码目录并在运行时做 minimal transformation。

## 文档变更小结

- 我将本文件中“推荐的 Playwright 测试清单”更新为反映实际存在的测试文件名与覆盖点，并新增“当前自动化测试覆盖”和“覆盖缺口 / 推荐新增测试”两个节，便于追踪缺失的用例与 CI 要求。
- 后续我可以：
  - 将这些新增的高优先缺口逐条转为 Playwright spec（先自动化 AC-07 / 导入失败 / service-worker stub 路径），或者
  - 将 CI workflow 补强（启用 Playwright action、收集 artifacts、确保 headful 模式）——取决于你优先级。

# Acceptance criteria and user journeys — MyZ highlighter extension

更新时间：2025-10-30

本文档列出对 `extension/` 下高亮标注 Chrome 插件的用户旅程、明确的验收条件，以及这些验收条件如何映射到 Playwright 自动化测试用例。

目标读者：开发者、测试工程师和产品负责人。

说明：每个测试用例包含：ID、用户故事（简短）、前置条件、步骤、期望结果、备注，以及推荐的 Playwright 测试名称。

---

## 测试环境与准备

- 浏览器：Chrome (通过 Playwright 支持的 Chromium) 并以 unpacked extension 形式加载 `extension/` 构建输出（或源码，取决于测试方式）。
- 测试页面：默认使用 `https://kimleo.net/blank/myz-test.html`（示例页面），以及可能的本地 fixture 页面 `tests/fixtures/complex-highlight-test.html`。
- 测试账号/同步：默认不依赖外部服务；若涉及 LogSeq/服务器同步，标记为可选/集成测试。

注意：Playwright 测试应在干净的用户数据目录中运行，以避免已有的扩展状态或 storage 干扰。

---

## 高优先级用户旅程与验收标准

1. 作为一个用户，我希望能选中页面文本并看到浮动标注工具栏，这样我可以创建高亮。

   - ID: AC-01
   - 前置条件：打开包含可选中文本的测试页面（例如 `https://kimleo.net/blank/myz-test.html`）。扩展已加载并启用。
   - 步骤：
     1. 在页面中选中一段文本。
     2. 观察页面上是否出现浮动工具栏（Toolbar）。
   - 期望结果：
     - 工具栏在选区附近可见（可通过可见性/DOM 查询断言）。
     - 工具栏包含至少一个高亮样式按钮（如颜色/下划线/波浪）。
   - Playwright 测试名：highlight_toolbar_shows_on_selection

2. 作为一个用户，我希望在工具栏中选择样式后，页面被相应地高亮显示。

   - ID: AC-02
   - 前置条件：同 AC-01，工具栏可见。
   - 步骤：
     1. 在工具栏中点击某个高亮样式（比如“黄色”）。
     2. 观察页面中选中的文本是否被包裹/标记并呈现高亮样式（检查 DOM class、style 或特定 data 属性）。
   - 期望结果：
     - 选中的文本在 DOM 中出现高亮节点（如 <span data-myz-highlight ...> 或类似结构）。
     - 高亮渲染与所选样式匹配（颜色或样式类）。
   - Playwright 测试名：apply_highlight_style_applies_dom_change

3. 作为一个用户，我希望创建的高亮在刷新页面后仍可恢复（持久化）。

   - ID: AC-03
   - 前置条件：已创建至少一个高亮（通过 AC-02）。扩展使用 `chrome.storage.local` 存储高亮数据。
   - 步骤：
     1. 刷新页面或重新打开同一页面。
     2. 等待扩展重新应用高亮的逻辑完成（可能需要等待 background message 或延迟）。
   - 期望结果：
     - 刷新后页面上能重新看到之前的高亮（DOM 中有对应高亮节点或渲染）。
     - 存储中包含该高亮的持久化记录（可通过扩展背景或 storage API 验证）。
   - Playwright 测试名：highlight_persists_after_reload

4. 作为一个用户，我希望在插件的 Popup / Dashboard 中能看到我保存的高亮列表，并可以跳转到对应页面或复制高亮内容。

   - ID: AC-04
   - 前置条件：存在至少一个持久化高亮；扩展 UI 可通过 popup 或 dashboard 打开。
   - 步骤：
     1. 打开扩展 popup（或 dashboard 页面）。
     2. 查看到高亮条目并点击查看或复制。
   - 期望结果：
     - Popup 列表中列出高亮摘要（文本摘录、页面 URL、时间戳或标签）。
     - 点击“复制”将摘录复制到剪贴板（可通过 Playwright 的 clipboard API 验证）。
   - Playwright 测试名：popup_shows_saved_highlights_and_copy

5. 作为一个用户，我希望在页面上删除高亮后，本地存储与 UI 同步更新（删除不可见/不可用）。

   - ID: AC-05
   - 前置条件：页面有至少一个高亮显示且存储中有对应记录。
   - 步骤：
     1. 在页面或 popup 中执行删除高亮操作（例如点击高亮上的删除按钮或在 popup 中删除）。
     2. 验证页面上的高亮 DOM 元素被移除。
     3. 验证 `chrome.storage.local` 中不再包含该条高亮记录。
   - 期望结果：
     - 页面即时移除对应高亮渲染。
     - 存储中相应记录被删除或标记为已删除。
   - Playwright 测试名：remove_highlight_updates_dom_and_storage

---

## 次要 / 边界测试用例

6. 选择短文本（单词或少量字符）时工具栏行为一致（不因为短选区隐藏）。

   - ID: AC-06
   - 期望：同 AC-01/02，但专注于短选中文本的交互。
   - Playwright 测试名：toolbar_shows_for_short_selection

7. 在 iframe 中选择文本（若插件支持）时，工具栏是否出现与高亮是否能正确应用。

   - ID: AC-07
   - 备注：如果不支持 iframe，可将该用例标记为 N/A 或未来扩展。
   - Playwright 测试名：iframe_selection_behavior (可能标记为 skip)

8. 当页面包含 <pre> 或代码块时，导出/同步逻辑不应破坏格式化（Markdown 转换工具需保持语法高亮的代码块特性）。

   - ID: AC-08
   - 期望：高亮/导出在 pre/code 区域内保留原有换行与缩进；LogSeq 导出遵守 single-colon 元数据规则（若集成）。
   - Playwright 测试名：export_preserves_preformatted_blocks (集成测试)

9. 多标签/多窗口场景：在另一个标签打开相同页面并创建高亮后，原标签能在下次交互/刷新时看到更新（跨 tab 的 storage 同步）。

   - ID: AC-09
   - 期望：storage 变更能被其他 tab 的扩展逻辑监听并在需要时更新 UI（或在刷新后恢复）。
   - Playwright 测试名：cross_tab_highlight_sync (可能 flaky — 标记为 flaky/optional)

---

## 测试优先级建议

- 优先级 P0（必须自动化）：AC-01、AC-02、AC-03、AC-05。
- 优先级 P1（次要自动化）：AC-04、AC-06。
- 优先级 P2（可选/集成或手工）：AC-07、AC-08、AC-09。

---

## Playwright 实施提示（测试工程师注意事项）

- 启动 Chromium 时加载扩展目录或构建产物（dev: 源码下直接加载 `extension/`；release: 加载 `extension/dist`）。
- 使用独立的用户数据目录（userDataDir）启动浏览器，避免已有 storage 干扰。
- 与扩展背景或 popup 通信：可通过 Chrome extension IDs 与 background 页面交互，或直接通过 `page.evaluate(() => chrome.storage.local.get(...))` 检查持久化结果（Playwright 的浏览器上下文需允许 extension APIs）。
- 等待点：高亮应用与恢复可能是异步的（message passing、reapply）。测试中添加合理的等待/重试，不要只用固定 sleep，最好轮询 DOM 或 storage 条件直至满足或超时。
- 副作用清理：每个测试结束后清理 `chrome.storage.local` 中与测试相关的键，或重建全新的用户数据目录以保证隔离。

---

## 推荐的 Playwright 测试清单（按文件/函数名）

- tests/extension/highlight-toolbar.spec.ts
  - highlight_toolbar_shows_on_selection
  - toolbar_shows_for_short_selection

- tests/extension/highlight-apply.spec.ts
  - apply_highlight_style_applies_dom_change
  - remove_highlight_updates_dom_and_storage

- tests/extension/persistence.spec.ts
  - highlight_persists_after_reload
  - cross_tab_highlight_sync (optional/flaky)

- tests/extension/popup.spec.ts
  - popup_shows_saved_highlights_and_copy

---

## 结束语与下一步

该文档定义了首批要自动化的验收场景。下一步我将基于这些用例：

- 在 `tests/` 中创建 Playwright 测试套件，并添加最小的 fixture 页面（若需要）。
- 配置 Playwright 以加载扩展，并实现 P0 优先级的测试。

如果你希望我现在继续生成 Playwright 测试代码并在本地运行，请确认或指明：

- 是否使用 `extension/` 源码目录直接加载扩展，还是先运行构建产物（`npm run build`）并加载 `dist/`？
- 是否需要我把部分边界用例（如 iframe、LogSeq 同步）标记为手工或集成测试而不自动化？
