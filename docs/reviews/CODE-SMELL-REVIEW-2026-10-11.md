# 代码质量复查（重复 / 结构复用 / 代码味道）

> 日期：2026-10-11。范围：`packages/*/src` 与 `myz-annotator/src`（373 个 ts/tsx/css 文件）。
> 方法：`jscpd`（阈值 5%，`min-lines 5`）、ESLint（`max-lines`/`max-lines-per-function` 探针）、
> 结构检索（import 分层、重复实现、常量/默认值）。**不含**尺寸硬门禁本身（已达标：生产 ≤300、测试 ≤500）。

## 0. 总体结论

尺寸问题已解决，剩下的主要是**同一职责的多份实现**与**跨层耦合**：

- 健康项：`@myz/shared` 承载了 serializer/highlightRange/url/theme 等真源；27/29 个 e2e 复用 `launchExtension`；`reader-chrome.css` 已是 PDF/EPUB 共享 chrome；`dashboard-ui` 抽出了 SettingsRow/StatePanel/TagInput/SelectInput。
- 主要风险：`normalizeRecord` 存在**两套不同实现**且被不同模块使用；IndexedDB/Reader storage/source 在 PDF/EPUB/translate/background 之间**五处重复**；settings 默认值与归一化在**四处重复**；content/popup 反向依赖 dashboard；CSS 与测试脚手架重复。

jscpd：34 个克隆对（typescript 20 / tsx 6 / css 8），总量 0.93%（阈值内，但结构性问题集中）。

---

## A. 重复代码（Duplication）

| ID | 位置 | 证据 | 影响 | 建议 | 优先级 |
|----|------|------|------|------|--------|
| D1 | `packages/shared/src/highlightUtils.ts:30` 与 `packages/shared/src/types.ts:103` | 两个 `normalizeRecord`：前者用 `normalizeBaseRecord`，后者用 `MyZRecordSchema` + `ensureRecordSchemaVersion` | 同一记录经不同入口得到**不同结果**（PDF 用 highlightUtils，dashboard/content 用 types）；行为分歧 | 合并为一个规范实现（types 版为准），highlightUtils 版改为转发 | **P0** |
| D2 | `background/storage.ts:18`、`background/sync/storage.ts:6`、`epub/storage.ts:20`、`pdf/storage.ts:19`、`reader/translate/storage.ts:20` | 五份 `openDb()` + `withStore()`（IndexedDB 打开/事务包装） | 连接缓存/`onclose` 处理不一致（只有 epub 处理了 close 重开） | 抽 `@myz/shared/idb`（`openDatabase(name,version,upgrade)` + `withStore`） | P1 |
| D3 | `background/constants.ts:10` 与 `dashboard/stores/settings.ts:19`（jscpd 18L） | `DEFAULT_SETTINGS` 与 store 初始值逐字段重复；`SetupS3Fields.EMPTY_S3_FORM` 又一份 S3 默认 | 新增设置项要改 3+ 处，易漏 | store 复用 `DEFAULT_SETTINGS`；S3 默认复用 `DEFAULT_S3_SETTINGS` | P1 |
| D4 | `dashboard/stores/settings.ts:84-150` | `saveSettings` 手写 ~50 行逐字段合并 `sync.s3`，重复 `normalizeSyncSettings/normalizeSyncS3Settings` | 归一化逻辑分叉；字段增删易错 | 直接调用 `normalizeSyncSettings(updated.sync)` | P1 |
| D5 | `pdf/source.ts` 与 `epub/source.ts`（jscpd 3 处） | `sourceKeyOf`/`sourceTypeOf`/`supportsFileSystemAccess`/`ensurePermission` 近乎相同 | 新增 reader 需再复制 | 抽 `reader/source.ts` 工厂（按类型参数化） | P1 |
| D6 | `pdf/storage.ts` 与 `epub/storage.ts`（jscpd 3 处） | `Progress` 结构 + handle/progress 存取 + `listProgress` 同构 | 进度模型无法统一，ReadersPage 需分别调用 | 抽 `reader/progress-store.ts`（泛型 progress） | P1 |
| D7 | `dashboard/pages/inbox/inbox-utils.ts:8,14,23` 与 `dashboard/utils/records/text.ts:1`、`records/grouping.ts:5` | `formatTime`≈`formatDateTime`；`kindLabel`≈`getRecordKindLabel`；`hostOf`≈`hostnameFor` | 展示文案可能不一致 | inbox 复用 records 工具 | P2 |
| D8 | tag 聚合 5 处：`messages/highlights/record-helpers.ts:45`、`epub/stores/reader-store.ts:64`、`dashboard/stores/highlights.ts:40,48`、`content/stores/modal-store.ts:280`、`inbox/useInboxData.ts`(tagCounts) | `new Set(...tags).sort(localeCompare)` 反复出现 | 归一化规则（trim/大小写）不一致 | 抽 `@myz/shared/tags`：`collectTags`/`mergeTags`/`countTags` | P2 |
| D9 | `pdf/text-selection/positions.ts:122-127` 与 `:140-145`；`serializer/path.ts` resolvePath vs resolvePartialPath；`sync-core/lock.ts` acquire vs renew；`stream/stream-push.ts` records vs tombstones 循环 | jscpd 同文件内克隆（6–13 行） | 局部重复，维护成本低但可读性差 | 就地提小函数/参数化 | P3 |
| D10 | CSS：`pdf/pdf-viewer.css` 与 `epub/epub-viewer.css`（jscpd 6 处）、`dashboard/styles.css` 与 `popup/styles.css`、`pdf-viewer.css` 与 `popup/styles.css` | viewer 样板（theme/utilities import、`:root`、`html/body`、`#app`、focus 规则）重复 | 主题/基础样式改动需多处同步 | 抽 `reader/reader-viewer-base.css`（样板 + focus），viewer 只留差异 | P2 |
| D11 | `packages/sync-core/src/schemas/v1.ts:45` 与 `v2.ts:89`；`background/settings/schemas/v1.ts:7` 与 `sync-core/settings.ts` | zod schema 与 TS 类型/normalize 各写一份（S3 形状出现 4 处：zod、SyncS3Settings、DEFAULT_SETTINGS、EMPTY_S3_FORM） | 契约漂移 | schema-first：从 zod 推导类型或共享 `SyncS3SettingsSchema` | P2 |

---

## B. 结构复用机会（Structural reuse）

| ID | 主题 | 现状 | 建议 | 优先级 |
|----|------|------|------|--------|
| R1 | Reader 进度模型 | PDF/EPUB 各有 `stores/*` + `storage.ts` + `source.ts`，ReadersPage 分别 list | 统一 `ReaderProgress`（sourceKey/sourceType + reader 特定字段）与一个 `reader-progress` 门面 | P1 |
| R2 | 高亮绘制 | `@myz/shared/highlightRange` 已共享；但 `content/apply-highlight.ts`、`epub/highlights.ts`、`pdf/annotations/decorations.ts` 仍各自实现 DOM 包裹/装饰 | 评估把「按 range 包裹 + 装饰」再收口到 shared（PDF 因 span 语义特殊可保留） | P2 |
| R3 | 选区工具条 | `content/components/Toolbar.tsx` 与 `reader/ReaderSelectionTools.tsx`（jscpd 19L） | 统一为共享组件 + host 适配 | P2 |
| R4 | 设置区块 | 各 settings 页面结构相似（SettingsRow + 字段） | 已有 SettingsRow；可再抽 `SettingsCard`/`SettingsActions` | P3 |
| R5 | 消息 handler | `messages/*` 均为 `registerMessageHandler("myz:x", ...)` | 可用命名空间注册（`registerNamespace("myz:account", {...})`）减少样板 | P3 |

---

## C. 分层与耦合（Layering）

| ID | 位置 | 问题 | 建议 | 优先级 |
|----|------|------|------|--------|
| L1 | `content/highlight/cache.ts:3`、`content/stores/inspector-store.ts:19` | content script 反向依赖 `@/dashboard/utils/records`（把 dashboard 工具打进 content bundle） | 直接依赖 `@myz/shared`（`normalizeRecord`/`recordToMarkdown`） | **P1** |
| L2 | `popup/usePopup.ts:16`、`popup/components/HighlightItem.tsx:13` | popup 依赖 `@/dashboard/utils/records` | 下沉到 `@myz/shared` 或 `dashboard-ui` | P2 |
| L3 | `dashboard/pages/ReadersPage.tsx:4-6` | dashboard 直接 import `pdf/storage`、`epub/storage`（IDB 内部） | 经 `reader-progress` 门面（见 R1） | P2 |
| L4 | `dashboard/pages/*`、`HighlightsPane.tsx` import `pdf/open`、`epub/open` | dashboard 依赖 reader 打开流程 | 可接受（显式入口）；建议集中到 `reader/open` 门面 | P3 |

---

## D. 一致性与正确性风险

| ID | 风险 | 证据 | 建议 | 优先级 |
|----|------|------|------|--------|
| C1 | `normalizeRecord` 双实现（见 D1） | 见 D1 | 合并并加单测覆盖两条调用路径 | **P0** |
| C2 | 设置校验双轨：zod schema（`background/settings/schemas/v1.ts`）与 `normalizeSettings`（`background/storage.ts:111`） | 两处都做默认/裁剪 | schema-first，normalize 只做补默认 | P2 |
| C3 | `@myz/shared` 深导入 216 vs index 7 | 约定不统一（虽以深导入为主） | 明确规范：跨包只用深导入，index 仅用于类型聚合或删除 | P3 |
| C4 | `as unknown as` 10 处、非空断言 `!` 9 处 | 主要在 backdoor/JSX ref | 逐条评估，能消除则消除 | P3 |

---

## E. 代码味道（Smells）

| ID | 味道 | 证据 | 影响 | 建议 | 优先级 |
|----|------|------|------|------|--------|
| S1 | 巨型 `setup()`/composable 单函数 | ESLint 探针：190 个函数 >60 有效行（含 Vue `setup`/render 口径），Top：`useTagInput` 265、`dashboard/stores/highlights` 244、`useEpubFrame` 239、`useInboxActions` 228、`usePdfAnnotations` 230 | 单函数内聚但过长，测试与推理成本高 | 引入 `max-lines-per-function`（warn 80，setup 渲染可局部豁免）；把纯逻辑继续下沉 | P2 |
| S2 | 生产日志 | `console.*` 75 处（多为 catch 的 warn/error） | 无统一日志/上报，噪音 | 引入轻量 `logger`（可关）或收敛到少数边界 | P2 |
| S3 | 空/吞异常 | 多处 `catch {}`（如 `epub-open`、`storage` 读写） | 失败静默 | 至少 debug 日志或返回 typed error | P2 |
| S4 | barrel 间接层 | `serializer.ts`、`records.ts`、`html.ts`、`highlight-state.ts`、`streamClient.ts` 为纯 re-export | 多一跳、跳转定位成本 | 保留（兼容性有价值）；新代码优先直接 import 子模块 | P3 |
| S5 | 组件同名 | `dashboard-ui/src/ColorPalette.tsx` 与 `content/components/modal/ColorPalette.tsx` | 语义不同易混淆 | 内容层改名 `HighlightColorEditor` | P3 |
| S6 | 魔法字符串/字面量 | `"myz:..."` 消息名散落；`"imported"`、`"highlight"` 等 | 拼写风险 | 集中常量（消息名已有 trustedSender 列表，可复用） | P3 |
| S7 | 超长 class 串 | >120 字符的 class 串 59 条（`max-len` 已 ignore） | 可读性 | 已就地提取部分；其余按需 | P3 |
| S8 | 注释丢失 | 重构时 `highlight-state` 的 3 个 `FIXME: modal/inspector` 被删（现全仓 TODO/FIXME = 0） | 隐式耦合线索丢失 | 若仍成立，补回或建 issue | P3 |

---

## F. 测试质量

| ID | 问题 | 证据 | 建议 | 优先级 |
|----|------|------|------|--------|
| T1 | `send` 助手重复 | 10/29 spec 各自实现 `chrome.runtime.sendMessage` 包装（sync-mock 已有 `send`） | 抽到 `tests/helpers/runtime.ts`，统一 `send` | P2 |
| T2 | `__dirname` 样板 | 29/29 spec 复制 `fileURLToPath(import.meta.url)` | helpers 内集中 | P3 |
| T3 | flaky | `pdf_clip_saves_without_style` 在全量 pdf 套件偶发失败（隔离 3/3 通过；疑似 page-2 渲染竞态） | 用 `waitForFunction` 等待目标页文本层就绪 | P2 |
| T4 | 脚手架收敛 | 已有 `dashboard-harness`、`launch-extension`、`static-server`、`mock-s3-server` | 继续把 pdf/extension 通用开页/等待收敛到 harness | P3 |

---

## G. 建议工作项（按优先级）

**P0（正确性/一致性，先做）**
1. 合并 `normalizeRecord` 双实现（D1/C1），并让 PDF 与 dashboard/content 走同一入口；补单测。

**P1（结构性复用，收益最大）**
2. 抽 `@myz/shared/idb`，替换 5 处 IndexedDB 打开/事务（D2）。
3. 抽 `reader-progress` + `reader/source`，统一 PDF/EPUB 进度与来源（D5/D6/R1/L3）。
4. 设置默认值与归一化收口：store 复用 `DEFAULT_SETTINGS` + `normalizeSyncSettings`（D3/D4）。
5. content/popup 去除对 `@/dashboard` 的反向依赖（L1/L2）。

**P2（一致性/可维护性）**
6. tag 工具共享（D8）；inbox 复用 records 展示工具（D7）。
7. viewer CSS 样板抽 `reader-viewer-base.css`（D10）。
8. schema-first：S3/设置 schema 单一真源（D11/C2）。
9. 日志与异常策略（S2/S3）；测试 `send` 助手 + pdf flaky 修复（T1/T3）。
10. 引入 `max-lines-per-function`（warn 80）并清理 Top 长函数（S1）。

**P3（打磨）**
11. 组件改名（S5）、barrel/深导入规范（C3/S4）、`as unknown as`/非空断言收敛（C4）、魔法字符串常量（S6）、测试 `__dirname` 收敛（T2）。

---

## 附录：jscpd 克隆对（34）

```
typescript 18L  background/constants.ts:26  <-> dashboard/stores/settings.ts:24
typescript 12L  background/storage.ts:13    <-> background/sync/storage.ts:1
tsx        19L  content/components/Toolbar.tsx:97 <-> reader/ReaderSelectionTools.tsx:70
typescript 11L  content/image.ts:68         <-> content/image.ts:114
tsx        10L  setup/primitives.tsx:65     <-> setup/primitives.tsx:93
tsx        12L  setup/steps/AuthorizeSteps.tsx:1  <-> setup/steps/JoinSteps.tsx:1
tsx        13L  setup/steps/AuthorizeSteps.tsx:94 <-> setup/steps/JoinSteps.tsx:51
tsx        12L  setup/steps/CreateSteps.tsx:210   <-> setup/steps/JoinSteps.tsx:19
css        10L  dashboard/styles.css:49     <-> popup/styles.css:33
typescript 13L  utils/import/raindrop.ts:19 <-> utils/import/weava.ts:5
typescript  9L  utils/import/raindrop.ts:36 <-> utils/import/weava.ts:20
css        26L  epub/epub-viewer.css:9      <-> pdf/pdf-viewer.css:8
css         7L  epub/epub-viewer.css:66     <-> pdf/pdf-viewer.css:93
css        10L  epub/epub-viewer.css:72     <-> pdf/pdf-viewer.css:99
css        12L  epub/epub-viewer.css:85     <-> pdf/pdf-viewer.css:52
css        10L  epub/epub-viewer.css:107    <-> pdf/pdf-viewer.css:74
css         6L  epub/epub-viewer.css:116    <-> pdf/pdf-viewer.css:83
typescript  8L  epub/reader/epub-preferences.ts:28 <-> pdf/stores/reader-store.ts:103
typescript 12L  epub/source.ts:46           <-> pdf/source.ts:66
typescript 13L  epub/source.ts:60           <-> pdf/source.ts:75
typescript 11L  epub/source.ts:81           <-> pdf/source.ts:96
typescript 12L  epub/storage.ts:24          <-> pdf/storage.ts:20
typescript  7L  epub/storage.ts:64          <-> pdf/storage.ts:43
typescript 17L  epub/storage.ts:70          <-> pdf/storage.ts:52
css         6L  pdf/pdf-viewer.css:37       <-> popup/styles.css:7
typescript 10L  pdf/storage.ts:15           <-> reader/translate/storage.ts:16
typescript  7L  pdf/storage.ts:38           <-> reader/translate/storage.ts:35
typescript  6L  pdf/text-selection/positions.ts:122 <-> :140
tsx         9L  dashboard-ui/HighlightGroups.tsx:95 <-> :105
typescript  9L  shared/serializer/path.ts:125 <-> :161
typescript 11L  shared/serializer/path.ts:134 <-> :171
typescript 11L  sync-core/lock.ts:22        <-> lock.ts:65
typescript 10L  sync-core/schemas/v1.ts:45  <-> schemas/v2.ts:89
typescript 13L  sync-core/stream/stream-push.ts:38 <-> :178
```
