# 跨技术栈移植经验：stitch-web → myz-annotator

本文记录把外部工具（React + Vite 静态站 `stitch-web`）移植进本插件（Vue 3 + JSX + Pinia + MV3）
的过程与经验，供后续类似移植参考。

## 1. 结论先行

- **先分层，再动手**：把源码按「框架无关核心 / 框架耦合 UI / 宿主耦合能力」三层切开。
  框架无关的部分（纯 TS/Canvas）可近乎原样搬运；真正要重写的只有 UI 层与宿主适配层。
- **宿主能力要重接，不要照搬**：静态站里 `localStorage`/`<a download>`/全局粘贴等直接可用的东西，
  在 MV3 里要么换 API（`chrome.storage`），要么走背景（`chrome.downloads`/消息），要么受
  CORS/权限约束（跨域图片、视频帧）。
- **配色/主题用令牌映射，不重写样式**：把源设计系统的颜色令牌指向本插件的 `--myz-*` 令牌，
  其余几何/间距令牌保留，即可一次获得浅色/深色与全部配色方案。
- **验证靠类型检查 + 纯逻辑单测 + 构建产物**：UI 行为难以自动化时，至少保证核心算法有单测、
  类型 0 错、构建通过。

## 2. 分层切分（本次实测）

| 层 | 源文件 | 处理方式 |
| --- | --- | --- |
| 框架无关核心 | `src/core/**`（gray/matching/stitch/layouts/showcase/export）、`types.ts` | 近原样复制到 `src/stitch/core/`，仅调整导入路径与格式 |
| 框架耦合 UI | `App.tsx`、`hooks/useAssets`、`modes/**`、`components/**` | 改写为 Vue 3 `defineComponent` + JSX + Pinia |
| 宿主耦合能力 | `localStorage`、`<a download>`、`document.createElement('canvas')`、剪贴板 | 按 MV3 约束重接（见 §4） |

经验：**先量化比例**。本次约 60% 行数属于第一层，实际重写量远小于代码总量。

## 3. React → Vue 3 JSX 的机械映射

- 组件：`function C(props)` → `defineComponent({ name, props, emits, setup(props, ctx) { return () => (<jsx/>) } })`。
- 受控控件：`onChange` 回调 → `emits: ["change"]` + 父级 `onChange={fn}`。
- `useState` → `ref`；`useMemo` → `computed`；`useEffect` → `watch`/`watchEffect`/`onMounted`。
- `useRef`（DOM）→ `ref<HTMLCanvasElement|null>()` 并在 JSX `ref={...}` 绑定；子组件需要暴露
  canvas 时，把 `Ref` 作为 **prop** 传入（Vue 不会在 props 中解包 ref）。
- 指针事件：Vue JSX 用原生事件名（`onPointerdown`/`onPointermove`/`onDblclick`），
  或在子组件里用**回调 prop**（`onPointerDown` 等）再转发，避免 `emit("pointer-down")` 的
  `toHandlerKey` 命名坑（会生成 `onPointer-down`）。
- 具名插槽：React `children`/`actions` 节点 → 默认插槽 `slots.default?.()` + `VNode` prop。
- 错误边界：React `componentDidCatch` → Vue `onErrorCaptured` + `attempt` key 重挂载。
- 图标：不搬运源 `Icons.tsx`，改用仓库已有的 `@lucide/vue`，减少一次性代码。
- Pinia：`useAssets` 这类「自带状态 + 动作」的 hook 直接变成 setup store；注意 **Pinia 会解包
  store 上的 ref**，组件里写 `store.error` 而非 `store.error.value`。

## 4. 宿主能力重接清单（本次）

- **跨域图片**：内容脚本 `fetch` 受页面 CORS 限制 → 改由**背景**（`<all_urls>` host 权限）
  `myz:fetchAsset` 取字节并转 data URL；失败再退回「画布绘制 → `captureVisibleTab` 裁剪」。
- **视频当前帧**：优先 `drawImage(video)`；跨域会污染画布 → 退回 `captureVisibleTab` 裁剪到
  视频矩形（天然不含进度条/控件，正好解决原工具的痛点）。
- **下载**：静态站 `<a download>` 在内容脚本/扩展页可用，继续沿用；背景侧不新增 `downloads` 权限。
- **剪贴板**：图片写入需要用户手势/聚焦文档，做成**尽力而为**并静默降级。
- **二进制跨上下文**：MV3 消息是 JSON 序列化，Blob 不能直传 → 统一转 base64 `data:` URL。
- **内容脚本的 IndexedDB 属于宿主页 origin**，不能当插件缓存 → 二进制一律经背景写入扩展 origin
  的 `myz_db`。
- **独立页面而非注入**：画布工具用独立扩展页（`stitch.html`），天然隔离宿主页 CSS/JS，无需
  Shadow DOM；代价是要在 `vite.config.mjs` 的 `rollupOptions.input` 注册入口。

## 5. 主题/配色移植

- 源设计系统是单一深色方案、令牌前缀 `--c-*`。做法：保留其**几何/间距/尺寸**令牌，
  仅把颜色令牌改成对 `--myz-*` 的**别名**（`--c-canvas: var(--myz-bg)` 等）。
- 令牌别名比「逐条替换样式」风险低：组件 CSS 一行不改就获得了浅/深色与全部配色方案。
- 画布需要**字面颜色**（`ctx.strokeStyle`）→ 在绘制时用 `getComputedStyle` 读取实时令牌
  （见 `src/stitch/theme-accent.ts`）。
- 源里少数硬编码色（透明棋盘、遮罩）保留即可，因为它们是叠加在用户图片上的中性色。

## 6. 复用既有设计令牌与页面范式

- 新增页面直接照抄现有阅读器页范式：`*.html` + `main.tsx`（`createApp().use(pinia).mount`）
  + `import "@myz/shared/theme"` + `import "@myz/shared/colorScheme"` + 页面 CSS。
- 页面 CSS 用 `@import "@myz/shared/theme/tokens.css"` 拿到 `--myz-*`。

## 7. 尺寸护栏

- 仓库对生产文件 `max-lines` 在 400 处告警（目标 ≤300）。移植的**模式组件**天然偏大
  （源 `ScreenshotMode` 即 572 行），本次直接移植后仍偏大，列为后续拆分项：
  把「侧栏面板组」拆成子组件、把纯配置/派生逻辑抽成 composable。

## 8. 推荐流程（可复用）

1. 用探索代理通读源项目，产出「文件 → 职责 → 框架耦合度 → 公共 API」清单。
2. 定义目标架构与分层，确认关键决策（宿主位置、存储、触发方式）。
3. 先搬第一层（核心）并加纯逻辑单测。
4. 再写第三层（宿主适配）并打通一条端到端路径。
5. 最后写第二层（UI），用令牌别名复用主题。
6. 每步跑类型检查/构建；UI 手测补充。
7. 记录本文这类「过程/经验」文档与 worklog。
