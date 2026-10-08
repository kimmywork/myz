# Inbox 自动 enrichments 与语义聚合（暂缓方案）

> 来源：从 `docs/plan/inbox-flow.md` v0.2 移出（2026-09-28）。
>
> 状态：**暂缓，不进入 Inbox 首版**。本文保留方案细节与实验结果，供后续评估；当前 Inbox 决定完全不依赖 AI / 自动化 / 统计与分词的归类与关联，只呈现记录自带的确定性信息。

## 1. 移出决定

Inbox 的定位是“用户自行管理”，首版不替用户做判断。因此以下能力全部移出首版：

- 关键词提取、代表句、统计去重、语言检测等自动 enrichments；
- embedding、聚类、生成模型；
- 任何会改变 `inbox.status` 或自动写入用户标签的自动化。

去掉这些后，首版不需要本地索引、算法版本管理，也不存在不同设备 enrichments 不一致的问题。记录自带的确定性信息（采集时间、来源、页码/章节、精确重复、同来源计数）仍可使用，见计划 §5。

## 2. 确定性 enrichments 方案（备查）

若后续重新评估，以下方案不依赖生成模型，可作为候选。

### 2.1 关键词

使用 `Intl.Segmenter`、Unicode 规范化、停用词过滤和 TF-IDF / c-TF-IDF：

- 中文优先使用词粒度分词；分词结果过少时使用 2-gram / 3-gram 作为回退；不能把单字直接当作高质量关键词展示。
- 英文进行大小写折叠、词形基础归一化和停用词过滤。
- 关键词显示 2–5 个，附带权重和命中原句；不写入 `tags`。
- 关键词计算范围默认是全部已有记录的本地语料；记录数量过少时退化为记录内 TF 与标题/正文短语。
- 关键词算法版本和内容 hash 必须保存，文本变化后重新计算。

### 2.2 代表句

用句子切分 + TF-IDF / TextRank 对句子评分，提取 1–3 句原文作为“代表内容”：

- 直接引用原文，不做事实改写；
- 保留记录来源和跳转位置；
- 使用词项覆盖惩罚去除高度重复句；
- 不称为“AI 摘要”，避免用户误以为内容经过生成模型验证。

### 2.3 可能重复

分三层计算：

1. 规范化文本 hash：发现完全相同内容（确定性，首版保留）；
2. token / 3-gram Jaccard 或 MinHash：发现轻微改写、重复摘录（统计，暂缓）；
3. 同一 URL、同一 PDF 页、同一 EPUB 章节的来源邻近提醒（确定性，首版保留为计数提示）。

UI 文案使用“可能重复”或“已有相似记录”，不要自动删除或合并。用户点击后查看两条原文，再决定处理。

### 2.4 来源上下文

- 同一规范化 URL 已有几条记录；
- PDF 页码、EPUB 章节、网页标题和域名；
- 同页或同章节最近采集的记录；
- 已有相同标签仅作为提示，不自动继承标签。

### 2.5 轻量元信息

- 语言：脚本比例 + 可用的本地语言检测 API；检测失败显示“语言未知”；
- 内容长度：短摘录、长摘录、空内容；
- 来源类型：网页 / PDF / EPUB；
- enrichments 状态：处理中、已完成、跳过、失败。

### 2.6 阶段性数据形态

```ts
type InboxEnrichment = {
  recordId: string
  contentHash: string
  algorithmVersion: string
  keywords: Array<{ term: string; score: number; evidence?: string[] }>
  representativeSentences: string[]
  duplicateCandidates: Array<{ recordId: string; score: number; reason: string }>
  context: { samePageCount?: number; language?: string; sourceLabel?: string }
  status: "pending" | "ready" | "skipped" | "failed"
  updatedAt: string
}
```

此类数据属于本地可重建索引，建议存扩展自己的 IndexedDB，不默认同步；必须异步计算，不能阻塞队列动作；关键词语料索引采用增量更新，不能每采集一条就完整扫描和重算全部历史记录。删除原始记录时清理 enrichments。

## 3. 语义聚合实验与结论

本轮使用 `hf` CLI 下载模型到本地，并用 Transformers.js 做了离线 smoke test。结果只能证明模型可以运行，不能证明聚类参数已经可用于产品：

- BGE 中文 embedding：512 维；GTE 英文 embedding：384 维；Harrier 多语言 embedding：640 维。
- 在小型合成样本上，中文和多语言 DBSCAN 没有形成稳定簇；英文样本把两个人工主题合并为一个簇。
- 同主题与异主题相似度存在明显重叠，因此不能把固定阈值直接写入产品。
- 中文关键词试验暴露出 tokenizer / 停用词 / n-gram 仍需真实语料校准。
- 本地 Qwen3-0.6B 可以生成中文短标题，但权重体积较大；它只能作为可选命名器，不能成为队列操作依赖。

结论：语义聚合若要进入产品，必须使用真实脱敏数据重新校准模型、相似度和聚类阈值；只有当聚类纯度、噪声比例和用户修正率达标，才考虑在主题视图中启用。

## 4. 重新评估的入口条件

- Inbox 状态队列与手动 triage 已经在真实使用中证明有人用；
- 有足够的真实脱敏语料用于校准；
- 能明确回答“自动化是否替用户做了他不想被代替的决定”，并给出用户可一键纠正的交互；
- 若重新启用，保持本文“建议与证据、不自动改状态、不自动写标签”的边界。

## 5. 参考

- 旧计划：`docs/plan/inbox-flow.md` v0.2（已移除 §5 / §6）
