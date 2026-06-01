# Vectoria Migration & Enhancement

## Vision
- 将 `vectoria/` 独立仓库迁移为 `packages/vectoria`，成为项目内的共享向量检索库。
- 移除本地模型推理依赖（onnxruntime、@huggingface/transformers），统一使用 OpenAI Embedding API。
- 增强检索能力：在向量检索基础上加入 n-gram 倒排索引和关键词（tag）匹配机制，提高匹配成功率和准确度。
- 使用 OpenAI SDK 替代 fetch API，与 `@myz/ai-core` 保持一致的技术栈。

## Background / Motivation
- `vectoria/` 当前是独立目录，包含完整的构建配置和 demo UI，与 monorepo 结构不一致。
- 当前实现依赖 `@huggingface/transformers` 进行本地模型推理，增加了包体积和 WASM 运行时复杂度。
- 纯向量检索在短文本或关键词匹配场景下可能不够准确，需要辅助索引机制。
- `@myz/ai-core` 已使用 `openai` SDK，vectoria 应保持一致以简化依赖管理。

## Scope
- 将 `vectoria/src/` 核心代码迁移至 `packages/vectoria/src/`。
- 移除 `TransformersEmbedder`，只保留 `OpenAIEmbedder`。
- 将 `OpenAIEmbedder` 从 fetch API 改为使用 `openai` SDK。
- 新增 `NGramIndex`：基于 n-gram 的倒排索引，用于关键词匹配。
- 新增 `TagIndex`：基于标签的精确匹配索引。
- 新增 `HybridSearchEngine`：融合向量检索、n-gram 匹配和标签匹配的混合检索引擎。
- 修改 `AiVectorSearchSection` 组件，移除 transformerjs 相关配置选项。
- 删除 `vectoria/` 目录。

## Non-Goals
- 本轮不实现跨语言分词（仅支持基础英文 n-gram 和中文字符 n-gram）。
- 不实现持久化索引存储（n-gram 和 tag 索引仅在内存中）。
- 不替换 HNSW 向量索引算法（保留现有实现）。
- 不实现向量量化压缩。

## Data Model (schema-first)

### 核心类型（保留）
```typescript
interface VectorDocument {
  id: string
  text: string
  metadata?: Record<string, any>
  embedding?: number[]
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

### 新增类型
```typescript
interface NGramEntry {
  ngram: string
  docIds: Set<string>
}

interface TagEntry {
  tag: string
  docIds: Set<string>
}

interface HybridSearchOptions {
  vectorWeight?: number    // 向量检索权重，默认 0.7
  ngramWeight?: number     // n-gram 匹配权重，默认 0.2
  tagWeight?: number       // 标签匹配权重，默认 0.1
  topK?: number            // 返回结果数量，默认 10
  minScore?: number        // 最低分数阈值，默认 0.3
}

interface HybridSearchResult {
  doc: VectorDocument
  vectorScore: number
  ngramScore: number
  tagScore: number
  combinedScore: number
}
```

## UX / Flow
- `AiVectorSearchSection` 简化为：
  - 选择 embedding 模型（从已配置的 provider 中选择）
  - 设置匹配阈值
  - 测试连接
  - 移除 device/wasmPaths 等本地模型配置

- 检索流程：
  1. 用户输入查询文本
  2. 并行执行：向量检索 + n-gram 匹配 + 标签匹配
  3. 加权融合各检索结果
  4. 按 combinedScore 排序返回 topK 结果

## Dependencies / Constraints
- `packages/vectoria` 依赖：
  - `openai` SDK（与 `@myz/ai-core` 版本一致）
  - `idb`（IndexedDB 封装）
  - `uuid`
- 移除依赖：
  - `@huggingface/transformers`
  - `onnxruntime-common`（间接依赖）
- `packages/dashboard-ai-settings` 依赖 `packages/vectoria`（新路径）

## Acceptance Criteria
- Given 已配置 OpenAI provider，When 用户选择 embedding 模型，Then 可以正常进行向量检索。
- Given 移除 transformers 依赖，When 构建 packages/vectoria，Then 产物不包含 onnxruntime 相关代码。
- Given 查询文本包含关键词，When 使用混合检索，Then n-gram 匹配能补充向量检索的不足。
- Given 文档包含标签，When 查询包含相同标签，Then 标签匹配能提高相关文档的排名。
- Given AiVectorSearchSection 组件，When 渲染，Then 不显示 device/wasmPaths 等本地模型配置选项。

## Verification Plan
- 运行 `cd packages/vectoria && npm run build`，确认构建成功。
- 运行 `cd packages/vectoria && npm test`，确认单元测试通过。
- 运行 `cd myz-annotator && npm run build`，确认 annotator 构建成功。
- 运行 `cd myz-desktop && npm run build`，确认 desktop 构建成功。
- 代码审查：确认不包含 `@huggingface/transformers` 引用。

## Risks / Rollback
- 风险：OpenAI API 调用成本增加（相比本地推理）。
  - 缓解：使用 `text-embedding-3-small` 模型，成本较低。
- 风险：网络依赖增加，离线场景无法使用。
  - 缓解：保留缓存机制，已嵌入的文档可离线检索。
- 回退：若新架构有问题，可从 git 历史恢复 vectoria 目录。

## Use Cases / Scenarios

### 主路径：混合检索
1. 用户添加文档到索引（自动提取标签、生成 n-gram、计算 embedding）
2. 用户输入查询
3. 系统并行执行三种检索
4. 加权融合返回结果

### 边界路径 1：纯向量检索
- 查询为长句子，n-gram 匹配较少
- 向量检索主导结果

### 边界路径 2：关键词精确匹配
- 查询为精确关键词
- n-gram 和标签匹配主导结果

### 边界路径 3：空查询
- 查询为空字符串
- 返回空结果或最近添加的文档

## Boundary Conditions
- OpenAI API 调用失败：降级到纯 n-gram/tag 检索
- 文档无标签：标签匹配权重自动降为 0
- 索引为空：返回空结果
- 查询文本过长：截断到 OpenAI token 限制

## Change Log
- 2026-06-01: 初始版本，规划 vectoria 迁移与增强
