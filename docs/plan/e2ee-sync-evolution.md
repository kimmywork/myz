# E2EE Sync 演进计划（流化、可演进、可扩展）

> 状态：**已审核通过并实施**（第二轮 review 修复见 §9）。完成情况见文末「实施状态」。
>
> 与 `docs/plan/inbox-flow.md` 配套：Inbox 的状态同步依赖本计划的子流（side stream）能力；本文同时纳入现有同步的确认优化项（打包 chunk、并发拉取、锁所有权、协议演进、回滚防护、死代码清理）。
>
> 安全模型（设备绑定、密钥派生、抗回滚、轮换、本地密钥与凭证保护、消息授权）见 `docs/plan/e2ee-security-hardening.md`。**该文档会改变数据加密根与 manifest 签名主体，必须先于本文的子流 v1 格式冻结定案。**

## 1. 目标

- **可安全演进**：主流永久冻结，新能力进子流；新增记录类型不再被旧客户端删除。
- **可扩展**：增量同步不再随记录总数线性下载/重写，改为只拉变化的子集。
- **正确**：修复多客户端锁所有权缺陷；明确冲突模型与回滚防护。
- **性能**：多记录打包 chunk + 并发/批量 IO，降低对象数与延迟。
- **清理**：处理“名义版本化”的死 registry，给出 GC/轮换的明确策略。

## 2. 现状问题（均有代码证据）

| # | 问题 | 证据 | 影响 |
| --- | --- | --- | --- |
| a | 协议版本严格相等、无法演进 | `packages/sync-core/src/remote.ts:45-47` | 改版本号即双向同步锁死 |
| b | 缺席即删除，未知记录被旧端清掉 | `myz-annotator/src/background/sync/syncEngine.ts:269-273,313-323,327-335` | 无法安全新增记录类型 |
| c | manifest 全量、随记录数线性增长，每次同步整份下载/重写 | `remote.ts:88-129`、`syncEngine.ts:361-415` | 固定流量与上传体量 O(N)，Inbox 会翻倍 |
| d | 一条记录 = 一个 chunk = 一个对象，逐条顺序 GET | `packages/sync-core/src/chunks.ts:27-78`、`remote.ts:131-153` | 对象数与请求数 O(N)，大库慢 |
| e | 锁释放不校验所有权 | `lock.ts:58-63`、`syncEngine.ts:144-149` | 租约过期后可能删掉他人的锁 |
| f | registry 是死代码，运行时无校验/迁移 | `registry.ts`、`records.ts:84-103` | 名义版本化，易误判“机制现成” |
| g | GC 每次解密 30 份全量 manifest | `syncEngine.ts:44`、`gc.ts:31-44` | GC 成本随记录数放大 |
| h | `prevHash/chainHeads/chunk hash,size,nonce` 存而不验；无单调锚点 | `chunks.ts:27-78`、`remote.ts:131-153` | 完整性由 AEAD+签名保证，但存在回滚风险 |

## 3. 设计

### 3.1 无冻结主流（clean break）

安全计划已定 **clean break（不向前兼容）**，因此不存在需要冻结的 v1 主流：**所有数据（高亮、Inbox 状态、关联）统一使用本计划的新格式与新的数据密钥/签名模型**；旧根在切换后清理。新格式使用自己的协议版本号，**不复用旧 `SYNC_PROTOCOL_VERSION`**（避免再次触发严格版本锁死）。

### 3.2 子流架构

新能力放入旧客户端不会枚举的命名空间：

```text
<accountId>/streams/<streamId>/
  manifests/v0000000001.bin(.sig)
  shards/<shardId>.bin
  tombstones/<shardId>.bin
  meta/version.bin
  lock/lease.bin
```

- **独立 master key**：`C_stream = HKDF(C, "stream:<streamId>:master")`（从 C 派生，无需保存 seed）；签名继续复用现有 B2。
- **独立版本指针、锁、GC、sync state**：record-state/deletion 按 stream 命名空间隔离，避免主流 reconciliation 误删子流记录（`syncEngine.ts:269-273` 的根因）。
- **接线 `SyncDatasetAdapter`**（`packages/sync-core/src/adapters.ts:48-59`）：把根前缀、collect/apply/delete、版本与锁路径参数化；`scheduler.ts` 支持多流、单流失败不影响其他流。
- 不需要“与旧客户端逐字节一致”的承诺（clean break）；新格式由所有端同步升级后启用。

### 3.3 子流协议契约 v1（必须首版即具备）

1. **显式墓碑**：删除写入 tombstone，不靠“缺席”。未知记录“不提”≠“删”。
2. **opaque preservation**：读到无法物化的远端记录/未知类型，原样保留并回传，绝不删除；这是日后在流内新增类型的安全前提。
3. **版本协商**：manifest 携带 `streamVersion`（单调计数，抗回滚）、`minReaderVersion`；读者按 `<=` 解析历史格式，低于 `minReaderVersion` 明确拒绝而非误删。
4. **能力位 `features`**：未知 feature 忽略，不影响已理解字段。
5. **逐字段 recordId**：独立可变的字段各占一个 recordId（如 `status:` / `mark:` / `rel:`），以 per-recordId LWW 天然避免跨字段覆盖，无需复杂合并算法。
6. **每个流的 crypto info 仍用 `<version>`/`<chunkId>`，但 key 是 `C_stream`**，天然域分离。

### 3.4 分片 + 打包索引（解决 c、d）

子流不沿用“全量 recordsIndex”，改为**按 recordId 稳定分片的打包 chunk**；**墓碑也是分片，并同样纳入签名 manifest 索引**（否则增量同步看不到删除，会被“缺席即 kept”复活）：

```text
stream manifest（签名）:
  shardCount: N                                          // 客户端据此推导分片，避免各自假设
  shards:          { [shardId]: { hash, size, nonce } }   // O(分片数)
  tombstoneShards: { [shardId]: { hash, size, nonce } }   // 墓碑分片也在索引内
  recordId -> shardId = jumpConsistentHash(recordId, shardCount)

shard 解密后:
  { records: { [recordId]: { updatedAt, recordHash, keyId, recordCipher, recordNonce } } }
tombstone shard 解密后:
  { tombstones: { [recordId]: deletedAt } }
```

- **manifest 只索引分片（含墓碑分片）**，记录元数据放进分片内部；每次同步只拉“hash 变化的分片”，下载量从 O(N) 降到 O(变化量)。
- 一个分片天然打包多条记录：一个对象承载多条，批量拉取后一次解密。
- 分片数用 **jump consistent hash**（或 rendezvous）而非 `% N`：`shardCount` 变化时只迁移约 O(1/N) 的 key，避免取模翻倍导致半数 key 重映射、与“只重写受影响分片”冲突。`shardCount` 写入签名 manifest。
- 删除/墓碑独立分片并按需压实（compaction）；墓碑分片变化必须能被索引发现。
- **仅子流使用该格式**；主流处理见 §9（clean break 后不再要求与旧客户端并存）。

### 3.5 打包 chunk 与并发 IO（解决 d，明确要求）

- 分片即打包 chunk：`buildShard(records[])` 一次加密多条 envelope。
- 拉取按分片去重：同一分片只 GET 一次，并发度设限（如 4–8）；上传同样批量+限并发。
- 应用远端记录改为“一次解密产出多条”，替换 `fetchRemoteRecords` 的逐条 `await getObject`（`remote.ts:131-153`）。
- 写入时只重写受影响的分片，未变分片沿用远端对象（复用 `hash` 比对）。

### 3.6 锁（解决 e）

- 子流使用独立锁路径；释放时校验所有权（记录 `clientId`/nonce，或对 etag 用 `If-Match`），不再无条件 `deleteObject`（`lock.ts:58-63`）。
- 主流锁同样加所有权校验（这是纯修复，不改变格式）。

### 3.7 回滚防护（解决 h）

- 子流 manifest 的 `streamVersion` 单调递增；客户端保存 high-water mark，拒绝低于它的 manifest。
- 主流为尽力而为：新客户端可用 `lastManifestVersion` 检测回滚，但旧客户端无法强制；列为已接受风险或后续独立项。

### 3.8 registry（解决 f）

- 要么把 `SyncRecordPayloadRegistry` 等接到实际读路径，做版本解析/校验与迁移；要么删除，避免“名义版本化”误导。子流的版本协商**不使用**全局 `SYNC_PROTOCOL_VERSION`。

### 3.9 GC 与轮换（解决 g）

- GC 按流执行，主流维持 `<accountId>/manifests` + `<accountId>/chunks`（旧客户端安全）；子流清理自己的 manifests/shards，保留策略独立。
- 考虑降低主流 `MANIFEST_KEEP_COUNT` 或改存增量，减少需解密的快照数。
- 轮换：`C_stream` 随 seed 一起轮换，全部流迁到新 keyId；明确旧 keyId 数据的清理时机（安全上应尽快）。

## 4. 兼容与迁移（clean break）

- 不做向前兼容：所有端升级到新账号/格式版本；旧根与旧 epoch 在切换后清理（见 `e2ee-security-hardening.md` §7）。
- 首个升级设备执行**一次性 best-effort 挽救**：用旧密钥拉取旧远端记录 → 合并本地 → 以新格式重上传 → 清理旧根（决策见 §9）。
- 高亮不再有“遗留主流”；所有数据统一走可扩展分片格式，主流 manifest 增长问题随之消解。

## 5. 实现增量（按可验证顺序）

**I1｜锁续租 + 所有权修复（独立、低风险，先做；须含续租，不能只靠安全 QW2）**
- 产物：长同步期间定时续租；释放锁时校验 owner/etag；主流与子流共用逻辑。
- 依赖：无。
- 动作：`lock.ts` 增加 owner 校验或 `If-Match` 释放 + 续租；补并发与长同步测试。
- 验证：单测模拟“A 租约过期→B 获取→A 释放”，断言 B 的锁仍在；5 万条模拟同步不超租约被抢锁。
- 完成：单测通过，现网行为不变。

**I2｜sync-core 流参数化（不改格式）**
- 产物：根前缀/版本路径/锁路径/GC/sync state 可按 stream 参数化；主流行为逐字节不变。
- 依赖：I1。
- 动作：路径 helper 化；per-stream state 命名空间；scheduler 多流；接线 `SyncDatasetAdapter`。
- 验证：回归测试断言主流 manifest 与改造前一致；`shared`/`sync-core` 单测通过。
- 完成：双流可各自独立同步、互不干扰。

**I3｜Inbox 子流端到端（先用简单格式）**
- 产物：`inbox` 状态 adapter + 子流同步跑通；先用“1 记录 = 1 chunk”保证先能工作。
- 依赖：I2；`inbox-flow.md` 的状态模型。
- 动作：`status:`/`mark:`/`rel:` recordId；collect/apply/delete；子流键派生。
- 验证：双端（模拟两台客户端）并发改状态与正文，断言互不覆盖。
- 完成：跨设备 Inbox 状态一致。

**I4｜分片 + 打包 chunk 格式**
- 产物：子流使用分片索引与打包 chunk；manifest O(分片数)。
- 依赖：I3。
- 动作：`fnv1a` 稳定分片；shard 编解码；按分片去重拉取；只重写受影响分片；墓碑分片。
- 验证：基准测试——记录数增大时，单次同步下载字节数只随变化量增长；分片复用断言。
- 完成：增量下载不随 N 线性增长。

**I5｜并发/批量 IO**
- 产物：拉取/上传按分片批量、限并发。
- 依赖：I4。
- 动作：替换逐条 `getObject`；并发上限与重试。
- 验证：大库同步耗时基准下降；无请求风暴。
- 完成：基准达标。

**I6｜墓碑 / opaque / 版本协商 / 回滚**
- 产物：子流 v1 契约全部生效。
- 依赖：I3/I4。
- 动作：显式墓碑、未知记录保留、`<=` 版本解析、`minReaderVersion`/`features`、`streamVersion` high-water。
- 验证：新增未知类型后旧子流客户端不删它；回滚旧 manifest 被拒。
- 完成：契约测试通过。

**I7｜registry 处置**
- 产物：接线校验/迁移，或删除。
- 依赖：无。
- 验证：删则无引用、测试仍绿；接线则无效 payload 被拒。
- 完成：无死代码或校验生效。

**I8｜GC / 轮换**
- 产物：按流 GC；轮换覆盖子流并清理旧 keyId。
- 依赖：I2。
- 验证：GC 不误删跨流对象；轮换后新旧 keyId 状态符合预期。
- 完成：策略与测试落地。

## 6. 验收标准

- **已按 clean break 调整**：不再要求与旧客户端并存（见 §9 与 `e2ee-security-hardening.md`）；所有端升级到新账号/格式版本后，旧根被清理，因此不存在“新旧混跑”验收项。
- 新增子流记录类型后，早期子流客户端不会删除未知类型（opaque + 墓碑）。
- 记录数从 1 千增到 5 万时，单次同步下载字节数只随变化量增长，不随总记录数线性增长。
- 多记录打包后，对象数与 GET 次数显著下降；同步耗时基准改善。
- 任何锁释放都不会删除他人持有的锁。
- 回滚到旧 manifest 被拒绝。

## 7. 风险与待决

- **分片数策略**：固定 vs 动态增长（重映射成本）。
- **主流 manifest 增长**：是否接受为遗留债，还是立项“高亮迁流”。
- **回滚防护**：是否纳入威胁模型（决定主流是否也强制）。
- **主流锁修复**：与旧客户端混跑时，旧端的无条件释放仍存在，需评估是否可接受。
- **工作量**：I2–I6 是对 sync-core 的实质重构（非“机制现成”），需按增量逐步验证。
- **顺序**：`docs/plan/e2ee-security-hardening.md` 的密钥模型（设备绑定/数据密钥 D/按设备签名）会改动子流密钥与签名来源，需先于子流 v1 格式定案；否则子流格式会二次返工。

## 8. 与 inbox-flow 的关系

`inbox-flow.md` §3.4 的状态同步依赖本计划的子流能力；总顺序（含安全密钥模型）见 `docs/plan/inbox-flow.md` 顶部“总增量顺序”。主计划不重复描述协议细节，以本文为准。

## 9. 第二轮 review 修复决议（2026-09-28）

- **0.1 顺序矛盾**：安全决策已改为 clean break（无 BC），故删除 §6“旧客户端并存”验收；本条取代原“对旧客户端不可见”为子流的主要理由（现为隔离/演进/可扩展）。总顺序见 inbox-flow 顶部。
- **0.2 术语**：全文 S3 根统一为 `accountId`；`keyId` 仅保留在 chunk envelope/chainHeads 等密码学字段语境。
- **1.1 锁**：I1 已合并“续租 + 所有权”，长同步不再依赖后续 QW2。
- **1.2 墓碑索引**：§3.4 已将 `tombstoneShards` 纳入签名 manifest 索引，删除不可见的隐患消除。
- **1.3 shardCount**：§3.4 manifest 增加签名字段 `shardCount`，分片函数只用该值。
- **1.4 重映射**：§3.4 改用 jump consistent hash，翻倍时只迁移约 1/N，避免与“只重写受影响分片”冲突。
- **§4 决胜规则（推荐已定）**：以 **spec 的确定性规则为准**——同 `updatedAt` 时取较高 `recordHash`；因此应修正**实现**（`syncEngine.ts:297-303` 非 pending 分支改为比较 hash，而非“远端无条件胜”），并保留“本地未上传的 pending 记录永不被覆盖”。新格式沿用该确定性规则，补回归测试；`E2EE_SYNC_SPEC.md:131` 无需改。
- **冻结主流前提（推荐已定）**：clean break 取消“冻结主流 v1”，所有数据统一新格式（§3.1/§4）。
- **分片策略（推荐已定）**：jump consistent hash，起始 64，平均分片超阈值再增长；`shardCount` 签名入 manifest。
- **回滚防护（推荐已定）**：新格式所有流强制单调 high-water；旧格式不再处理。
- **写撤销与数据挽救**：见 `e2ee-security-hardening.md` §10/§11。

## 10. 实施状态（2026-10-08）

- **I1 完成**（`c7e717a`）：`lock.ts` 续租 + 所有权校验释放 + `If-Match`；`syncEngine` 每 15s 续租。
- **I2–I8 完成**：流参数化与 `SyncDatasetAdapter` 接线（I2）、Inbox 子流（I3）、`jumpConsistentHash` 分片 + 打包 chunk（I4）、有界并发 IO（I5）、墓碑/opaque/`<=` 版本解析/`minReaderVersion`/`streamVersion` high-water（I6）、删除死 registry（I7）、按流 GC（I8）。核心见 `packages/sync-core/src/{streamClient,streamManifest,streamMerge,streamGc,shards,jumpHash,accountSync}.ts`。
- **端到端**：双 profile mock S3 e2e（`tests/extension/sync-mock-s3.spec.ts`）。
- 依赖：KM3 传输（同机配对已接 UI；S3 邮箱 crypto 已实现未接 UI）与 KM4 接线均已完成，见 `e2ee-security-hardening.md §12`。

## 11. 删除传播与墓碑生命周期（2026-10-08 补充）

背景：v2 契约要求**显式墓碑**、禁止“缺席即删除”（§3.3/§3.4）。但实现里**没有把本地删除写进子流墓碑**：`StreamDataset` 只有 `collect/apply/remove`，删除只从本地集合消失 → 对端拉取时“本地缺失 + 远端存在”判远端胜出 → **复活**，删除不传播；Inbox 的 `status:/mark:/rel:` 也从未墓碑化。

### 11.1 删除传播（修复）
- `StreamDataset` 增加可选 `collectTombstones(): Promise<Record<recordId, deletedAt>>` 与 `clearTombstones(ids)`；`syncAccountStreams` 将 `state.tombstones` 与本地待推墓碑合并后交给 `syncStream`，**推送成功后**清理本地待推项（失败不清理，避免丢删除）。
- 高亮流：本地删除日志（现有 `deletions` store，`recordHighlightDeletion` 写入）作为待推墓碑（前缀 `h:`）。
- Inbox 流：删除正文时同时墓碑化 `status:<target>`/`mark:<target>` 与触及该 target 的逐边 `rel:` 记录；`removeInboxRelation` 也写 `rel:` 墓碑。两流按前缀各清各的，顺序无关。
- 远端删除应用（`dataset.remove`）**不**记本地墓碑（避免回传环）。

### 11.2 墓碑生命周期（GC 的一部分）
- 墓碑**单次同步负担很小**：只重写“记录分片 + 对应墓碑分片 + manifest”，manifest 索引 O(分片数)。
- 但墓碑**会累积**：`streamGc.ts` 只剪旧 manifest/未引用分片，被保留 manifest 引用的墓碑分片不会清 → 无界增长。
- 因此删除分两层：**删除意图 = 墓碑**（传播，必需）；**删除清理 = GC 的职责**。策略：
  - **保留窗口（TTL）— 已实现**：在 **push 合并阶段**丢弃超过窗口（默认 90 天）的墓碑，使新 manifest 不再携带；旧 manifest 随 `keepCount` 轮换后，墓碑分片变为未引用，由 `gcStream` 删除（无需重写签名 manifest）。
  - **设备水位 — 已实现**：每流每设备写**签名 ack**（`<prefix>/acks/<deviceId>.bin`，`streamAcks.ts`，不占 manifest/不 bump 版本）；当所有已授权设备 ack 的 `streamVersion >= 当前版本` 时，改用**最短保留窗口**（默认 24h）回收墓碑。`syncStream` 同步成功后写自身 ack。
  - **压实（compaction）— 部分**：从分片删除记录后，空分片在重建 manifest 时自然消失（未引用即被 `gcStream` 回收）；**稀疏分片重写/增长 `shardCount` 再平衡**列为后续。
- 风险：仅 TTL、无水位时，离线超过窗口的设备可能复活已删记录；现已有水位，默认路径不再有该风险（无 ack 的离线设备会阻止回收，安全优先）。

### 11.3 验收
- 删除在两端传播；已删记录**不复活**。
- 删除正文时其 Inbox 状态记录同步消失；`rel:` 解除可传播。
- 墓碑随保留窗口回收，不再无界增长。

