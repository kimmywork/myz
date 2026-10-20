# SyncOrch — 宿主无关的同步编排（计划）

> 状态：**S0–S4 + MV3 续租已实施（2026-10-20）**。目标是把 v2 账号同步的「编排策略」从扩展宿主中剥离，做成可在扩展 / 桌面 / 移动复用的同步编排器。
>
> 关联：`docs/plan/core-refactor.md` §12（SyncOrch 为唯一剩余项）、`docs/plan/e2ee-sync-evolution.md`（子流协议，不再改动）、`docs/plan/e2ee-security-hardening.md`（设备绑定/锁/密钥模型）。

## 1. 目标与范围

**目标**：把「一次账号同步」的编排（锁生命周期、逐流同步、上传后 GC、结果聚合、异常收口）做成一个**宿主无关**的 `runAccountSync(options)`，宿主只负责：加载账号/设备/设置、提供 `SyncObjectStore` 与数据集、以及 UI/持久化副作用。

**做**
- **S0**：修复账号级锁的跨设备验签缺陷（roster 范式，`LockPayload` 新增 `deviceId`），使锁真正提供跨设备互斥。
- 新增 `runAccountSync` 编排器 + 结果类型。
- 扩展 `v2/engine.ts` 改为薄适配器，删除重复的锁/GC 逻辑。
- 编排器单测（双设备密钥的锁获取/占用/释放、部分失败、仅对已上传流 GC、`lockLost`）。

**不做**
- 不改 `sync-core` 的协议/密码学/分片格式。
- **v1 遗留同步已删除（2026-10-20）**，本计划不再涉及 v1。
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
- v1 回退：**已删除**；`syncEngine.ts` 只做启用/账号检查 + v2 委派。
- 协议原语：`packages/sync-core/src/{accountSync,lock,streamGc}.ts`。
- 每流状态：`v2/stateStore.ts`（按 `accountId` 隔离）。
- 通知/清理：`refreshInboxBadge` 位于 `background/inbox/queue.ts`；purge 逻辑随 v1 一并删除。

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

// 编排器不内置默认计时器：timers 缺省即「不续租」，宿主必须显式注入。
// 这样 MV3 / Node / Electron 下语义一致，避免把 setInterval 偷偷塞进 sync-core。

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
  lockLost?: boolean;
  startedAt: string;
  finishedAt: string;
}

export async function runAccountSync(
  options: RunAccountSyncOptions,
): Promise<RunAccountSyncResult>;
```

### 4.0 现状行为真值表（S2 必须对齐）

| 场景 | 现状行为（`v2/engine.ts`） | S2 对齐要求 |
| --- | --- | --- |
| GC 抛错 | 中断**后续流**的 GC，整体 `status: "error"`（`engine.ts:86-100,116`） | 对齐；逐流隔离 GC 错误记为后续增量 |
| badge / 写盘抛错 | 返回 `{ok:false,status:"error",message}`（`engine.ts:101-109,116`） | 宿主侧 try/catch 映射到 `error` 结果 |
| 单流失败 | `partial` 不存在，一律 `error`，message 取**第一个**失败流 | `partial → error, ok:false`，message 取第一个失败流 |
| `partial` 可见性 | `messages/sync.ts:67` 用 `result.ok` 门控 ChangeBus → 部分成功不刷新 UI | S3 若暴露 `partial`，必须同时改门控 |
| 续租丢失 | `renewLock` 返回 `{acquired:false}`，引擎忽略（仅 `.catch` 打日志） | 编排器记录 `lockLost` 并写入结果 |
| 锁未获取 | `{ok:false,status:"locked"}`，无 message | `locked` 早退：`startedAt/finishedAt` 填充，`applied:0,streams:[]` |

### 4.0b 锁前提（S0）

账号级锁是 v2 路径**唯一的**跨设备互斥（流推送无 CAS、高水位仅读侧守卫）。**S0 先修复** `lock.ts` 的跨设备验签缺陷：按 `streamManifest.ts:115-124` 的 roster 范式，用 roster 中签名者的公钥验签（`LockPayload` 新增 `deviceId`），无法解码的锁 fail-open（与现状一致），签名者被吊销 → 视为未持有。S0 与 S1 同批落地。

**行为**
1. `startedAt = now()`。
2. `lock !== false` 时获取账号级锁；未获取到 → `{ status: "locked" }`（不同步、不 GC），`startedAt/finishedAt` 填充，`applied:0,streams:[]`。
3. 获取到锁则启动续租（`timers.setInterval`，默认 `leaseMs/2`）；`renewLock` 返回 `{acquired:false}` 时记录 `lockLost=true`（不中止进行中的流同步）。
4. `syncAccountStreams(...)`；它本身已按流隔离错误，编排器**不因单流失败中止**。可选透传 `shardCount`/`tombstoneRetentionMs`（现状用默认值，计划有意省略）。
5. `gc !== false` 时，仅对 `summary.uploaded === true` 的流派生 `streamKey` 并 `gcStream`；GC 错误按真值表 §4.0 处理。
6. 聚合：任一 `summary.error` → `"partial"`；`syncAccountStreams` 抛错 → `"error"`；GC 错误 → `"error"`（§4.0）；否则 `"synced"`。
7. `finally`：停续租 + **无条件尝试**释放锁（所有权校验），异常不吞掉主错误。`releaseLock` 的 `getObject` 可能因网络/S3 错误抛出，编排器以 `releaseLockQuietly` 吞掉释放异常，保证 `finally` 不覆盖结构化结果。
8. 返回结构化结果（含每流摘要、`uploadedStreamIds`、`lockLost`）。`now` 仅控制结果时间戳；锁租期判断仍用真实时钟（`lock.ts` 内部 `Date.now()`）。

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
  timers: { setInterval, clearInterval },
});

// 宿主副作用：仅在同步真正到达远端时执行（对齐 §4.0 真值表）
if (result.status === "synced" || result.status === "partial") {
  try {
    await refreshInboxBadge();
    await writeSyncState({
      id: "state",
      clientId,
      epoch: account.epoch,
      lastManifestVersion: existing?.lastManifestVersion || 0,
      lastManifestCreatedAt: existing?.lastManifestCreatedAt || null,
      lastSyncAt: result.finishedAt,
    });
  } catch (error) {
    return { ok: false, status: "error", message: (error as Error).message };
  }
}
return mapToSyncResult(result); // partial → error, ok:false, message 取第一个失败流
```

保留：
- `loadLocalAccount` / `loadOrCreateDeviceKeys` / `readSettings` / `S3Client` / datasets / state store。
- `refreshInboxBadge`、`writeSyncState`、message handler 的 ChangeBus 发布。
- v1 回退已删除（`syncEngine.syncNow` 只走 v2）。

删除：`v2/engine.ts` 内的锁获取/续租/释放、逐流 GC、结果聚合（移入编排器）。

## 6. 与 legacy v1 的边界

**已完成（2026-10-20）**：v1（keyset）同步已整体删除——`sync-plan` / `sync-phases` / `sync-state` / `chunks` / `manifest` / `rotation` / `gc` / `records` / `types` / `lock` / `schemas` / `keyring`（设备密钥已拆到 `deviceKey.ts`）；v1 消息、设置 UI、迁移步骤、`record_state` 存储一并移除。当前只剩 v2 设备绑定账号路径。

`syncEngine.ts` 保留启用判断 + 账号检查 + v2 委派；迁移与配对继续由宿主持有，不进入编排器。

## 7. 增量（每步可验证）

| # | 增量 | 产物 | 依赖 | 验证 |
| --- | --- | --- | --- | --- |
| **S0** | 跨设备锁修复 | `sync-core/src/lock.ts`、`types.ts`、`lock.test.ts` | 无 | 两套独立设备密钥：B 不得抢 A 的活锁；revoked 设备锁视为未持有；109 个 sync-core 单测全绿 **（已完成）** |
| **S1** | 编排器 + 类型 | `sync-core/src/orchestrator.ts`、`tests/orchestrator.test.ts` | S0 | 内存 `SyncObjectStore` + 假数据集：锁获取/占用/释放（双设备密钥）、partial、仅上传流 GC、异常时仍释放锁、`lockLost` **（已完成）** |
| **S1b** | AGENTS 维护 | `sync-core/src/AGENTS.md`、`background/sync/AGENTS.md` | S1 | 文档与实现一致 **（已完成）** |
| **S2** | 扩展适配 | `v2/engine.ts` 调用 `runAccountSync`，删除重复锁/GC | S1 | 现有单测 + e2e 绿；`syncNow` 外部行为不变 **（已完成）** |
| **S3** | 结果可观测 | `SyncResult.partial` + 逐流摘要进 message；ChangeBus 在 partial 时也发布；设置页展示 | S2 | 单测/手动验证 **（已完成）** |
| **S4** | 配置化 | `keepManifests` / `lockLeaseMs` 进 `SyncSettingsSchema` + 高级设置 UI；默认不变 | S2 | 默认不变 **（已完成）** |
| **S4b** | MV3 续租 | `v2/timers.ts`：cadence ≥ 30s 走宿主 `Scheduler`（chrome.alarms），否则 `setInterval` | S4 | 适配器单测 **（已完成）** |
| **S5** | legacy 标注 | AGENTS/注释标注 v1 为待删除 | 无 | 文档一致 **（已完成：v1 已删除）** |
| **S6** | 删除 v1（迁移完成后） | 移除 `sync-plan/phases/state` 的 v1 路径 | 迁移截止 | e2e + 旧数据挽救流程 **（已完成 2026-10-20）** |

## 8. 验收标准

- S0 锁单测覆盖：双设备密钥下 B 不得抢 A 的活锁；revoked 设备锁视为未持有；expired → steal；续租丢失 → `lockLost`。
- 编排器单测覆盖：锁未获取 → `locked`；正常 → `synced`；单流失败 → `partial` 且其它流仍应用；仅 `uploaded` 流触发 GC；抛错时锁仍被释放。
- 扩展 `v2/engine.ts` 不再包含锁/GC/结果聚合逻辑。
- `syncNow` 的外部结果（`ok/status/message`）与改造前一致；partial 额外带 `partial:true` 与逐流摘要；ChangeBus 在 partial 时也发布。
- `keepManifests` / `lockLeaseMs` 从设置读取，缺省值不变（30 / 30000）。
- 续租适配器：cadence ≥ 30s 走 `Scheduler`，否则 `setInterval`；单测覆盖两条路径。
- `sync-core` 仍不 import 任何领域/宿主模块（保持数据无关）。

## 9. 风险与待决

**风险**
- **MV3 SW 生命周期**：`setInterval` 续租在 SW 休眠时不可靠。**已缓解**：`v2/timers.ts` 在 cadence ≥ 30s 时走宿主 `Scheduler`（chrome.alarms，可跨休眠）；低于 30s 回退 `setInterval`，此时同步本身仍维持 SW 存活，SW 一旦死亡同步也随之结束、租约自然过期。
- **锁释放**：异常路径必须释放；释放失败只告警，不覆盖主错误（`releaseLockQuietly` 吞掉 `getObject` 抛错）。
- **行为对齐**：`SyncResult` 的 `ok/status/message` 与旧实现一致；partial 以 `ok:false + partial:true` 暴露。
- **v1 共存**：**已消除**（2026-10-20 删除 v1）。

**待决**
1. 编排器落点：**已关闭** — `@myz/sync-core/orchestrator`（`accountSync.ts` 为先例；通配导出零配置）。
2. 续租定时器：**已关闭** — 宿主 `Scheduler` 适配器（≥30s） + `setInterval` 回退，见 S4b。
3. `keepManifests` / `lockLeaseMs` 设置化：**已完成**（S4）。
4. v1 删除的迁移截止条件 **（已完成 2026-10-20）**。
5. per-stream 明细：**已完成**（S3，进入 `SyncResult.message`）。

## 10. 关联文档

- `docs/plan/core-refactor.md` — 分层重构与端口；§12 SyncOrch 为最后一项。
- `docs/plan/e2ee-sync-evolution.md` — 子流协议与 GC/锁修复。
- `docs/plan/e2ee-security-hardening.md` — 设备绑定、锁职责、轮换。
