# Vectoria Migration & Enhancement

## Vision
- 将 `vectoria/` 独立仓库迁移为 `packages/vectoria`，成为项目内的共享向量检索库。
- 移除本地模型推理依赖（onnxruntime、@huggingface/transformers），统一使用 OpenAI Embedding API。
- 增强检索能力：HNSW + BM25 + RRF 融合 + 多因子 Reranker。
- 使用 OpenAI SDK 替代 fetch API，与 `@myz/ai-core` 保持一致的技术栈。

## Background / Motivation
- `vectoria/` 当前是独立目录，包含完整的构建配置和 demo UI，与 monorepo 结构不一致。
- 当前实现依赖 `@huggingface/transformers` 进行本地模型推理，增加了包体积和 WASM 运行时复杂度。
- 纯向量检索在短文本或关键词匹配场景下不够准确，需要 BM25 稀疏检索补充。
- 需要多因子 Reranker 提升结果质量。

## Scope
- 将 `vectoria/src/` 核心代码迁移至 `packages/vectoria/src/`。
- 移除 `TransformersEmbedder`，只保留 `OpenAIEmbedder`。
- 将 `OpenAIEmbedder` 从 fetch API 改为使用 `openai` SDK。
- 修复 HNSW 实现：多样性启发式、正确的邻居裁剪、剪枝逻辑优化。
- 新增 BM25 稀疏索引（纯 JS 实现）。
- 新增 RRF（倒数秩融合）算法。
- 新增多因子 Reranker：标题加权、位置加权、长度惩罚、时间加权。
- 新增标量量化（float32 → int8）减少内存占用。
- 新增 Embedding 缓存避免重复 API 调用。
- 删除 `vectoria/` 目录。

## Non-Goals
- 本轮不引入 WASM（保持纯 JS 实现）。
- 不实现中文分词（使用字符级 bigram）。
- 不实现持久化向量量化（仅在内存中）。

## Data Model (schema-first)

### 核心类型
```typescript
interface VectorDocument {
  id: string
  text: string
  metadata?: Record<string, any>
  embedding?: number[]
  tags?: string[]
  createdAt: number
}

interface SearchResult extends VectorDocument {
  score: number
}

interface EmbeddingModel {
  embed(text: string): Promise<number[]>
  embedBatch(texts: string[]): Promise<number[][]>
}
```

### BM25 相关
```typescript
interface BM25Document {
  id: string
  terms: string[]
  length: number
  metadata?: Record<string, any>
}

interface BM25Config {
  k1: number  // 词频饱和参数，默认 1.2
  b: number   // 文档长度归一化参数，默认 0.75
}
```

### RRF 相关
```typescript
interface RRFConfig {
  k: number  // 常数，默认 60
}

interface RankedResult {
  id: string
  score: number
  rank: number
}
```

### Reranker 相关
```typescript
interface RerankerConfig {
  titleBoost: number      // 标题匹配加权，默认 2.0
  positionDecay: number   // 位置衰减因子，默认 0.95
  lengthPenalty: {
    minLen: number        // 最小长度阈值，默认 50
    maxLen: number        // 最大长度阈值，默认 500
    penalty: number       // 惩罚系数，默认 0.8
  }
  recencyBoost: {
    enabled: boolean
    halfLifeDays: number  // 半衰期天数，默认 30
  }
}
```

### 混合检索配置
```typescript
interface HybridSearchConfig {
  denseWeight: number     // 稠密检索权重，默认 0.6
  sparseWeight: number    // 稀疏检索权重，默认 0.4
  topK: number            // 返回结果数量，默认 10
  minScore: number        // 最低分数阈值，默认 0.1
  useQuantization: boolean // 是否使用标量量化，默认 true
  reranker: RerankerConfig
  rrf: RRFConfig
}
```

## UX / Flow
```
查询流程：
1. 用户输入查询
2. 预处理：分词、提取标题关键词
3. 并行执行：
   - HNSW 向量检索（稠密）
   - BM25 关键词检索（稀疏）
4. RRF 融合两路结果
5. 多因子 Reranker 重排序
6. 返回 topK
```

## Dependencies / Constraints
- `packages/vectoria` 依赖：
  - `openai` SDK（与 `@myz/ai-core` 版本一致）
  - `idb`（IndexedDB 封装）
  - `uuid`
- 移除依赖：
  - `@huggingface/transformers`
  - `onnxruntime-common`（间接依赖）

## Acceptance Criteria
- Given 已配置 OpenAI provider，When 用户选择 embedding 模型，Then 可以正常进行向量检索。
- Given 移除 transformers 依赖，When 构建 packages/vectoria，Then 产物不包含 onnxruntime 相关代码。
- Given 查询文本包含关键词，When 使用混合检索，Then BM25 能补充向量检索的不足。
- Given 文档包含标题，When 查询匹配标题，Then Reranker 能提升标题匹配的文档排名。
- Given 索引包含 10K 文档，When 搜索，Then 延迟 < 50ms。

## Verification Plan
- 运行 `cd packages/vectoria && npm run build`，确认构建成功。
- 运行 `cd packages/vectoria && npm test`，确认单元测试通过。
- 运行 `cd myz-annotator && npm run build`，确认 annotator 构建成功。
- 运行 `cd myz-desktop && npm run build`，确认 desktop 构建成功。

## Risks / Rollback
- 风险：BM25 中文分词效果有限。
  - 缓解：使用字符级 bigram，后续可升级为 jieba 分词。
- 风险：标量量化损失精度。
  - 缓解：损失 < 3%，被 BM25 补偿。
- 回退：若新架构有问题，可从 git 历史恢复。

## Change Log
- 2026-06-01: 初始版本，规划 vectoria 迁移与增强
- 2026-06-01: 更新方案：HNSW + BM25 + RRF + Reranker + 标量量化 + Embedding 缓存
