# SyncOrch — 宿主无关的同步编排（计划）

> 状态：**计划中，未实施**。目标是把 v2 账号同步的「编排策略」从扩展宿主中剥离，做成可在扩展 / 桌面 / 移动复用的同步编排器。
>
> 关联：`docs/plan/core-refactor.md` §12（SyncOrch 为唯一剩余项）、`docs/plan/e2ee-sync-evolution.md`（子流协议，不再改动）、`docs/plan/e2ee-security-hardening.md`（设备绑定/锁/密钥模型）。

## 1. 目标与范围

**目标**：把「一次账号同步」的编排（锁生命周期、逐流同步、上传后 GC、结果聚合、异常收口）做成一个**宿主无关**的 `runAccountSync(options)`，宿主只负责：加载账号/设备/设置、提供 `SyncObjectStore` 与数据集、以及 UI/持久化副作用。

**做**
- 新增 `runAccountSync` 编排器 + 结果类型。
- 扩展 `v2/engine.ts` 改为薄适配器，删除重复的锁/GC 逻辑。
- 编排器单测（锁获取/占用/释放、部分失败、仅对已上传流 GC）。

**不做**
- 不改 `sync-core` 的协议/密码学/分片格式。
- 不改 v1 遗留同步（`sync-plan.ts` / `sync-phases.ts` / `sync-state.ts`）；仅标注 legacy。
- 不把 badge / 通知 / ChangeBus / 同步态持久化放进编排器（这些是宿主副作用）。

## 2. 现状（附证据）

`myz-annotator/src/background/sync/v2/engine.ts:28-130` 的 `syncAccountNow()` 同时承担：

| 关注点 | 位置 | 性质 |
| --- | --- | --- |
| 加载账号 / 设备密钥 / 设置 / S3 配置 / clientId | `:29-46` | 宿主 |
| 构造 `S3Client`（`SyncObjectStore`） | `:46` | 宿主适配器 |
| 获取账号级锁 | `:49-60` | 协议 + 编排 |
| 每 `lease/2` 续租（`setInterval`） | `:62-74` | 编排（定时器） |
| 构建数据集（highlights / inbox） | `:77` | 宿主 |
| `syncAccountStreams` | `:78-85` | 协议 |
| 逐上传流派生 stream key + `gcStream` | `:86-100` | 编排 |
| `refreshInboxBadge()` | `:101` | 宿主 UI |
| 写同步状态 | `:102-111` | 宿主持久化 |
| 聚合 `SyncResult` | `:112-117` | 编排 |
| 释放锁 + 停定时器 | `:120-129` | 编排 |

其他相关：
- v1 回退：`syncEngine.ts:38-129`（无账号时走 v1；`sync-plan.ts:28-38` 定义 `SyncResult`）。
- 协议原语：`packages/sync-core/src/{accountSync,lock,streamGc}.ts`。
- 每流状态：`v2/stateStore.ts`（按 `accountId` 隔离）。
- 通知/清理：`sync-state.ts:45-57`（chrome.notifications）、`sync-state.ts:30-43`（purge）。

**结论**：协议与密码学已经在 `sync-core`；真正留在扩展的是**编排策略 + 宿主副作用**。SyncOrch 只搬前者。

## 3. 目标分层

```
Host adapter (myz-annotator/src/background/sync/v2/engine.ts)
  1. load account / device / settings / clientId          (宿主)
  2. build S3Client + datasets + stream state store       (宿主)
  3. runAccountSync({ store, account, device, ... })       (编排器)
  4. refreshInboxBadge / ChangeBus / writeSyncState       (宿主副作用)
  5. map RunAccountSyncResult -> SyncResult                (宿主类型)

Orchestrator (packages/sync-core/src/orchestrator.ts)
  acquire lock -> renew -> syncAccountStreams -> gc(uploaded) -> release
  returns a structured result (no chrome / no domain)
```

**位置决策（推荐）**：放在 `@myz/sync-core/orchestrator`，而不是 `@myz/core`。
- 编排器的依赖（`SyncAccount`/`DeviceKeyPair`/`StreamDataset`/`syncAccountStreams`/`lock`/`streamGc`）全部来自 `sync-core`。
- `@myz/core` 是领域层，不应反向依赖同步协议包；放进 core 会让「领域核心」耦合 E2EE 同步。
- 备选：新建 `@myz/sync-orch` 包（更彻底隔离，但多一个包）；或放 `@myz/core/services/sync`（与计划 §3 的原列表一致，但破坏依赖方向）。

## 4. 编排器契约

```ts
// packages/sync-core/src/orchestrator.ts
export interface SyncTimers {
  setInterval(fn: () => void, ms: number): unknown;
  clearInterval(handle: unknown): void;
}

export interface SyncLockOptions {
  leaseMs?: number;          // default 30_000
  renewIntervalMs?: number;  // default leaseMs / 2
  path?: (accountId: string) => string; // default `${accountId}/lock/lease.bin`
}

export interface RunAccountSyncOptions {
  store: SyncObjectStore;
  account: SyncAccount;
  device: DeviceKeyPair;
  clientId: string;
  datasets: StreamDataset[];
  stateStore: StreamStateStore;
  lock?: SyncLockOptions | false;      // false = 不加锁（测试/特殊宿主）
  gc?: { keepManifests?: number } | false;
  timers?: SyncTimers;                 // 注入以便确定性测试
  now?: () => string;
}

export type AccountSyncStatus = "synced" | "locked" | "partial" | "error";

export interface RunAccountSyncResult {
  status: AccountSyncStatus;
  applied: number;
  streams: StreamSyncSummary[];
  uploadedStreamIds: string[];
  error?: string;
  startedAt: string;
  finishedAt: string;
}

export async function runAccountSync(
  options: RunAccountSyncOptions,
): Promise<RunAccountSyncResult>;
```

**行为**
1. `startedAt = now()`。
2. `lock !== false` 时获取账号级锁；未获取到 → `{ status: "locked" }`（不同步、不 GC）。
3. 获取到锁则启动续租（`timers.setInterval`，默认 `leaseMs/2`）。
4. `syncAccountStreams(...)`；它本身已按流隔离错误，编排器**不因单流失败中止**。
5. `gc !== false` 时，仅对 `summary.uploaded === true` 的流派生 `streamKey` 并 `gcStream`。
6. 聚合：任一 `summary.error` → `"partial"`；`syncAccountStreams` 抛错 → `"error"`；否则 `"synced"`。
7. `finally`：停续租 + **无条件尝试**释放锁（所有权校验），异常不吞掉主错误。
8. 返回结构化结果（含每流摘要与 `uploadedStreamIds`）。

**不做**：通知、badge、ChangeBus、同步态写盘——由宿主在拿到结果后执行。

## 5. 宿主改造

`v2/engine.ts` 收敛为：

```ts
const result = await runAccountSync({
  store: client,
  account,
  device: pair,
  clientId,
  datasets: [createHighlightDataset(), createInboxDataset()],
  stateStore: createStreamStateStore(account.accountId),
  lock: { leaseMs: LOCK_LEASE_MS },
  gc: { keepManifests: 30 },
});

if (result.status !== "locked") {
  await refreshInboxBadge();
  await writeSyncState({ ...existing, lastSyncAt: result.finishedAt });
}
return mapToSyncResult(result); // status/message 与原 SyncResult 对齐
```

保留：
- `loadLocalAccount` / `loadOrCreateDeviceKeys` / `readSettings` / `S3Client` / datasets / state store。
- `refreshInboxBadge`、`writeSyncState`、message handler 的 ChangeBus 发布。
- v1 回退（`syncEngine.syncNow` 在无账号时仍走 legacy）。

删除：`v2/engine.ts` 内的锁获取/续租/释放、逐流 GC、结果聚合（移入编排器）。

## 6. 与 legacy v1 的边界

- `syncEngine.ts` 保留 `settings.sync.enabled` 判断、v2 委派、v1 回退。
- `sync-plan.ts` / `sync-phases.ts` / `sync-state.ts` / `sync/storage.ts` 的 record-state 部分为 **v1 legacy**；本轮不改，仅在 AGENTS/计划中标注「迁移完成后删除」。
- 迁移（`v2/bootstrap.ts`）与配对（`v2/pairingSession.ts`）继续由宿主持有，不进入编排器。

## 7. 增量（每步可验证）

| # | 增量 | 产物 | 依赖 | 验证 |
| --- | --- | --- | --- | --- |
| **S1** | 编排器 + 类型 | `sync-core/src/orchestrator.ts`、`orchestrator.test.ts` | 无 | 内存 `SyncObjectStore` + 假数据集：锁获取/占用/释放、partial、仅上传流 GC、异常时仍释放锁 |
| **S2** | 扩展适配 | `v2/engine.ts` 调用 `runAccountSync`，删除重复锁/GC | S1 | 现有单测 + e2e 绿；`syncNow` 外部行为不变 |
| **S3** | 结果可观测 | 逐流摘要进入 `SyncResult.message` / 设置页状态（可选） | S2 | 单测/手动验证 |
| **S4** | 配置化 | `keepManifests` / 锁租约从设置读取（可选） | S2 | 默认不变 |
| **S5** | legacy 标注 | AGENTS/注释标注 v1 为待删除 | 无 | 文档一致 |
| **S6** | 删除 v1（迁移完成后） | 移除 `sync-plan/phases/state` 的 v1 路径 | 迁移截止 | e2e + 旧数据挽救流程 |

## 8. 验收标准

- 编排器单测覆盖：锁未获取 → `locked`；正常 → `synced`；单流失败 → `partial` 且其它流仍应用；仅 `uploaded` 流触发 GC；抛错时锁仍被释放。
- 扩展 `v2/engine.ts` 不再包含锁/GC/结果聚合逻辑。
- `syncNow` 的外部结果（`ok/status/message`）与改造前一致；e2e 全绿。
- `sync-core` 仍不 import 任何领域/宿主模块（保持数据无关）。

## 9. 风险与待决

**风险**
- **MV3 SW 生命周期**：`setInterval` 续租在 SW 休眠时不可靠。缓解：`timers` 注入；后续可改为 `chrome.alarms` 续租（宿主提供 `Scheduler`）。
- **锁释放**：异常路径必须释放；释放失败只告警，不覆盖主错误。
- **行为对齐**：`SyncResult` 的状态/文案需与旧实现一致（`locked`/`synced`/`error`）。
- **v1 共存**：两套路径的同步态字段不同，避免互相污染。

**待决**
1. 编排器落点：`@myz/sync-core/orchestrator`（推荐）vs `@myz/sync-orch` vs `@myz/core/services/sync`。
2. 续租定时器是否改为宿主 `Scheduler` 端口（与 I8 对齐）。
3. 是否把 `gc` 的 `keepManifests` 暴露为用户设置。
4. v1 删除的迁移截止条件。
5. `RunAccountSyncResult` 是否要暴露 `applied` 的 per-stream 明细给设置页。

## 10. 关联文档

- `docs/plan/core-refactor.md` — 分层重构与端口；§12 SyncOrch 为最后一项。
- `docs/plan/e2ee-sync-evolution.md` — 子流协议与 GC/锁修复。
- `docs/plan/e2ee-security-hardening.md` — 设备绑定、锁职责、轮换。
