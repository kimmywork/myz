# Core 分层重构与再设计（领域核心 / 端口 / 宿主适配器）

> 状态：**v2，已完成**。I1（消息契约表 + 泛型注册表 + D3 falsy 解包修复 + 特权元数据入契约）、I1b（调用点迁移到类型化 `invoke`）、I2（Transport 端口 + `MessageContext`）、I3（`@myz/core` 领域层 + 模型注册表）、I4（存储端口 + IndexedDB 实现 + opaque 溢出表）、I4b（`StagedAssetStore`）、I5（RecordsService + handler 瘦身 + D3.3）、I5b（InboxService）、I5c（Import / Export 服务）、I6（opaque 闭环 / D1 收口）、I6b（显式 `schemaId` + PayloadCodec）、I7（`ChangeBus` 多上下文刷新）、I8（`Scheduler` / `Notifier` 端口化）、I9（Source / Locator 读时归一化）、I10（Node 宿主集成验证）**已实现并验证**（见 §12）；SyncOrch 已单独规划并实施（`docs/plan/implemented/sync-orch.md`）；`@myz/dashboard-core`（D2 零调用 dead code）已于 2026-10-20 删除。
>
> §10 五项关键决策已于 2026-10-16 **由用户确认锁定**：1 删除 `dashboard-core`、2 生命周期锁 `record` 级、3 解析不进 core、4 砍掉 `JobQueue`、5 读时归一化。
>
> 评审修订要点见 §11。v1 的现状诊断经代码核验**全部属实**；v2 修正了 3 个架构级缺陷（D1–D3）、4 个场景错位风险（R1–R4），并对 §10 待决项作出收敛决策。
>
> 关联文档：
> - `docs/plan/future-plan.md` — 产品收敛决策（无云 AI、不存文档正文、无统计聚类）；本文的多条护栏沿用其结论。
> - `docs/plan/e2ee-sync-evolution.md` — 子流/分片协议；本文不改动其协议，只把「数据判别」接到 `apply` 侧。
> - `docs/plan/inbox-flow.md` — Inbox 状态模型；本文把它泛化为通用生命周期。

## 1. 目标与范围

**目标**：把现在「领域规则焊在扩展宿主 I/O 里」的结构，重构为 **领域核心 / 端口 / 宿主适配器** 三层，使扩展、桌面、移动三种形态共享同一套核心；此后新增采集面（视频 / OCR / ASR / DOCX / 外部来源）与新增应用形态不再改动核心。

**范围（做）**
- 领域模型注册表（来源 / 定位器 / 判别式 / 生命周期 / 关系）。
- 领域服务与端口契约。
- 消息契约与传输抽象。
- 同步侧「记录判别式 + payload codec」接线，**并补齐 opaque 记录的本地物化闭环**（D1）。

**范围（不做 / 保持不变）**
- `packages/sync-core` 的协议与数据无关性（`data: unknown` 是特性，不是缺陷）。
- 网页内容脚本、PDF/EPUB 渲染器（DOM/canvas 本质属 Web）。
- `future-plan.md` 的收敛决策（无云 AI、不存文档正文、不做统计聚类）。
- 本轮**不引入持久 `JobQueue`**（R2），**不引入 source 级生命周期**（R3）。

## 2. 现状问题（附代码证据）

| # | 问题 | 证据 | 影响 |
| --- | --- | --- | --- |
| a | 领域规则与宿主 I/O 焊死：Inbox 状态机直接 import IndexedDB 存储与 `chrome.action` | `myz-annotator/src/background/inbox/actions.ts:16-18,55`、`inbox/queue.ts:9,123-138` | 非扩展宿主无法复用 |
| b | 设置模型（type/default/normalize/schema）与 `chrome.storage` 焊死 | `background/storage.ts:191-219`、`background/settings.ts` | 换宿主需重写模型 |
| c | 来源是 enum + 字符串前缀，定位器是平铺可选字段 | `packages/shared/src/enums.ts:7-17`、`packages/shared/src/schemas/records/v1.ts:18-33` | 加视频/图片/DOCX 要改核心类型 |
| d | 同步记录无显式 `schemaId`，类型靠 streamId / recordId 前缀约定 | `packages/sync-core/src/types.ts:1-14`、`background/sync/v2/datasets.ts`、`v2/inboxDataset.ts` | 一条流无法承载异构类型；v1 类型仍 `import MyZRecord` |
| e | 无已接线的 payload registry（I7 曾按死代码删除）；且 opaque preservation **从未接线** | `packages/shared/src/schemaRegistry.ts`（仅版本字典）、`shards.ts:115` | 「blob ↔ 具体数据」迁移缺失；未知记录会丢（见 D1） |
| f | 消息名为裸字符串、无契约表；两个 registry 各自单例；响应解包有 falsy bug | `packages/shared/src/messaging.ts:1,27`、`background/messages/handler.ts`、`content/messages/handler.ts` | 拼写仅运行时暴露；`data` 为 `null/false/0/""` 时解包错误 |
| g | 传输绑死 `chrome.*`，授权与传输混杂且易与注册表脱节 | `background.ts:215`、`background/messages/trustedSender.ts:7-89` | 两个硬编码 `Set<string>` 需人工与 handler 同步 |
| h | 多上下文一致性只靠「拉」，无推送失效 | `dashboard/stores/highlights.ts:66`；唯一监听 `storage.onChanged` 的是未接线的 `dashboard/host/extension.ts:110`（该文件已随 D2 删除） | 多标签读到陈旧数据 |
| i | 后台只有 `chrome.alarms`，无持久作业队列 | `background/sync/scheduler.ts`、`background/inbox/reminder.ts` | 本轮 YAGNI（见 R2）；Sync v2 已有分片级断点续传 |

**评审补充发现（v2）**
- `background/sync/deletions.ts` 的级联墓碑逻辑也直接耦合 `storage.ts`，需一并收进领域服务。
- `background/storage.ts:142-157` 在设置读写里耦合了 `openS3Credentials`/`sealS3Credentials`（设备密钥加解密 S3 凭证）；抽 `SettingsStore` 时须明确凭证加解密归属。
- `src/reader/progress-store.ts` 也依赖 `SOURCE_TYPES`；来源模型变更需同步阅读进度侧。
- 存在**两套传输方向**：UI/CS → SW 的 `sendMessage`，与 SW → CS 的 `sendToContentScript`；响应包装不一致。

## 3. 目标架构

```text
┌────────────────────────────────────────────────────────────────────┐
│ UI 表面（按宿主）                                                     │
│  dashboard-ui · content script · pdf/epub readers · popup · stitch   │
└───────────────────────────┬────────────────────────────────────────┘
                            │ 类型化调用：invoke<K>() / host façade
┌───────────────────────────▼────────────────────────────────────────┐
│ @myz/core —— 领域层（环境无关，无 chrome / DOM）                       │
│  模型：SourceKind / LocatorKind / PayloadCodec / Lifecycle / Relation │
│  服务：Records · Inbox · Settings · Search · ImportExport · SyncOrch  │
│  端口：RecordsStore · SettingsStore · BlobStore · ReaderProgressStore │
│        · Scheduler · Notifier · ChangeBus · Transport · Capture       │
└───────────────────────────┬────────────────────────────────────────┘
        ┌───────────────────┴────────────────────────┐
        ▼                                            ▼
 @myz/sync-core                            Host adapters
 (数据无关协议)                             extension/desktop/mobile
```

> `@myz/dashboard-core` 已于 2026-10-20 删除：`createExtensionDashboardHost` 全仓零调用，且其过时 feature flags / v1 `SyncRepository` 与 `@myz/core` 端口形成双门面。

**包结构（目标，决策见 §10/1）**

| 包 | 职责 | 变化 |
| --- | --- | --- |
| `@myz/shared` | 纯原语：schemas/types/enums/serializer/`highlightRange`/cjk/url/tags + **消息契约表（纯类型）** | 收敛：只留纯的 |
| `@myz/core`（新） | 领域模型注册表 + 领域服务 + 端口接口 | 新增 |
| ~~`@myz/dashboard-core`~~ | **已删除（2026-10-20）**：零调用 dead code；过时 AI/Vector/MCP feature flags 与 v1 `SyncRepository` 不再保留 | 删除，消除双门面 |
| `@myz/sync-core` | E2EE、数据无关协议 | 不变 |
| `@myz/dashboard-ui` | 共享 UI | 不变 |
| `myz-annotator/src/*` | 宿主适配器 + UI + 网页专属（content / readers / capture） | 逐步瘦身 |

## 4. 核心领域模型

### 4.1 身份（Identity）

- **记录 id**：延续前缀方案（主流 `h:<id>`）；新记录类型按前缀区分（如 `n:` 笔记）。写进 core 类型并冻结。
- **来源标识**：把 `SOURCE_TYPES` enum 升级为可扩展的 **SourceKind registry**（**值对象/注册表，不是持久化实体**，见 §10/2）：

```ts
interface SourceKindDef {
  kind: string // "web" | "pdf" | "epub" | "docx" | "video" | "image" ...
  identity: "url" | "fingerprint"
  capabilities: { paged?: boolean; reflow?: boolean; temporal?: boolean }
}
```

`web` → url；`pdf`/`epub` → fingerprint（沿用 `myz-pdf:` / `myz-epub:` 前缀）；`docx`/`video`/`image` 预留。来源**不存正文**。

### 4.2 定位器（Locator）

把 `range` / `pdfLocator` / `epubLocator` 收敛为判别式联合：

```ts
type Locator =
  | { kind: "text-range"; range: SerializedRange }
  | { kind: "pdf-page-rect"; locator: PdfLocator }
  | { kind: "epub"; locator: EpubLocator }
  | { kind: "video-time"; start: number; end: number } // 预留
  | { kind: "image-region"; rect: PdfRect } // 预留
```

- **Locator registry**：`locatorKind → zod schema`（与 `MyZRecordRegistry` 同模式）。
- **迁移策略（决策见 §10/5）**：**读时归一化（read-time normalization）+ 新写/编辑时写新字段**，可选双写平铺字段过渡一个版本；**严禁启动时对存量已同步记录做静默全量写回填**。原因：`hashStreamRecord` 对整条记录 JSON 哈希（`stream-records.ts:67-76`），全量改结构会触发 E2EE 全量分片重哈希与重上传风暴（R4）。

### 4.3 记录判别式 + payload codec（落实「同步与数据无关」）

- 记录 payload 增加 **`schemaId`**（判别式）+ **`schemaVersion`**。
- **Payload codec registry**（放 `@myz/core`）：`schemaId → { schema, migrate(blob) → latest }`，在 dataset 的 `apply` 侧调用；**`sync-core` 永远保持 `data: unknown`**。
- **【D1 修正】opaque 记录必须本地物化，否则会丢数据。** 现状：`preserveUnknownRecords`（`shards.ts:115`）从未接线；`stream-pull.ts:101` 按 hash 跳过未变分片；`buildStreamPush`（`stream-push.ts:79-120`）在重打包分片时只写 `options.records`（本地 collect + 远端 winners），**不认识且未落盘的记录会被抹除**；`inboxDataset.apply` 的 `if (!parsed) return` 已是活缺陷。
  - **修正要求**：本地存储提供 **opaque 溢出表**（或在原 store 中原样落盘 raw record），保证 `dataset.collect()` 下次一定把未知记录原样回传；`apply` 对未知 `schemaId`/未知 `recordId` 前缀**不得丢弃**，必须原样落盘。
  - 备选：改 `stream-core` 的 `buildStreamPush` 保留 `baseManifest.recordsIndex` 中本地不认识的记录——但 pull 可能因跳过分片而未持有其密文，故**首选「本地 opaque 存储 + collect 回传」**，符合「不改 sync-core」的边界。
  - 验收：新增未知 `schemaId` 后，旧客户端**连续两次同步**仍不删该记录（回归测试必须覆盖「第二次同步重打包同分片」场景）。

### 4.4 生命周期与聚合（三元素模型）

- **三元素**：`Record`（内容）— `Source`（来源 / 聚合边界）— `Relation`（关系）。
- **生命周期保持在 `record` 级（含 `bookmark` 记录）**（决策见 §10/2）。整页/整书收藏已由 `RECORD_KINDS.BOOKMARK` 表达为一条 `Record`，天然具备 `status:h:<id>` 生命周期；当前无独立 `s:<id>` Source 实体表，引入 source 级状态会导致「来源 archived 但内部新划 pending」的正交冲突。
- 现有 `rel:` 泛化为 `Relation`（backlinks 复用，不另造一套）。
- **护栏**：内部用 tagged union；UI 心智仍是「记录 → 来源」，不向用户暴露四个概念。

## 5. 端口契约（Ports）

| 端口 | 职责 | 参考 / 来源 |
| --- | --- | --- |
| `Transport` | Runtime RPC（UI/CS→SW）与 Tab RPC（SW→CS）**两张契约表** + `MessageContext` | 新；扩展实现 = 现有 messaging |
| `RecordsStore` | findById / findByUrl / listRecent / upsert / delete + **opaque 溢出读写**（D1） | `background/storage.ts` 是其 IndexedDB 实现 |
| `SettingsStore` | 设置读写（**凭证加解密归 keyring/crypto，不归本端口**） | 现焊在 `chrome.storage` |
| `BlobStore` / `StagedAssetStore` | 截图 / 图片缓存（base64/Blob） | `staged_assets` |
| `ReaderProgressStore` | 阅读进度 + 本地文件句柄（**见 R1，不走 Transport**） | `src/reader/progress-store.ts` |
| `InboxStateStore` / `StreamStateStore` | Inbox 本地态 / 每流同步态 | `inbox_state` / `sync/v2/stateStore.ts` |
| `Scheduler` | 周期任务 | `chrome.alarms` |
| `Notifier` | badge / 通知 | `chrome.action` / `notifications` |
| `ChangeBus` | 变更通知（多上下文失效） | 新；扩展 = BroadcastChannel + storage.onChanged |
| `CapturePort` | 抓网页 / 导入图片 / 打开文档 | `*source.ts` / `sendToContentScript` |
| `SearchIndex`（后置） | 全文索引 | 新 |

**消息契约表**（落地位置见 §12）：`@myz/shared/messageRegistry` 提供通用泛型注册表；每个通道的契约映射放在**宿主内**（`myz-annotator/src/messaging/contract.ts`），因为消息键是宿主内部契约、且引用宿主类型：

```ts
interface MyzRuntimeMap { // UI/CS → SW
  "myz:getAllHighlights": { payload: void; result: MyZRecord[] }
  "myz:saveHighlight": { payload: Partial<MyZRecord>; result: MyZRecord }
  // ...
}
interface MyzTabMap { // SW → CS
  "myz:convertHtmlToMarkdown": { payload: { html: string }; result: { markdown: string } }
  "myz:toggleZenMode": { payload: void; result: unknown }
  // ...
}
```

- 泛型化 `invoke<K>` / `handle<K>`，拼写编译期报错。
- **【D3 修正】**：(a) 修复 `messaging.ts:27` falsy 解包（改为 `'data' in response ? response.data : response`）；(b) `trustedSender.ts` 的两个 `Set<string>` 收敛为契约表的类型/元数据；(c) 明确 Runtime RPC 与 Tab RPC 分表。
- **【D3.3 修正】** `saveHighlight` 现通过 `sendToContentScript("myz:convertHtmlToMarkdown")` 借网页 DOM 转 Markdown（`highlights.ts:55-75`）。抽 `RecordsService` 时**不得**内联该反向调用；应把 HTML→Markdown 前移到 Content Script 采集侧，或抽象为可选的 `HtmlToMarkdown` 端口，使 `RecordsService.save()` 保持纯领域 + 存储。

**同步侧保持现状**：`SyncObjectStore` / `SyncDatasetAdapter` / `SyncStateStore`（`packages/sync-core/src/adapters.ts`）是端口模板，不改。

## 6. 各宿主如何实现

| 关注点 | extension | desktop | mobile |
| --- | --- | --- | --- |
| Transport | chrome runtime / tabs | 进程内直调（无需消息） | 进程内 |
| 存储 | IndexedDB | SQLite / 文件 | SQLite |
| 阅读进度 / 文件句柄 | 阅读器同源 IndexedDB（R1） | 本地文件路径字符串 | 本地文件路径 |
| Scheduler | `chrome.alarms` | 定时器 | OS 后台 |
| Notifier | `chrome.action` / notification | 系统通知 | 系统通知 |
| ChangeBus | BroadcastChannel + storage.onChanged | 进程内 emitter | 进程内 |
| Capture | content script | 扩展驱动 + 本地文件 | 分享表单 / 扩展 |
| 单写者 | background SW（**文件句柄/进度除外**，见 R1） | 主进程服务 | 主进程服务 |

- **【R1 修正】** `FileSystemFileHandle` **不可经 `sendMessage` 传输**（JSON 序列化），且 `requestPermission` 需页面瞬态激活。因此：`StagedAssetStore` 与 `ReaderProgressStore` 拆开；后者保持**阅读器页面同源 IndexedDB 直连**，不纳入 SW 单写者模型；桌面端对应本地文件路径字符串。
- 领域服务在每个宿主**单实例 / 单写者**；其它上下文只读 + 订阅 `ChangeBus`。

## 7. 增量落地顺序（每步可独立验证）

| # | 增量 | 产物 | 依赖 | 验证 |
| --- | --- | --- | --- | --- |
| **I1** | 消息契约表 + 泛型 API + **D3 修复** | `MyzRuntimeMap`/`MyzTabMap`、泛型 `invoke`/`handle`；修复 falsy 解包；特权元数据入契约；清查平铺 payload 调用点 | 无 | 全部注册点编译通过；行为不变；新增 falsy 返回的回归测试 **（已完成，见 §12；调用点迁移见 I1b）** |
| **I2** | Transport 端口 + `MessageContext` | `Transport` 接口 + 扩展实现（Runtime/Tab 两方向）；`messaging.ts` 降级为 adapter | I1 | 现有 e2e 全绿 |
| **I3** | 建立 `@myz/core` + 领域模型注册表 | Source / Locator / PayloadCodec / Lifecycle / Relation + 迁移纯逻辑（inbox 状态机、`buildQueue`、记录身份、设置模型） | 无 | 单测覆盖状态机与注册表；扩展旧实现并行保留 **（已完成，见 §12）** |
| **I4** | 存储端口 + IndexedDB 实现（**含 opaque 溢出表**） | `RecordsStore` / `SettingsStore` / `BlobStore` / `InboxStateStore` | I3 | 契约测试通过；数据零迁移；opaque 往返测试 **（RecordsStore/InboxStateStore/SettingsStore 已完成；`StagedAssetStore` 见 I4b）** |
| **I5** | 领域服务 + handler 瘦身 | Records / Inbox / Settings / ImportExport / SyncOrch 服务；handler 变「解码 → 调服务 → 编码」；HTML→Markdown 移出 RecordsService | I2, I4 | 同一单测跑通服务层；e2e 全绿 **（全部完成；Settings 由 `SettingsStore` 端口承担；SyncOrch 见 `implemented/sync-orch.md`）** |
| **I6** | `schemaId` + payload codec + **opaque 闭环** | 记录带判别式；codec registry 接到 sync `apply`；未知记录本地物化 + collect 回传（**D1**） | I3, I4 | **连续两次同步**后未知 `schemaId` 旧端仍不删；迁移测试 **（opaque 闭环已完成；显式 `schemaId` + codec 接线见 I6b）** |
| **I7** | `ChangeBus` + 订阅（**提前到 I5 之后立即做**） | 端口 + 扩展实现（BroadcastChannel + storage.onChanged 双通道）；dashboard / readers 刷新 | I4 | 双标签写入后另一端自动刷新；阅读器/内容层主题与记录刷新 **（已完成，见 §12；inbox/readers/popup 订阅仍未接，非阻塞）** |
| **I8** | `Scheduler` / `Notifier` 端口化（**移除 JobQueue**） | 端口 + 扩展实现 | I4 | 定时 / 通知行为不变 **（已完成，见 §12）** |
| **I9** | Source / Locator 落地（**读时归一化**） | schema + 读路径归一化 + 来源模型进 UI，预留 video / image | I3, I6 | 旧记录可在不重哈希前提下读出；来源分组不退化为「概念」 **（已完成，见 §12）** |
| **I10** | 宿主无关性验证（**改为 Node/Vitest 集成套件**） | 在 Node 下用 `better-sqlite3`（或内存适配器）跑完整领域服务集成测试 | I2–I9 | **「换宿主只写 adapter」被证明**（core 零改动）；不长期维护半成品桌面壳 **（已完成，见 §12；用内存适配器）** |

## 8. 验收标准

- 换存储实现（IndexedDB → SQLite）**不改任何 core 代码**。
- 消息名拼错在**编译期**报错；两端共用同一契约；`null/false/0/""` 返回值正确解包（D3）。
- 新增 `schemaId` / SourceKind / LocatorKind 后，旧客户端**连续两次同步仍不删未知记录**（D1）。
- Locator 迁移**不触发**存量记录全量重哈希/重上传（R4）。
- `Record` 写入后，**其它上下文（标签 / 阅读器）自动刷新**（ChangeBus）。
- Node 集成套件能运行扩展同一套领域服务，核心层**零分叉**（R2/§10/4）。
- 现有全部测试（annotator / shared / sync-core / dashboard-*）与 e2e 保持绿。

## 9. 风险与护栏

**风险**

- **过度抽象**：core 边界过宽 → 提前抽象。缓解：只在「第二个宿主确实跨过这条缝」时抽。
- **迁移面大**：I1 牵动全部注册点。缓解：契约表 + 泛型先并存，再逐个收敛。
- **opaque/迁移丢数据**：D1 与 R4。缓解：本地 opaque 物化 + 读时归一化 + 连续两次同步回归测试。
- **长期分支**：I3–I5 期间新旧并存。缓解：按领域逐个切换，每步可发布。
- **MV3 SW 生命周期**：`ChangeBus` / `BroadcastChannel` 在 SW 受限。缓解：`broadcast` 走 `chrome.storage.onChanged` 兜底。

**护栏（沿用 `future-plan.md` 决策）**

- **能力不进 core**：视频 / OCR / ASR / DOCX 解析都是适配器，core 只认产出（记录 + 定位器 + `schemaId`）。
- **来源不存正文**：只做身份 + 元数据 + 定位器。
- **消息键是宿主内部契约**，不作跨端协议；跨端判别是 `schemaId`。
- **不向用户增加概念**：内部注册表，UI 心智不变。
- **不引云端 AI**；端侧能力显式 opt-in。

## 10. 关键决策（已确认锁定，2026-10-16）

| # | 原待决问题 | 决策 | 理由（结合代码与场景） |
| --- | --- | --- | --- |
| **1** | `@myz/core` 命名与是否与 `dashboard-core` 合并 | **删除**：`@myz/dashboard-core` 与未接线的 `dashboard/host/extension.ts` 一并移除；将来出现第二个宿主时再按实际需要重建薄契约层 | `createExtensionDashboardHost` **零调用**（dead code），`host.ts` 定义严重滞后且含废弃 AI/Vector/MCP flags 与 v1 `SyncRepository`；保留会形成 `RecordRepository` vs `RecordsStore` 双门面 |
| **2** | 生命周期是否参数化到 `source` 级 | **只留 `record` 级** | 整页/整书收藏已由 `BOOKMARK` 记录表达；无独立 `Source` 表时 source 级状态会引发父子状态冲突 |
| **3** | 读者纯解析是否提入 core | **不提入 `@myz/core`**（留在 `myz-annotator/src/{pdf,epub}`，未来跨包复用再单列 `@myz/reader-core`） | `src/epub/parse.ts` 依赖 `DOMParser`（SW / Node 无原生实现），违背 core「零 DOM」硬约束；且属渲染管线 |
| **4** | `JobQueue` 是否在 I8 落地 | **不落地，也不留空壳**；I8 仅交付 `Scheduler` + `Notifier` 端口；I10 用 Node 集成套件替代半成品桌面壳 | OCR/ASR 未立项；Sync v2 已有分片级断点续传 + 锁续租，`chrome.alarms` 触发即可自愈；避免重蹈 I7 registry 死代码覆辙 |
| **5** | Locator 迁移方式 | **读时归一化 + 按需写迁移** | 避免触发 E2EE 全量分片重哈希与重上传风暴（见 §4.2 / R4） |

## 11. 评审修订记录（v2，2026-10-16）

v1 的 §2 现状诊断 9 条经代码核验**全部属实**。v2 采纳并落实如下修订：

**架构级缺陷（必改）**

- **D1（严重）opaque preservation 未接线，未知记录会丢**：`preserveUnknownRecords` 仅被单测调用；`stream-pull.ts:101` 跳过分片、`stream-push.ts:79-120` 重建分片时丢弃本地不认识的记录。→ 落为 §4.3「本地 opaque 物化 + collect 回传」与 I6 的强制验收。
- **D2（架构冲突）`dashboard-core` 半悬空 + 停在 v1**：`createExtensionDashboardHost` 零调用；含废弃 AI/Vector/MCP flags 与 v1 `SyncRepository`。→ **已删除（2026-10-20）**：`packages/dashboard-core` 与 `dashboard/host/extension.ts` 移除，宿主依赖/别名/文档同步清理。
- **D3（传输层漏洞）**：`messaging.ts:27` falsy 解包 bug + 平铺 payload 兼容 + `saveHighlight` 反向借网页 DOM 转 Markdown。→ 落为 §5 契约分表、I1 修复项、`HtmlToMarkdown` 端口约束。

**场景 / 边界风险（采纳）**

- **R1**：`FileSystemFileHandle` 不可经 Transport 传输、需瞬态激活 → `ReaderProgressStore` 独立、不纳入 SW 单写者。
- **R2**：本轮 YAGNI 持久 `JobQueue` → I8 精简；I10 改为 Node 集成套件。
- **R3**：source 级生命周期无产品落点 → 生命周期锁 `record` 级。
- **R4**：Locator 写时全量回填会触发 E2EE 重哈希风暴 → 改读时归一化。

**增量顺序调整**：I1 增补 D3 修复；I4 增补 opaque 溢出表；I6 增补 opaque 闭环验收；**I7（ChangeBus）提前到 I5 之后**；I8 移除 JobQueue；I10 改为 Node 集成套件。

**未采纳 / 保留**：无。评审的三项缺陷与四项风险均经核验属实并纳入。

## 12. 实施状态

- **I1 完成（2026-10-16）**：建立消息契约表并接线到两端注册表。
  - `@myz/shared/messageRegistry`：`createMessageRegistry<M>()` 泛型化；`registerMessageHandler<K>` 按契约做编译校验；`handleMessage` 仍是线上边界的非类型化派发。
  - `myz-annotator/src/messaging/contract.ts`：`MyzRuntimeMap`（47 键）+ `MyzTabMap`（10 键）+ `myz:zenModeStateChanged` 通知键。**落点修正**：契约放在宿主内而非 `@myz/shared`，因为消息键是宿主内部契约且引用宿主类型（`Settings`/`StagedAsset`/Sync 结果类型等）。
  - `myz-annotator/src/messaging/privilege.ts`：特权 / 手势集合改为 `ReadonlySet<MyzRuntimeType>`（原来两个手维护的 `Set<string>`），`trustedSender.ts` 改为引用它（D3-b）。平铺 `{type, ...rest}` 调用点清查：无调用方使用（D3 附带项）。
  - **D3-a 修复**：`packages/shared/src/messaging.ts` 的解包改为按 `"data" in response` 判定（原先 `response.data || response` 会在 `null/false/0/""` 时错误回退整个信封）；补 2 条回归测试。
  - 验证：`vue-tsc -b` 0；shared 94、annotator 276 单测通过；eslint 0；`vite build` 成功。
  - **后续**：调用点迁移已由 I1b 完成（类型化 `invoke`）；Tab 方向的 `sendMessageToTab` 仍独立于 `Transport.invoke`。
- **I2 完成（2026-10-16）**：Transport 端口 + `MessageContext`。
  - `packages/shared/src/transport.ts`：宿主无关的 `Transport<M>` 端口（`invoke` / `handle` / `has` / `run`）。
  - `packages/shared/src/messageRegistry.ts`：新增 `MessageContext`（`tabId` / `windowId` / `url` / `trusted`），handler 第二参由裸 `chrome.runtime.MessageSender` 改为 `MessageContext`——**shared 注册表不再引用 chrome**。
  - 扩展适配：`src/messaging/context.ts`（`toMessageContext` / `isTrustedExtensionPage`）+ `src/messaging/transport.ts`（`createRuntimeTransport`，Chrome 实现）。background `handler.ts` 改为 `createRuntimeTransport<MyzRuntimeMap>()` 绑定导出。
  - `trustedSender.ts`：`authorizeMessage(type, payload, ctx)` 改用 `ctx.trusted`；`background.ts` / `content/message-listener.ts` 在派发边界构造 ctx。
  - 用到 sender 的处理器（`background/messages/capture.ts`、`highlights.ts`）改用 `ctx.tabId` / `ctx.windowId`。
  - 验证：`vue-tsc -b` 0；shared 94、annotator 276 单测通过；eslint 0 error（仅 `highlights.ts` 既有 `max-lines` 警告）；`vite build` 成功。
  - **遗留**：Tab 方向的 `invoke` 仍走 `sendToContentScript`（含 tab 发现逻辑），未并入 `Transport.invoke`；调用点仍走宽松 `sendMessage`（I1b）。
- **I3 完成（2026-10-16）**：建立 `@myz/core` 领域层并迁移纯逻辑。
  - 新包 `packages/core`（`@myz/core`，env-agnostic，无 chrome / DOM / IO），子路径导出 `identity` / `source-kind` / `locator` / `payload-codec` / `lifecycle` / `relations` / `inbox`。
  - 模型注册表：**记录身份**（`h:` 前缀 ↔ kind，新增 kind 只改这里）、**SourceKind**（web/pdf/epub + 身份方案 / 能力位 / 合成 url 前缀）、**LocatorKind** + `normalizeLocator`（读时归一化，§10/5）、**PayloadCodec** registry（`schemaId` + 版本 + 迁移，供 sync `apply` 侧用）、**Lifecycle**（`transitionLifecycle` 纯状态迁移）、**Relation**（`rel:` + `backlinksOf`）。
  - 迁移：`recordIdForHighlight` / `parseRecordId`（扩展 `background/sync/records.ts` 改为 re-export core，`datasets.ts` 用 `parsed.kind`）；`buildInboxQueue` 读模型（扩展 `background/inbox/queue.ts` 委托，badge 留在扩展）；`setInboxStatus` 用 core `transitionLifecycle`。
  - 测试：`packages/core/tests/` 共 16 用例。
  - 验证：core 16、annotator 276 单测通过；`vue-tsc -b` 0；eslint 0；`vite build` 成功。
  - **后续**：设置由 I4 的 `SettingsStore` 端口承担；inbox 存储动作已由 I5b 的 `InboxService` 收敛。
- **I4 完成（2026-10-16）**：存储端口 + IndexedDB 实现（含 opaque 溢出表）。
  - `@myz/core/ports`：`RecordsStore`（含 `putOpaque` / `listOpaque` / `deleteOpaque`）、`InboxStateStore`、`SettingsStore<T>` 端口接口（按用例命名，不泄露存储细节）。
  - 扩展：`myz_db` v3→v4 新增 `opaque_records` store（**数据零迁移**，仅新增 store，旧 store 不变）；`background/storage.ts` 增 opaque 读写；新增 `background/stores.ts` 以 IndexedDB 实现三个端口。
  - 契约测试：`tests/unit/background/stores.test.ts`（fake-indexeddb）覆盖 records 增删查 / 按 url 查 / **opaque 往返** + inbox state 往返。
  - 验证：core 16、annotator 280 单测通过；`vue-tsc -b` 0；eslint 0；`vite build` 成功。
  - **后续**：`StagedAssetStore` 已由 I4b 落地；`BlobStore` 未单独引入（图片/截图缓存由 `StagedAssetStore` 覆盖）；D1 opaque 接线已由 I6 完成；设置模型按决策由 `SettingsStore` 端口承担，不搬入 core。
- **I5 完成（2026-10-16，部分）**：`RecordsService` 抽入 core + handler 瘦身 + D3.3 修复。
  - `@myz/core/services/records`：`createRecord` / `updateRecord` / `updateRecordRange` / `removeRecord(s)` / `updateRecordsPatch` / `listRecords` / `getRecordsForUrls` / `listTags` + helpers（`normalizeIds` / `resolveRequestedUrls` / `applyKindShape`）。所有宿主能力（`newId` / `now` / `htmlToMarkdown`）经 `RecordServiceContext` 注入 → **服务保持纯领域 + 存储**。
  - **D3.3 修复**：HTML→Markdown 不再由服务内联反向调用 content script；扩展在 handler 侧注入 `htmlToMarkdown` 端口（绑定 `sendToContentScript`）。
  - `background/messages/highlights.ts` 改为「解码 → 调服务 → 编码」；删除 `highlights/record-helpers.ts`（逻辑移入 core，去重复）。
  - 测试：新增 `packages/core/tests/services-records.test.ts`（内存 store）10 用例；扩展既有 `highlights.test.ts` **原样通过**（行为不变）。
  - 验证：core 26、annotator 280 单测通过；`vue-tsc -b` 0；eslint 0；`vite build` 成功。
  - **后续**：`InboxService`（I5b）、`ImportExportService`（I5c）、`SyncOrch`（`implemented/sync-orch.md`）均已完成；`SettingsService` 由 `SettingsStore` 端口承担（见 I5b 说明）。
- **I5b 完成（2026-10-16）**：`InboxService` 抽入 core。
  - `@myz/core/services/inbox`：`setInboxStatus` / `getInboxStatus` / `setInboxMark` / `addInboxRelation` / `removeInboxRelation` / `listInboxStates`，纯逻辑 over `InboxStateStore`（复用 I3 的 `transitionLifecycle`）。
  - 扩展 `background/inbox/actions.ts` 变为薄包装：调 core service + 本宿主副作用（badge、删除日志、`changeBus` 发布）。
  - 测试：新增 `packages/core/tests/services-inbox.test.ts`（内存 store）3 用例；扩展 `inbox-actions.test.ts` **原样通过**。
  - 验证：core 29、annotator 287 单测通过；`vue-tsc -b` 0；eslint 0；`vite build` 成功。
  - **说明**：`SettingsService` 不需要单独服务——`SettingsStore` 端口本身就是 settings 的读写服务。`ImportExportService` 已在 I5c 完成；`SyncOrch` 已在 S0–S4 完成（`docs/plan/implemented/sync-orch.md`）。
- **I6 完成（2026-10-16，部分）**：opaque 闭环接进 sync dataset（**D1 收口**）。
  - 判别式用 recordId 前缀（`h:` → 可物化；其余 → opaque）；`OpaqueRecord` 增 `streamId`，`RecordsStore.listOpaque(streamId?)` 按流过滤。
  - `v2/datasets.ts`（highlight 流）：`collect` 返回 highlights + 本流 opaque；`apply` 对未知前缀写 `putOpaque`（**原会误存为 highlight**）；`remove` 未知前缀删 opaque。
  - `v2/inboxDataset.ts`（inbox 流）：`apply` 对未知 id 写 opaque（**原为直接丢弃**）；`collect` 回传；`remove` 分类处理。
  - 回归测试：新增 `tests/unit/background/sync/v2/datasets.test.ts`（fake-indexeddb）证明「apply 未知记录 → 不物化 + opaque 保留 + collect 回传」；更新既有 `v2-datasets.test.ts` 覆盖 opaque 分支。
  - 验证：core 26、annotator 284 单测通过；`vue-tsc -b` 0；eslint 0；`vite build` 成功。
  - **后续**：显式 `schemaId` + `schemaVersion` 与 `PayloadCodec` registry 已由 I6b 接到 `apply`。
- **I6b 完成（2026-10-19）**：显式 `schemaId` + PayloadCodec 接到 sync `apply`。
  - `MyZRecordSchemaV1` 增可选 `schemaId`（payload 判别式；旧记录缺省视为 `"myz.record"`）。
  - `@myz/core/record-codecs`：`RECORD_SCHEMA_ID = "myz.record"` + `recordCodecs` registry（校验 schema 为 `MyZRecordSchema`）+ `resolveRecordSchemaId`。
  - `createRecord` / `updateRecord` 为新记录写入 `schemaId`；`v2/datasets.apply` 仅当 id 前缀、payload `id`、`schemaId` 三者一致且 codec 已知时才物化，否则 opaque。
  - 验证：core 31、annotator 290 单测通过；`vue-tsc -b` 0；eslint 0；`vite build` 成功。
- **I7 完成（2026-10-16）**：`ChangeBus` 多上下文变更刷新。
  - `@myz/core/changes`：`ChangeBus` 端口 + `ChangeEvent`（`records` / `inbox` / `settings` / `sync`）。
  - 扩展 `src/messaging/changes.ts`：`createChangeBus()` **双通道** —— `BroadcastChannel("myz:changes")`（扩展页 + SW，同源）+ `chrome.storage.onChanged`（content script 等 origin-scoped 场景）兜底；导出单例 `changeBus`。
  - 发布点：records（`highlights.ts` 全部写路径）、inbox（`actions.ts` 全部状态动作）、settings（`updateSettings`）、sync（`syncNow` 成功后 records + inbox）。
  - 订阅点：dashboard 记录 store（`initialize()` 订阅 `records`/`sync` → 重新加载）。
  - 测试：`tests/unit/messaging/changes.test.ts`（3 用例：BroadcastChannel 跨上下文、storage 兜底、退订）。
  - 验证：core 26、annotator 287 单测通过；`vue-tsc -b` 0；eslint 0 error（仅既有 `max-lines-per-function` warning）；`vite build` 成功。
  - **仍未做（非阻塞，可选）**：inbox/readers/popup 的订阅刷新；基于 `ids` 的增量刷新（当前为整体 reload）；同步过程中逐条发布合流。
- **评审修复（2026-10-16，CodeRabbit PR #91）**：4 条 finding 已全部修复。
  - **opaque 存储键**改为复合 `[streamId, recordId]`，`deleteOpaque(streamId, recordId)`——避免同一 `recordId` 出现在两条流时互相覆盖/误删。
  - **highlight dataset `apply`** 增加 payload 校验：仅当 `recordId` 前缀为 `h:` **且** payload 的 `id` 与之一致时才 `upsert`；否则原样 opaque，避免误物化或改变 `recordId`。
  - **inbox dataset** 对远端记录保留 `rawData`，`collect` 优先原样回传（本地记录仍按 `{kind, ...payload}` 重建）。
  - **`ChangeEvent` 增稳定 `id`**，`createChangeBus` 按 id 对双通道投递去重（避免 dashboard 重复刷新）。
  - 测试：core 29、annotator 289 通过；`vue-tsc -b` 0；eslint 0；`vite build` 成功。
- **I10 完成（2026-10-19）**：宿主无关性验证（Node/Vitest 集成套件）。
  - 新增 `packages/core/tests/support/node-host.ts`：用普通 `Map` + 简单 emitter 实现 `RecordsStore` / `InboxStateStore` / `SettingsStore` / `ChangeBus`（无 chrome / IndexedDB / DOM）。
  - 新增 `packages/core/tests/node-host.test.ts`：在同一套 domain services（Records/Inbox）、读模型 `buildInboxQueue`、关系/backlinks、PayloadCodec、ChangeBus 上端到端跑通，**core 零改动**。
  - 说明：用内存适配器（计划允许）；桌面/移动宿主可换 SQLite/文件而无需改 core。
  - 验证：core 31 单测通过；eslint 0。
- **I8 完成（2026-10-19）**：`Scheduler` / `Notifier` 端口化。
  - `@myz/core/ports`：`Scheduler`（`every` / `once` / `cancel` / `has` / `onTick`）+ `Notifier`（`setBadge` / `notify`）。
  - 扩展 `background/runtime.ts`：chrome.alarms / chrome.action / chrome.notifications 实现。
  - `sync/scheduler.ts`、`inbox/reminder.ts`、`inbox/queue.ts`（badge）改为走端口；**定时/通知行为不变**。
  - `tests/support/node-host.ts` 增加内存版 Scheduler/Notifier，`node-host.test.ts` 覆盖。
  - 验证：core 31、annotator 289 单测通过；`vue-tsc -b` 0；eslint 0；`vite build` 成功。
  - 说明：按计划**未引入 `JobQueue`**（OCR/ASR 未立项）。
- **I4b 完成（2026-10-19）**：`StagedAssetStore` 端口化（本地采集缓存）。
  - `StagedAsset` / `StagedAssetMeta` / `NewStagedAsset` / `StagedAssetKind` 移到 `@myz/core/staged-asset`；新增 `StagedAssetStore` 端口（`save` / `list` / `get` / `remove` / `clear`）。
  - 扩展 `src/stitch/staged-asset.ts` 改为 re-export core 类型（helpers 保留）；`background/stores.ts` 新增 `stagedAssetStore`（IndexedDB 实现）；`messages/staged-assets.ts` 改走端口。
  - 测试：`stores.test.ts` 增加 staged asset 契约测试；`node-host.ts` 增加内存实现并由 `node-host.test.ts` 覆盖。
  - 验证：core 31、annotator 290 单测通过；`vue-tsc -b` 0；eslint 0；`vite build` 成功。
- **I5c 完成（2026-10-19，部分）**：Import / Export 服务抽入 core。
  - `@myz/core/import`（策略 / 净化 / 冲突 / 签名）、`@myz/core/import-merge`（合并算法；id 生成改为 core 内置）、`@myz/core/markdown-export`（Markdown 导出）。
  - 删除扩展 `background/import.ts`、`background/markdown.ts`、`messages/highlights/import-merge.ts`；相关 import 改为 core。
  - 验证：core 31、annotator 290 单测通过；`vue-tsc -b` 0；eslint 0（仅既有 warnings）；`vite build` 成功。
  - **后续**：`SyncOrch` 已完成（`docs/plan/implemented/sync-orch.md`）。
- **I9 完成（2026-10-19）**：Source / Locator 读时归一化落地。
  - `@myz/core/source`：`resolveSourceKind`（registry + 合成 url 前缀）、`resolveSourceIdentity`（url / fingerprint）、`resolveRecordLocator`（typed `text-range` / `pdf-page-rect` / `epub`，优先级 range→pdf→epub）。
  - `ViewerRecordCard` 的页码/章节徽标与「在阅读器中打开」改用 `resolveRecordLocator`——**读时归一化，不写回记录、不改变 sync hash**。
  - 测试：core `source.test.ts`。
  - 验证：core 37、annotator 290 单测通过；`vue-tsc -b` 0；eslint 0；`vite build` 成功。
  - 说明：按决策 §10/2 生命周期保持 record 级；SourceKind 是值对象/registry，不引入 Source 实体；video/image locator 预留。
- **I1b 完成（2026-10-19）**：调用点迁移到类型化 `invoke`。
  - 新增 `src/messaging/invoke.ts`：`invoke<K>` 从 `MyzRuntimeMap` 推导 payload/result；void payload 可省略。
  - 迁移约 90 处 `sendMessage<...>()` → `invoke()`（24 个文件）；保留 `chrome.*.sendMessage`、`sendMessageToTab`、`sendToContentScript` 与 `messaging/transport`。
  - 类型化暴露并修正契约缺口：`userGesture` 载荷（syncClearKey/accountClear/pairingInvite/Accept/Approve）、`syncTestConnection` 可选 payload、legacy `count`、以及 `updateHighlight` 的 `null` 清空改为依赖 `kind: CLIP` 时的 `applyKindShape`。
  - 验证：core 37、annotator 290 单测；`vue-tsc -b` 0；eslint 0 error（无 unused）；`vite build` 成功。
- **SyncOrch 已实施（2026-10-20）**：`docs/plan/implemented/sync-orch.md`——S0 跨设备锁修复、S1 `runAccountSync` 编排器、S2 扩展薄适配、S3 partial 可观测、S4 `keepManifests`/`lockLeaseMs` 设置化、S4b MV3 续租适配器。**遗留 v1（keyset）同步已于 2026-10-20 整体删除**（v1 模块/消息/UI/迁移步骤/`record_state` 存储），当前只剩 v2 设备绑定账号路径。
- **D2 关闭：`@myz/dashboard-core` 已删除（2026-10-20）**：`createExtensionDashboardHost` 全仓零调用；删除 `packages/dashboard-core` 与 `myz-annotator/src/dashboard/host/extension.ts`，并清理 `myz-annotator` 的依赖、vite/vitest alias、tsconfig paths 与根 AGENTS 条目。将来出现第二个宿主时按实际需要重建薄契约层。
