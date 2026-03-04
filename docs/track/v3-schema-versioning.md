# v3-schema-versioning 需求与计划

## Vision
- 统一为记录、同步协议、配置与 AI 数据建立可追溯的版本化规范，任何结构性变更必须通过版本升级与明确的 schema 落地。

## Background / Motivation
- 当前关键数据结构分散在 TS 接口、zod schema 与运行时代码中，缺少统一版本标识与完整 spec 文档，结构性变更难以追溯与验证。
- 现有数据结构概览（关键路径）：
  - 记录：`MyZRecordSchema` 定义于 `src/shared/schemas.ts`，并通过 `MyZRecord` 广泛使用。记录结构依赖 `.loose()`，实际字段存在 UI 合成字段（如 `socialKinds`/`socialRecordIds`）。
  - 同步：`src/background/sync/types.ts` 定义 `SyncRecordPayload`、`ManifestData`、`ChunkEnvelope` 等协议结构，但未对 payload 做版本化约束。
  - 配置：`src/background/settings.ts` 定义 Settings/AI 设置接口，`src/background/storage.ts` 进行运行时 normalize，未标识版本。
  - AI：`src/background/ai/types.ts` 定义消息/工具/对话结构；`src/sidepanel/aiStorage.ts` 负责 IndexedDB 存储 Conversation/Message；协议与存储结构未标识版本。

## Scope
- 建立“版本化数据结构”总体设计与落地路径：记录（MyZRecord）、同步协议、配置项、AI 相关接口/协议/存储结构。
- 第一次引入版本时允许完全重塑数据结构与字段定义，不保留旧版结构。
- 落地 schema、registry 与最小运行时注入逻辑，并补齐规格文档。

## Non-Goals
- 本阶段不提供跨版本迁移器（仅注入当前版本号与最小默认值）。
- 本阶段不新增 UI/交互流程。
- 本阶段不调整 UI/交互流程。

## Data Model (schema-first)
### 版本规则（全局约束）
- 每个“持久化数据结构”必须包含 `schemaVersion`（字符串，遵循 `major.minor.patch`）。
- 每个“跨模块/跨进程协议”必须包含 `protocolVersion`（字符串，遵循 `major.minor.patch`）。
- 每个“聚合包裹对象”必须包含 `type`（字符串枚举）与 `version` 字段，明确归属与解析策略。
- 最新版本必须由 zod schema 定义，并导出 `z.infer` 的 TypeScript 类型。
- 旧版本通过显式 schema + 迁移器登记到 registry 中，不允许隐式兼容。

### 版本化结构清单（拟定）
1) 记录（MyZRecord）
- 新结构：
  - `MyZRecordV1`：记录对象上直接加入 `schemaVersion: "1.0.0"` 字段
  - 扁平结构：`{ id, kind, text, html?, contentType?, note?, tags?, color?, style?, createdAt, updatedAt, sourceUrl?, title?, hostname?, range?, conversationId?, url, aiMetadata?, socialKinds?, socialRecordIds?, tweetKinds?, tweetRecordIds?, unreachable? }`
- UI 展示合成字段（如 `socialKinds`/`socialRecordIds`）仅用于展示，禁止参与持久化与同步合并逻辑。
- zod 位置：`src/shared/schemas/records/v1.ts`，并在 `src/shared/schemas/records/index.ts` 注册。

2) 同步协议（sync）
- 新结构：
  - `SyncRecordPayloadV1`：`{ protocolVersion: "1.0.0", recordId, type, updatedAt, data }`
  - `SyncManifestV1`：`{ protocolVersion: "1.0.0", manifestVersion, baseVersion, epoch, createdAt, clientId, recordsIndex, chunksIndex, chainHeads }`
  - `ChunkEnvelopeV1`：`{ protocolVersion: "1.0.0", recordId, updatedAt, prevHash, keyId, recordCipher, recordNonce }`
- `manifestVersion` 仅表示递增版本号，必须与 `protocolVersion` 区分。
- zod 位置：`src/background/sync/schemas/v1.ts`，并在 `src/background/sync/schemas/index.ts` 注册。

3) 配置（Settings）
- 新结构：
  - `SettingsBundleV1`：`{ schemaVersion: "1.0.0", data: SettingsV1 }`
  - `SettingsV1`：保持现有域划分（AI、Social、Sync、UI），但要求完整字段与默认值明确。
- `normalizeSettings` 继续承担默认值注入；Schema Bundle 负责记录版本，解析/迁移留作后续实现。
- zod 位置：`src/background/settings/schemas/v1.ts`，并在 `src/background/settings/schemas/index.ts` 注册。

4) AI（对话/消息/工具）
- 新结构：
  - `ConversationInfoV1`：`{ schemaVersion: "1.0.0", id, title, url, createdAt, updatedAt, sendContextEnabled, metadata }`
  - `MessageV1`：`{ schemaVersion: "1.0.0", id, conversationId, role, content, timestamp, tool_calls?, metadata? }`
  - `ToolCallV1` 使用固定字段 + passthrough 以允许前向扩展；`ToolDefinition` 暂不版本化。
- 存储与协议必须使用同一版本 schema（避免 UI 与后台互相漂移）。
- zod 位置：`src/background/ai/schemas/v1.ts` 与 `src/sidepanel/schemas/v1.ts`，并在 `src/background/ai/schemas/index.ts` 注册。

### Registry 与文档规范
- 建立 `SchemaRegistry`：集中登记所有领域版本、zod schema、迁移函数。
- 设计文档目录：
  - `docs/knowledges/schemas/records/v1.md`
  - `docs/knowledges/schemas/settings/v1.md`
  - `docs/knowledges/protocols/sync/v1.md`
  - `docs/knowledges/schemas/ai/v1.md`
- 文档必须逐字段说明：字段名、类型、可选性、默认值、语义、变更记录。

## UX / Flow
- 无新增 UI。
- 研发流程：新增/调整字段必须先更新 schema + 文档，再修改实现。

## Dependencies / Constraints
- 依赖 zod 作为 schema 的单一来源。
- 同步协议仍遵守 E2EE 设计，不增加明文载荷字段。
- 现有存储默认值必须在 schema 层明确化，不允许隐式容错逻辑分散。

## Acceptance Criteria
- Given 新增一个结构性字段，When 提交变更，Then 必须包含：schema 版本升级、zod schema 变更、对应 docs 更新。
- Given 记录/Settings 缺失版本号，When 读取时，Then 必须注入当前 `schemaVersion` 并继续归一化处理。
- Given 任意 sync payload，When 读取时，Then 必须包含 `protocolVersion` 且与本地版本一致，否则拒绝处理。
- Given `MyZRecord` 结构变更，When 新版本发布，Then 必须能在 schema 层找到完整字段定义与字段语义文档。
- Given 同步 payload，When 写入/读取，Then 必须包含 `protocolVersion` 且与 manifest 版本号独立。

## Verification Plan
- 手动验证：
  - 构造 `SettingsBundleV1`、`MyZRecordV1`、`SyncRecordPayloadV1`、`ConversationInfoV1/MessageV1` 的示例 JSON，经 zod 验证必须通过。
  - 构造缺失 `protocolVersion` 的 sync 对象，验证必须失败；记录/Settings 缺失 `schemaVersion` 时必须被默认注入为当前版本。
- 单元验证（后续实现）：
  - Registry 映射测试：输入版本号，返回对应 schema 与迁移函数。

## Risks / Rollback
- 风险：首次引入版本将导致旧数据失效，需在发布前明确告知。
- 回退：保留旧分支版本；新版本如需回退，直接停止发布并回滚扩展包。

## Use Cases / Scenarios
- 主路径：新增记录字段 `meta.labels` → 版本升级到 `1.1.0` → 更新 schema + docs → UI 使用新字段。
- 边界路径 1：读取缺失 `schemaVersion` 的记录 → 校验失败并丢弃。
- 边界路径 2：读取未知 `schemaVersion` → 进入“unsupported”分支并提示需要升级。
- 失败路径：同步 payload 中 `protocolVersion` 与本地 registry 不匹配 → 同步中止并记录错误。

## Boundary Conditions
- 空值/缺失字段：Sync 缺失版本字段必须拒绝；记录/Settings 缺失时注入当前版本。
- 最大长度/数量：记录 tags 数量上限与字符串长度必须在 schema 明确。
- 权限不足/不可用：sync 未启用时不得写入 manifest。
- 网络失败/超时：同步版本读取失败时不得写入新版本。

## Open Questions
- 版本号命名是否统一为 `major.minor.patch`，还是按日期版本（例如 `2026.03`）。
- 是否需要为每个 “kind” 拆分独立 record schema（如 `highlight`/`clip`）并分别升级。

## Change Log
- 2026-03-03：根据实际实现更新范围与验收口径，补充 runtime 版本注入与 sync 拒绝策略。
- 2026-03-04：修复 schema 定义中的 `z.record` 签名以兼容 zod v4；为大部分 `myz:*` 消息补齐 `sendMessage` 结果类型与 payload 约束，新增 `JsonValue/UnknownRecord` 工具与运行时守卫用于类型收敛。未引入新的持久化字段，现有 schema 版本不变。
