# PARKING_LOT

增量开发中顺手发现、但不属于当前增量范围的问题、想法和待办，记在这里，不在当期 PR 里顺手改。

格式：一行一条 —— `- YYYY-MM-DD · 来源增量 · 一句话 · 状态（待评估 / 已排期 / 已否决）`

已解决的条目**直接删除**，不保留历史：结论该进规则就进规则，该进文档就进文档，本文件只放还没处理的事。

---

- 2026-11-10 · I1（CodeRabbit review）· Range 顺序在混合标签名下排序错误：`sorting.ts` 的 `comparePathSegments` 对不同标签名按字母比较（`h2` 会排到前面的 `p` 之前），未按文档位置排序。· 待评估
- 2026-11-10 · I2 · 旧顶栏 `DashboardNavbarShell` 的 `isHighlightsRoute` 搜索分支已成死代码（文库不再走旧壳），连同该 prop 一起待 I10 收口时删除。· 待评估
- 2026-11-10 · I2 · `HighlightsPaneShell` 的 `stickyLayout` prop 现在恒传 false（壳接管滚动后不再需要内层定高），是死参数，待 I3 接线右栏时顺手清掉。· 待评估
- 2026-11-11 · I4 · PDF / EPUB 阅读器的带批注删除仍走原生确认（`confirmDestructive`），没有像内容层与 dashboard 那样用页内 `ConfirmPopover`；I4 只要求原生确认收口到 `dialogs`，换成页内确认属于 §4.18 的后续收口。· 待评估
