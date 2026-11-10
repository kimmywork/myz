# PARKING_LOT

增量开发中顺手发现、但不属于当前增量范围的问题、想法和待办，记在这里，不在当期 PR 里顺手改。

格式：一行一条 —— `- YYYY-MM-DD · 来源增量 · 一句话 · 状态（待评估 / 已排期 / 已否决）`

---

- 2026-11-10 · I1 · 增量验收命令若自带被检字符串，会命中规格文件自身（永远返回不了空），应统一用 `-g '!release-0.7-increments.md'` 排除并把判定写成「输出为空」；是否写进增量文档模板，由 Chief 在 I1 后单独处理。· 待评估
- 2026-11-10 · I1（CodeRabbit review）· Range 顺序在混合标签名下排序错误：`sorting.ts` 的 `comparePathSegments` 对不同标签名按字母比较（`h2` 会排到前面的 `p` 之前），未按文档位置排序。· 待评估
- 2026-11-10 · I2 · 旧顶栏 `DashboardNavbarShell` 的 `isHighlightsRoute` 搜索分支已成死代码（文库不再走旧壳），连同该 prop 一起待 I10 收口时删除。· 待评估
- 2026-11-10 · I2 · `HighlightsPaneShell` 的 `stickyLayout` prop 现在恒传 false（壳接管滚动后不再需要内层定高），是死参数，待 I3 接线右栏时顺手清掉。· 待评估
