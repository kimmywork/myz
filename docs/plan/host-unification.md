# Host Unification — 多宿主统一体验（计划）

> 状态：**计划中，未实施**。
>
> 目标：Extension / Desktop / Web / Mobile 共享领域、同步、状态与 UI 原语；宿主只提供平台能力（capture / file / window / keychain / scheduler / notifier / transport）。
>
> 关联：`docs/plan/core-refactor.md`（已完成）、`docs/plan/implemented/sync-orch.md`、`packages/dashboard-ui`、D2（`@myz/dashboard-core` 已删除）。

## 1. 目标与非目标

**目标**

- 四个宿主共享：领域模型/服务、同步协议、设置/主题、dashboard/reader UI、状态层、导入导出、搜索/Inbox。
- 宿主只实现：capture、文件打开/保存、窗口/菜单/托盘、密钥存储、定时/通知、transport、阅读器资源加载。
- 新增宿主时 `@myz/core` / `@myz/sync-core` / `@myz/dashboard-ui` / `@myz/app-state` **零改动**。

**非目标**

- 不在 core 放 `chrome` / DOM / IO。
- 不复活 `dashboard-core` 的 feature flags / v1 `SyncRepository`；需要的是被使用的薄契约。
- 不承诺「Web 端在任意网页上标注」；普通网页受 CSP/CORS 限制，那是扩展/bookmarklet 能力。
- 不在本计划内做 Mobile 原生渲染器；先用 WebView 验证 reader 复用。

## 2. 现状与证据

**已经可复用的层**

- `@myz/core`：零 `chrome` / `document` / `window`；`packages/core/tests/support/node-host.ts` 用 Map 跑通 Records / Inbox / ChangeBus / PayloadCodec，证明「换宿主只写 adapter」。
- `@myz/sync-core`：E2EE 协议、锁、GC、`runAccountSync` 编排器宿主无关；`SyncObjectStore` 是端口。
- `@myz/dashboard-ui`：零 `@/` / `chrome.` 引用，纯展示组件。
- `@myz/shared`：schemas / serializer / `highlightRange` / tags / url / cjk / versioning 等纯原语可复用。

**尚未跨宿主化的层**

| 缺口 | 证据 | 影响 |
| --- | --- | --- |
| 宿主契约层 | `dashboard-core` 已删（D2），无替代 | 每个宿主各自拼 stores/services，体验漂移 |
| 共享状态层 | `dashboard/stores/*` import `@/messaging/invoke`、`@/background/constants` | Web/Desktop 会复制一套 Pinia store |
| Reader core | `pdf/open.ts`、`epub/open.ts`、`pdf-document.ts`、`useEpubFrame.ts`、`open-library.ts` 直接用 `chrome.runtime.getURL/tabs` | Web/Desktop 无法复用阅读器 |
| Capture 端口 | 计划里有 `Capture`，实际未实现 | 4 宿主差异最大的部分没有边界 |
| Secret/Key store | 扩展用 IDB 非导出 key + `chrome.storage`；凭据封装是扩展实现 | Desktop/Mobile 需要 OS keychain；Web 需要 WebCrypto+IDB（更弱） |
| shared 纯/浏览器混杂 | `messaging` / `idb` / `theme` / `colorScheme` / `sanitizeHtml` / `fonts` 与纯原语同包 | Node 主进程误 import 是坑 |

**验证基线**：annotator 296 单测、sync-core 116 单测、typecheck/build 绿。

## 3. 目标架构

```text
┌─────────────────────────────────────────────────────────────┐
│ Host shells (apps/extension · apps/desktop · apps/web · apps/mobile)
│  路由 · 布局 · capture · file · window/menus · keychain        │
└───────────────────────────┬─────────────────────────────────┘
                            │ HostServices (ports + capabilities)
┌───────────────────────────▼─────────────────────────────────┐
│ @myz/app-state —— Pinia stores（高亮/Inbox/设置/搜索/阅读器）    │
└───────────────────────────┬─────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────┐
│ @myz/host —— 契约：HostServices / capabilities / SyncFacade     │
│ 组合 core ports + sync-core + capture/file/secret/reader ports  │
└───────────────────────────┬─────────────────────────────────┘
        ┌───────────────────┴────────────────────┐
        ▼                                        ▼
 @myz/core / @myz/sync-core              @myz/dashboard-ui
 (领域 + 端口 + 协议)                     @myz/reader-ui
```

**包结构（目标）**

| 包 | 职责 | 变化 |
| --- | --- | --- |
| `@myz/shared` | 纯原语 + `browser/` 子路径（messaging/idb/theme…） | 拆分边界（H0） |
| `@myz/core` | 领域模型/服务 + 存储/定时/通知端口 | 不变 |
| `@myz/sync-core` | E2EE、锁、GC、编排器、`SyncObjectStore` | 不变 |
| `@myz/host`（新） | `HostServices` 契约 + capabilities + `SyncFacade` | 新增 |
| `@myz/app-state`（新） | 共享 Pinia stores，只依赖 `HostServices` | 新增 |
| `@myz/dashboard-ui` | dashboard 展示组件 | 不变 |
| `@myz/reader-core`（新） | PDF/EPUB 引擎、锚点、高亮、进度模型 | 新增 |
| `@myz/reader-ui`（新） | 阅读器 chrome（侧栏/目录/高亮/选区/翻译浮层） | 从 `myz-annotator/src/reader` 上升 |
| `myz-annotator` | extension 宿主（content / popup / readers / stitch） | 逐步瘦身 |
| `apps/web` / `apps/desktop` / `apps/mobile`（新） | 宿主外壳 | 后续 |

## 4. 平台矩阵

### A. 完全共享（core / sync-core / dashboard-ui / app-state）

- 记录模型（高亮/摘录/书签）、kind、sourceType、locator、schemaId。
- 标签、搜索、筛选、排序、文库/阅读页/Inbox 工作流（pending/snoozed/kept/archived/marked/relations）。
- 导入/导出（Markdown/JSON）、冲突策略、签名。
- 设置模型、主题/配色/字体。
- 同步账号/设备 roster/配对协议/E2EE 引擎/锁/GC。
- 阅读进度模型（页码/章节/百分比）。
- 翻译核心（分块/缓存/语言映射；引擎可注入）。
- `ChangeBus` / `MessageContract` / `Transport` 契约。
- 共享 UI：`DashboardAppShell` / `PageSidebar` / `TagInput` / `HighlightCard` / `SettingsRow` / `StatePanel`。
- 共享阅读器 chrome：侧栏/目录/高亮列表/选区工具条/翻译浮层。

### B. 共享引擎 + 宿主外壳

| 能力 | 共享 | 宿主差异 |
| --- | --- | --- |
| PDF/EPUB 阅读器 | 渲染、锚点、高亮、TOC、进度模型 | 打开文件、资源 URL、开窗、进度存储 |
| 图片拼接/拼图/展示图 | canvas、算法、导出 | 截图、图片导入、文件保存 |
| 翻译 UI + 引擎选择 | 浮层、缓存、语言映射 | Chrome Translator / OS / 云端 |
| 配对/首次引导 | 步骤、SAS、roster 导入 | S3 预填、账号创建、文件/二维码 |
| 通知 | 文案、触发时机 | badge / 系统通知 / PWA 通知 |
| 同步调度 | `runAccountSync` | chrome.alarms / OS 定时 / 后台任务 |

### C. 平台专有（不进 core）

| 平台 | 专有能力 |
| --- | --- |
| Chrome Extension | 任意网页选区/悬浮条、content script、截图、视频截帧、右键菜单、tabs/badge/alarms、popup、MV3 SW |
| Desktop | 托盘、菜单、窗口控制、全局快捷键、自动更新、本地文件路径、OS 通知、多窗口、剪贴板 |
| Web | 落地/营销/登录（若需要）、PWA、File System Access/拖拽、托管同步（若提供）；不能注入任意站点 |
| Mobile | share sheet、相机/相册、触摸手势、窄屏布局、生物识别、OS 后台限制、原生文件选择 |
| 安全 | OS keychain（desktop/mobile）、WebCrypto+IDB（web，需接受 XSS 风险）、扩展 IDB 非导出 key |
| 账号 | 扩展无登录；desktop/mobile 可接 OS 账户/生物识别；web 若多用户需额外登录层 |

## 5. 契约草案

```ts
// @myz/host
export type HostKind = "extension" | "desktop" | "web" | "mobile";

export interface HostCapabilities {
  capture: {
    selection: boolean;
    page: boolean;
    screenshot: boolean;
    videoFrame: boolean;
    share: boolean;
    clipboard: boolean;
  };
  files: { open: boolean; save: boolean; handles: boolean };
  window: { controls: boolean; tray: boolean; menus: boolean; globalShortcuts: boolean };
  secrets: "os-keychain" | "indexeddb-wrapped" | "none";
  notifications: "badge" | "system" | "pwa";
  layout: { touchOptimized: boolean };
}

export interface HostServices {
  readonly kind: HostKind;
  readonly capabilities: HostCapabilities;
  records: RecordsStore;
  inbox: InboxStateStore;
  settings: SettingsStore<Settings>;
  sync: SyncFacade;
  changes: ChangeBus;
  scheduler: Scheduler;
  notifier: Notifier;
  secrets: SecretStore;
  files: FileSource;
  capture?: CapturePort;
  reader: ReaderHost;
}
```

- `SyncFacade`：`status()` / `syncNow()` / `testConnection()` / `account()` / `pairing`，宿主内部组合 `runAccountSync` + `S3Client` + 账号存储。
- `SecretStore`：`get` / `set` / `delete` + `protection`；扩展用 IDB 非导出 key，Desktop/Mobile 用 OS keychain，Web 用 WebCrypto+IDB（可叠加口令包裹）。
- `FileSource`：`openFile` / `saveFile` / `assetUrl`。
- `CapturePort`：`captureSelection?` / `capturePage?` / `captureScreenshot?` / `captureVideoFrame?` / `share?`，全部可选，用 capabilities 判断。
- `ReaderHost`：`openFile("pdf" | "epub")` / `assetUrl` / `openWindow` / `progress` / `translation`。

## 6. 增量

| # | 增量 | 产物 | 依赖 | 验证 |
| --- | --- | --- | --- | --- |
| **H0** | shared 边界 | `@myz/shared/browser` 子路径或 eslint 边界；pure/browser 模块清单 | 无 | Node 脚本只 import 纯路径；`core`/`sync-core` 无浏览器依赖 |
| **H1** | Host 契约 | `@myz/host`（仅接口 + capabilities）；extension adapter 实现 | H0 | extension 编译/行为不变；e2e 绿；core 无新依赖 |
| **H2** | 共享状态层 | `@myz/app-state`（Pinia stores over `HostServices`）；dashboard stores 迁移 | H1 | dashboard 单测/e2e 绿；stores 可用 node-host 测试；无 `@/messaging` import |
| **H3** | Reader core | `@myz/reader-core` / `@myz/reader-ui`；`ReaderHost`；PDF/EPUB 迁移 | H1 | reader e2e 绿；reader-core 无 chrome；fake host 单测 |
| **H4** | Capture/File/Secret | 端口 + extension 实现；其他宿主 stub；capability 矩阵 | H1 | extension capture e2e 不变；secret store 契约测试 |
| **H5** | 第二个薄宿主（Web dashboard） | `apps/web`：Vite + IndexedDB + S3(CORS) + File System Access；复用 dashboard/reader | H2–H4 | 同一 dashboard 渲染；浏览器内建记录/同步/打开本地 PDF/EPUB；无 extension API |
| **H6** | Desktop shell | `apps/desktop`（Tauri 优先）：keychain、文件对话框、菜单/托盘、同步 | H5 | dashboard/reader 在桌面跑通；keychain；同步 |
| **H7** | Mobile（可选/后置） | Capacitor/Tauri mobile：share target、触摸布局、keychain、WebView reader | H6 | 分享→记录、文库、阅读器、同步 |

**H5 是分水岭**：它验证「同一个 dashboard/reader 只换 adapter」。H6/H7 只增加平台外壳，不应再改 core/state/UI。

## 7. 验收标准

- 新增宿主只改 `apps/<host>` 与 adapter 实现；`packages/{core,sync-core,host,app-state,dashboard-ui,reader-core,reader-ui}` 不改。
- 同一 dashboard 路由与 reader 在 extension 与 Web/Desktop 上渲染一致（允许布局/能力差异）。
- capture 只存在于宿主；core/state 不出现平台分支。
- 每个宿主的密钥保护级别有文档；Web 的 XSS 风险被明确接受。
- `node-host` harness 扩展覆盖 app-state；extension e2e + web smoke 绿。

## 8. 风险与待决

**风险**

- **Reader 抽取是最大工程量**：DOM/canvas/iframe 与引擎生命周期；先迁 chrome 组件，再迁引擎。
- **`dashboard-ui` / `app-state` 与 Pinia/router 的耦合**：路由与布局留在宿主，store 只依赖 `HostServices`。
- **Web S3 CORS**：bucket 必须允许 Web origin 的 GET/PUT/LIST/DELETE，或提供代理。
- **Web 密钥安全**：非导出 CryptoKey + IDB 仍可能被 XSS 使用；建议提供口令包裹（现有 `kdf.ts`）作为可选强保护。
- **Mobile 后台同步**：OS 限制多；优先前台/手动 + 可用的后台任务。
- **Desktop 框架**：Tauri vs Electron；先按「WebView 复用 + 包体」评估。
- **Capture 过度抽象**：只做可选方法 + capabilities，不追求万能接口。

**待决**

1. Web 的范围：文库/Inbox/阅读器（推荐）vs 任意网页标注（不做）。
2. Desktop：Tauri（推荐，轻）vs Electron（Node 生态）。
3. Mobile：WebView 壳（复用 Web）vs 原生渲染。
4. 是否支持多账号（当前单本地账号）。
5. Web 同步是否只支持 S3，还是需要代理/托管存储。
6. `@myz/app-state` 是否依赖 `vue-router`（建议不依赖，路由由宿主注入）。

## 9. 不做 / 延后

- 不复活 `dashboard-core` 的 feature flags / v1 `SyncRepository`。
- 不做「Web 任意页面注入」。
- 不做 Mobile 原生 PDF/EPUB 渲染器（先 WebView）。
- 不把 capture/菜单/托盘/快捷键抽象进 core。

## 10. 关联文档

- `docs/plan/core-refactor.md` — 领域层/端口/宿主适配器的既有决策。
- `docs/plan/implemented/sync-orch.md` — 同步编排器与锁。
- `packages/dashboard-ui` — 共享展示层。
- `packages/core/tests/support/node-host.ts` — 宿主无关性验证。
