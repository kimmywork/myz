---
name: workspace-delivery-loop
description: 通用端到端开发流程（需求→计划→实现→验证→交付），含模块抽取/组件化、AGENTS.md 同步、schema-first 数据建模与流程复用提醒。
---

# Workspace Development Loop (Tashan‑style, generic)

适用于多模块项目的中大型交付。强调“需求↔计划↔验证↔代码”可追溯，默认 TypeScript（含 TSX），并按 AGENTS 约束执行。

## 适用范围 / 不适用

适用：
- 跨模块改动（UI + background + storage + docs）
- 需要明确验收口径、回归验证、或版本发布

不适用：
- 10 行以内的小修复
- 纯格式化或小文案调整

## 关键写作规范（必须遵守）

避免含糊：
- 禁用词：可能/大概/尽量/差不多/视情况
- 改成：必须/不允许/在 X 条件下/当…则…

验收口径必须可二元判定：
- 好： “当输入为空时，按钮禁用且提示文案为…”
- 差： “空输入时处理得更合理”

范围与非目标必须明确：
- 好： “不涉及历史数据迁移”
- 差： “暂时不考虑迁移”

## 项目速览（保持通用）

- 扩展/客户端模块（UI + 后台逻辑）
- 网站/文档模块
- 共享库/工具模块
- `docs/`：内部文档（`knowledges/` 为 ground truth，`track/` 为需求与计划）

## 文档命名与追溯（docs/track）

`docs/track/` 是需求与计划的唯一来源。每个中大型需求必须有版本化文档。

推荐命名：
- `docs/track/vN-<topic>.md`：需求 + 执行计划（N 从 1 开始递增）
- `docs/track/vN-index.md`：里程碑与回顾差异汇总
- `docs/track/ECN-NNNN-<topic>.md`：变更通知单（设计偏差必写）

`vN-<topic>.md` 必备段落：
1. Vision / 背景动机
2. Scope / Non‑Goals
3. Data Model（schema-first）
4. UX / 流程
5. 依赖与边界
6. 验收标准（可二元判定）
7. 风险与回退方案
8. 用例与边界条件

## Quick Reference（10 步）

0) 明确需求归属模块  
1) 写 `docs/track/vN-<topic>.md`  
2) 建立验收标准与回归清单  
3) 通过 DoD Gate（定义完成度）  
4) 通过 Doc QA Gate（文档完整性）  
5) Schema‑first：先改 schema/types  
6) 实现（分层：shared → background → UI）  
7) E2E Gate（需要时先 build 再跑）  
8) 回顾差异（写入 `vN-index.md`）  
9) 交付与文档同步（CHANGELOG/用户文档/AGENTS）

## DoD Gate（强制）

通过以下条件才允许进入实现：
- 需求范围可判定（包含 Non‑Goals）
- 验收标准可二元判断
- 数据模型已定义（schema-first）
- 依赖与影响模块明确
- 有最小验证路径

## Doc QA Gate（强制）

检查 `docs/track/vN-<topic>.md`：
- 术语一致，无“同义不同名”
- 关键约束清楚（不接受/不做）
- 风险与回退方案明确
- 验收标准覆盖核心路径与边界路径

## 执行循环（Red → Green → Refactor）

1) Red：先写最小验证或断言（单元/集成/手动验证步骤）  
2) Green：实现最小闭环  
3) Refactor：清理结构、复用 shared、减少耦合  
4) 同步更新文档（必要时写 ECN）

## E2E Gate

当 UI 流程变动或功能跨模块：
- 若 E2E 依赖构建产物，先 build 再运行 E2E
- 记录验证证据（手动步骤或测试输出）

## 用例规范与边界条件（具体化）

用例必须包含：
- 角色/前置条件/触发/步骤/预期
- 至少 1 个主路径 + 2 个边界路径

边界条件示例：
- 空值/缺失字段/默认值
- 最大长度/数量上限
- 权限不足/不可用状态
- 网络失败/超时/重试

## Change Control（ECN）

设计与实现发现偏差时必须记录：
- 写 `docs/track/ECN-NNNN-<topic>.md`
- 内容包含：原设计、发现问题、新设计、影响评估

## 模块抽取 / 组件化流程（复用能力）

当能力多处复用或可独立演进：

1) **识别边界**：输入/输出、依赖、可替换点  
2) **确定落点**：
   - 小范围复用 → 项目内 shared/common 目录  
   - 跨模块复用 → 新建独立库/包  
3) **API 设计**：稳定接口 + 隐藏实现  
4) **依赖收敛**：将外部依赖留在边界层  
5) **迁移策略**：双写/兼容 → 逐步替换  
6) **验证与发布**：独立测试 + 文档同步

## AGENTS.md 自动同步规则（强制）

- 目录职责变化必须更新同级 `AGENTS.md`。
- 发布前执行：`rg --files -g 'AGENTS.md'`，逐个检查是否过期或需补充。

## Schema‑first（持续精化）

- 新需求先改 schema/types（如 `src/shared/schemas.ts` / `types.ts`）。
- 存储、消息层、UI 只能建立在最新 schema 之上。

## 复用点提醒（强制习惯）

当发现可复用流程/模式（导入格式扩展、路由拆分、AI 配置联动等），必须提醒用户整理并更新本 Skill。

## 交付清单

- 代码实现完成
- 验收通过（测试或清晰手动验证）
- CHANGELOG 与用户文档同步
- AGENTS.md 同步更新

## 提交记录规范（示例）

要求：
- 一条提交只做一件事（避免混杂功能与格式化）
- 标题说明“做了什么 + 影响范围”

示例：
- `feat(dashboard): add import source selector`
- `fix(storage): validate schema before save`
- `docs(track): add acceptance criteria for v2`

## 压力场景（不要跳步）

- “时间不够”：至少保留 DoD + Schema-first + 验收记录
- “需求不清”：暂停实现，先补齐 vN 文档
- “只改一点点”：若触及数据模型或跨模块，必须走完整流程

例子（错误做法 → 正确做法）：
- “先写代码后补文档” → 先补 vN，再实现最小闭环
- “这次不跑验证” → 至少记录手动验证步骤

## Red Flags（必须停下重来）

- 需求没有验收标准
- 未更新 schema 就改 UI/逻辑
- 口头变更但无 ECN

例子：
- “接口字段新增但 schema 没更新”
- “验收标准是‘体验更好’而非可判断条件”

## Rationalization Table（自检）

| 试图跳过 | 风险 | 应对 |
| --- | --- | --- |
| 不写计划 | 验收口径漂移 | 写最小 vN |
| 不写 ECN | 设计不可追溯 | 补 ECN |
| 不跑验证 | 回归风险高 | 至少写手动验证步骤 |

## 常见反模式（禁止）

- 未更新 schema 就改 UI
- 需求只口头确认无文档
- 实现与验收标准脱节
- 用例没有边界条件
- 提交记录混杂多个主题

## 模板与检查清单（references）

使用下列模板生成文档，必要时复制到 `docs/track/`：

- `references/track-plan-template.md`（需求 + 计划）
- `references/track-index-template.md`（里程碑与差异回顾）
- `references/ecn-template.md`（变更通知单）
- `references/dod-checklist.md`（DoD Gate）
- `references/doc-qa-checklist.md`（Doc QA Gate）
- `references/delivery-checklist.md`（交付清单）
- `references/module-extraction-checklist.md`（模块抽取流程）
- `references/traceability-matrix-template.md`（需求↔实现↔验证追溯矩阵）
- `references/wording-guidelines.md`（措辞与避免问题）
- `references/use-case-template.md`（用例与场景模板）
- `references/boundary-conditions-checklist.md`（边界条件清单）
- `references/boundary-coverage-strategy.md`（边界条件覆盖策略）
- `references/commit-guidelines.md`（提交记录规范）
- `references/failure-case-examples.md`（失败用例示例）
- `references/given-when-then-examples.md`（Given/When/Then 示例库）

## 详细流程（输入/输出明确）

### 1) 需求澄清
输入：用户需求 / 业务目标  
输出：明确的范围、非目标、影响模块清单

### 2) 建立计划文档（docs/track）
输入：需求澄清结果  
输出：`vN-<topic>.md`（含验收标准、风险、验证方案）

### 3) 追溯矩阵（可选但推荐）
输入：需求与验收标准  
输出：需求 ↔ 代码模块 ↔ 测试映射表

### 4) DoD Gate
输入：计划文档  
输出：通过/不通过；不通过则补文档

### 5) Schema‑first
输入：数据模型草案  
输出：类型/约束/默认值在 schema 中落地

### 6) 实现
输入：计划 + schema  
输出：最小可运行闭环（先 Red → Green）

### 7) 验证与回归
输入：实现结果  
输出：测试记录或手动验证步骤

### 8) 交付与文档同步
输入：验证通过的实现  
输出：CHANGELOG / 用户文档 / AGENTS.md 同步更新

## 追溯矩阵（如何用）

- 每条验收标准至少对应一个实现点（模块/文件）与一个验证点（测试或手动路径）。
- 若无法追溯，说明需求未落地或测试缺失。

## AGENTS.md 更新流程（具体化）

1) 执行 `rg --files -g 'AGENTS.md'`  
2) 对照本次改动的目录，检查职责描述是否失真  
3) 必要时更新同级 AGENTS，保持简短与可执行

## Schema‑first 细化步骤

1) 定义/更新 schema  
2) 更新类型与默认值  
3) 调整存储与消息层  
4) 最后更新 UI
