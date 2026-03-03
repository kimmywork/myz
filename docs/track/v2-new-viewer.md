# v2-new-viewer 新查看器与页面聚合

## Vision
- 让用户可以在一个沉浸式页面中连续阅读同一网页的标注，并在 2 次点击内切换到相邻网页的标注。

## Background / Motivation
- 现有 Dashboard 仅通过 modal 查看单条记录，信息密度低，长文本/Markdown 阅读体验不佳。
- 多条标注属于同一网页时，缺少连续阅读与顺序切换能力。

## Scope
- 新增 `/highlights/:id` 路由作为查看器页面。
- 在查看器中按“添加时间”或“Range 顺序”排列同一网页的标注，并允许点击切换。
- 滚动到底部自动切换到当前页面下一条标注；若无则切到时间相邻网页。
- 增加左右导航（上一页/下一页）以按时间切换相邻网页。
- Dashboard 高亮页新增可折叠页面侧边栏，用网页维度筛选卡片/列表。
- 引入内容类型字段以区分渲染方式（HTML/Markdown/Plain）。

## Non‑Goals
- 不做历史数据迁移或批量回填。
- 不改动内容脚本的高亮持久化协议（仅扩展字段）。
- 不新增云端同步或权限控制逻辑。
- 不重做现有导出格式。

## Data Model (schema-first)
- `MyZRecord.contentType?: "text/html" | "text/markdown" | "text/plain"`
  - highlight/clip 来自网页：默认 `text/html`
  - ai-generated 来自 Chat：默认 `text/markdown`
  - 其他无明确类型：默认 `text/plain`
- note 视为 `text/markdown` 渲染（无需新增字段）。

## UX / Flow
- 查看器：
  - 顶部显示当前网页信息与排序切换（时间/Range）。
  - 中间滚动区展示同一网页的多条标注，当前条目高亮。
  - 点击任意标注条目切换为当前条目。
  - 底部触发自动切换到下一条/下一网页。
  - 左右按钮切换时间相邻网页（进入该网页首条标注）。
- Dashboard 高亮页：
  - 增加“页面”侧边栏按钮，展开后显示最近网页列表。
  - 选择网页后，仅展示该网页标注，且支持时间/Range 排序。

## Dependencies / Constraints
- 依赖现有 `RECORD_KINDS.BOOKMARK` 作为网页聚合概念。
- 使用现有 Markdown 渲染器（`shared/markdownRenderer.ts`）。
- 查看器仅基于本地存储数据，无远端请求。

## Acceptance Criteria
- Given Dashboard 点击“查看”，When 进入 `/highlights/:id`，Then 展示该标注所属网页的所有记录并可点击切换。
- Given 用户切换排序为 Range，When 同一网页有 range 数据，Then 记录按 range 路径顺序展示。
- Given 滚动到查看器底部，When 当前网页存在下一条记录，Then 自动切换到下一条；若不存在，Then 切到时间相邻网页首条。
- Given 点击左右导航，When 存在时间相邻网页，Then 跳转到相邻网页首条记录。
- Given 内容类型为 `text/markdown`，When 查看器渲染内容，Then Markdown 被解析成 HTML。
- Given 展开页面侧边栏并选择网页，When 回到高亮列表，Then 卡片/列表仅显示该网页标注。

## Verification Plan
- 手动：
  - 在 Dashboard 选择任意标注 → “查看”进入查看器。
  - 切换排序（时间/Range）确认顺序变化。
  - 滚动到底触发自动切换与跨页切换。
  - 展开页面侧边栏，选择网页，确认右侧过滤。
  - 保存一条 AI 生成摘录，确认 Markdown 渲染。

## Risks / Rollback
- 风险：Range 排序在缺失 range 时退化为时间排序。
- 回退：关闭页面侧边栏仍可使用原卡片/列表视图；查看器问题时可继续使用编辑 modal。

## Use Cases / Scenarios
- 主路径：用户在列表中点击“查看”，进入查看器并连续阅读同网页多条标注。
- 边界路径：网页仅一条标注 → 自动切换不会触发，导航按钮禁用。
- 边界路径：标注无 range → Range 排序回退到时间排序。
- 失败路径：传入不存在的 id → 展示未找到提示并提供返回。

## Boundary Conditions
- 空值/缺失字段：contentType 缺失时默认推断。
- 最大数量：同网页标注过多时依赖滚动容器性能。
- 权限不足/不可用：无（纯本地数据）。
- 网络失败/超时：无。

## Open Questions
- 需求中的 `/highights/:id` 是否为拼写错误？默认按 `/highlights/:id` 实现。

## Change Log
- 2026-03-02：Dashboard “页面筛选”标题截断为 10 字，右侧控件保持同一行不折叠。
- 2026-03-02：查看器标题截断为 10 字；无批注时不展示批注区域；标签以 pills 贴在类型后。
- 2026-03-02：移除标注列表页筛选工具区，仅保留导航栏搜索框；搜索支持标签/网站建议与一键重置。
- 2026-03-02：导航栏搜索建议限制为最多 10 条，仅在输入或点击下拉按钮时展示；标注列表页顶部间距与其他页面一致。
- 2026-03-02：页面筛选时，页面列表与记录区固定占屏高度，仅内容滚动；搜索建议仅在输入或点击下拉时展示。
- 2026-03-02：固定高度逻辑改为仅依赖“页面列表”侧边栏开启状态，选择“全部页面”仍保持一致布局。
- 2026-03-02：为页面聚合与内容类型逻辑补充单元测试（records utils / shared types）。
- 2026-03-02：更新导入与记录单元测试以覆盖 contentType 默认值。
