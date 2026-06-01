# Desktop / Annotator Extensible Sync

## Vision
- `myz-desktop` 必须能够接入 `myz-annotator` 已存在的远端同步仓库，并在使用同一组 sync secret + backend 配置时看到同一份 highlights / AI conversations 数据。
- 同步架构必须允许后续新增本地知识库数据集，而不要求重写现有协议层或把 S3 绑定死在业务实现里。

## Background / Motivation
- `myz-annotator` 已具备真实的端到端加密同步：本地记录被序列化为 manifest + chunks，远端落在 S3 object store。
- `myz-desktop` 当前只有本地 JSON 存储与 S3 连通性校验，还不能消费 annotator 已写入的远端仓库。
- 用户后续计划在 desktop 中加入本地知识库管理，因此同步不能只覆盖 highlights；它必须从一开始就拆出 dataset / backend / state-store 三层边界。

## Scope
- 抽出共享的远端仓库访问规则，使 annotator 与 desktop 复用同一套 manifest / chunk / version 读写逻辑。
- 在 `@myz/sync-core` 中定义扩展边界：
  - backend object store adapter
  - dataset adapter
  - local sync state store
- 实现 desktop 完整双向同步闭环（pull + push），包括远端记录读取、应用、本地变更检测、chunk 构建与上传。
- 为 desktop 后续接入知识库 dataset 同步预留稳定接口。

## Non-Goals
- 本轮不实现知识库 dataset 的最终 schema 与 UI。
- 本轮不替换 annotator 当前的 IndexedDB 状态存储实现。
- 本轮不引入第二种远端 backend 的具体实现；只定义 backend 抽象边界。

## Data Model (schema-first)
- 远端协议继续以 `@myz/sync-core` 为唯一来源：
  - `ManifestData`
  - `ManifestRecordEntry`
  - `SyncRecordPayload`
  - `ChunkEnvelope`
- 新增共享抽象：
  - `SyncObjectStore`: 对象存储的最小读写能力，供 S3 与未来 backend 复用。
  - `SyncRemoteKeyset`: 远端仓库读取所需的 `masterKey` / `publicKey`。
  - `SyncRemoteManifestSnapshot`: 一次 manifest 读取的标准结果。
  - `SyncDatasetAdapter`: 本地 dataset 与协议记录之间的映射边界。
  - `SyncStateStore`: 本地同步元数据（record states / deletions / sync state）的宿主边界。
- dataset 身份不直接等于 backend 路径。真正的数据命名空间必须由 `backend config + prefix + keyId + dataset adapter` 共同决定。

## UX / Flow
- Desktop Sync 页后续必须显示：
  - backend 配置状态
  - key / secret 状态
  - 最近一次远端 manifest 版本
  - 各 dataset 的同步结果
- Desktop 第一阶段流程：
  1. 用户配置 backend 与 sync secret。
  2. desktop 派生 keyset，并读取远端 `version.bin` / manifest / chunks。
  3. desktop 通过 dataset adapter 将远端 payload 应用到本地 highlights / conversations 存储。
  4. UI 显示最近同步结果与 manifest 版本。
- Future knowledge-base flow：
  - 新 dataset 只新增 dataset adapter + schema，不复制 backend / crypto / manifest orchestration。

## Dependencies / Constraints
- `@myz/sync-core` 继续承担协议、加密、manifest/chunk、锁、GC 与 object-store 访问规则。
- `myz-annotator` 保留浏览器宿主特定层：
  - IndexedDB sync state
  - keyring persistence
  - scheduler / notification
- `myz-desktop` 保留桌面宿主特定层：
  - 本地文件或 SQLite 状态存储
  - secret / key lifecycle
  - 本地知识库 dataset wiring
- 不允许把未来 dataset 的业务字段硬编码进 backend 层。

## Acceptance Criteria
- Given 相同的 sync secret 与 backend 配置，When annotator 与 desktop 读取同一远端仓库，Then 两端使用同一套 `@myz/sync-core` 远端仓库规则，不再各自维护 manifest/version/chunk 读取逻辑。
- Given 需要增加新的 dataset，When 新增知识库同步类型，Then 只需要新增 schema + dataset adapter，不需要复制 backend client、manifest parser 或 chunk decrypt 逻辑。
- Given annotator 继续执行现有同步流程，When 切到共享的 remote helper，Then 行为保持一致，且版本/manifest/chunk 规则仍由共享层定义。
- Given desktop 尚未实现上传，When 用户执行第一阶段同步，Then desktop 至少可以读取并应用 annotator 已上传的远端记录，而不是只做 S3 连通性校验。

## Verification Plan
- 运行 `cd myz-annotator && npm run build`，确认 annotator 在切换到 shared remote helper 后仍可构建。
- 运行 `rg --files -g 'AGENTS.md'` 并同步更新受影响目录职责说明。
- 代码审查 `@myz/sync-core` 是否同时包含：
  - protocol types
  - remote repository helpers
  - adapter interfaces
- 代码审查 annotator sync engine 是否已复用 shared remote helper，而不是继续保留本地重复实现。

## Risks / Rollback
- 风险：过早把 host-specific 状态模型塞进 shared 层，会让 desktop 与 annotator 的存储模型重新耦合。
- 风险：desktop 若直接复用 annotator 的本地状态结构，后续知识库 dataset 会被 extension 现状绑住。
- 回退：若共享抽象不够稳定，可保留新引入的 `sync-core` remote helper 与 adapter interfaces，但暂不让 desktop 使用写路径。

## Use Cases / Scenarios
- 主路径：annotator 已写入远端仓库；desktop 使用相同 secret 与 backend 后能够读取同一版本 manifest，并应用 highlights / conversations。
- 边界路径 1：desktop backend 配置正确但 secret 不匹配；必须读取不到有效仓库或校验失败，不能误认为是空数据。
- 边界路径 2：新增知识库 dataset；只增加 schema 与 dataset adapter，不修改 S3 client、manifest reader 与 chunk decrypt。
- 失败路径：manifest 签名缺失或无效；同步必须报错并拒绝应用远端数据。

## Boundary Conditions
- 远端不存在 `version.bin`。
- 远端 manifest 存在但 `.sig` 缺失。
- 同一 backend/prefix 下存在多个 keyId 命名空间。
- dataset adapter 不支持某类 record type。

## Change Log
- 扩大 v20 范围：从”desktop sync connectivity”升级为”desktop / annotator extensible sync architecture + desktop pull-first plan”。
- 明确 desktop 后续知识库同步是当前设计约束，不允许等到知识库功能上线后再返工协议层。
- 2026-06-01: 实现超出原定范围，desktop 已完成完整双向同步闭环（pull + push），移除 Non-Goals 中”不实现 desktop 的完整双向上传闭环”限制。
