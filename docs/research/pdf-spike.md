# PDF Spike 技术验证结论（INC-1）

> 对应计划：`docs/plan/pdf-support.md` 的 INC-1。结论：**GO**。

## 环境
- `pdfjs-dist@6.3.289`（新增依赖，钉定版本）。
- Chrome MV3 扩展页，扩展页 CSP `script-src 'self'`。
- 构建：`vite` + `@crxjs/vite-plugin`，`?worker` 方式加载 pdf.js worker。
- Node v24.10.0。

## 验证方式
- 验证页：`src/pdf/spike.html` + `src/pdf/spike.ts`（临时），通过 `vite.config.mjs` 的 `rollupOptions.input` 加入构建。
- 离线 fixture：`tests/fixtures/myz-pdf-spike.pdf`（608 B，含文本 `MyZ PDF Spike Fixture Hello World`）。
- 自动化：`tests/spike/pdf-spike.spec.ts`，在真实扩展环境中执行（`npm run build` 后 `npx playwright test tests/spike --config=tests/playwright.config.ts`）。
- 诊断：`tests/spike/pdf-diag.spec.ts`（文字层度量 + 真实鼠标拖选 + 截图）。
- 测试后门：`window.__SPIKE__.loadBytes(buffer)` 绕过原生 picker 注入 PDF 字节，使渲染/选区/锚点/指纹逻辑可自动化。

## 逐条结论

| # | 问题 | 结论 | 证据 |
|---|---|---|---|
| 1 | pdf.js ESM 在 MV3 扩展页加载 + worker 运行 | **通过** | worker 经 `?worker` 导入并以 `workerPort` 注入；远端/本地 PDF 均成功渲染。产物 `assets/pdf.worker.min-*.js`（1.20 MB） |
| 2 | `showOpenFilePicker` 可用 + 句柄持久化/重新授权 | **部分通过** | `fsaSupported=true`（可用）。句柄读写 IndexedDB 与重新授权逻辑已实现，但原生 picker 无法自动化 → **待人工验证** |
| 3 | text layer 选取 → 页码/文本/几何矩形 | **通过** | 云端 PDF 选中 "Swift" → `{page:1, text:"Swift", rects:[{x,y,w,h}]}`；fixture 选中 "Hello World" 同理 |
| 4 | 叠加绝对定位高亮块 | **通过** | `overlayCount=1`，rect 相对页容器定位 |
| 5 | 网页 PDF 直接加载（含跨域）+ 无需 background 代取 | **通过** | ① 远端 URL（带 `access-control-allow-origin: *`）成功；② **无 CORS 头** 的 `http://127.0.0.1` 源也成功 → 扩展页 host 权限绕过 CORS，**无需 background 代理** |
| 6 | 指纹方案（size + 首尾采样）不需整份读入 | **通过（小文件）** | 608 B 文件 `size=608`、采样 1216 B、SHA-256 稳定可复现；大文件采样策略未压测 |
| 7 | 测试后门可行 | **通过** | `loadBytes` 绕过 picker 完成渲染→选区→高亮，3 个用例全绿 |
| 8 | Firefox 支持 | **不做（已决策）** | 暂不支持 Firefox；本轮仅 Chrome，未实测 FSA |

自动化结果：`4 passed`（含诊断）；回归：`npm run test:dev` `108 passed`。

## 文字选择视觉证据（截图对比）
对远端 PDF（2 页）第 1 页标题 "Swift 2" 验证：

| 状态 | 现象 |
|---|---|
| 未选中 | 文字正常渲染（正文可读） |
| 鼠标拖选后 | "Swift 2" 呈现原生蓝色选中高亮，`window.getSelection()` 返回 `"Swift 2"` |
| 叠加 MyZ 高亮块后 | 选区上叠加半透明高亮层，`overlayCount=1` |

修复前：文字层因缺少 `--total-scale-factor` 被渲染为 **9.75px**，肉眼几乎不可选中（"功能很奇怪"的真实原因）。
修复后：同位置文字为 **27px**，拖选正常。

截图由诊断用例输出（`SPIKE_SHOT_DIR` 指定目录）：`pdf-unselected.png`、`pdf-selected.png`、`pdf-overlay.png`。

## 关键技术发现（影响后续增量）
1. **pdf.js v6 render API 变更**：`page.render()` 必须传 `canvas`（`canvasContext` 已不满足类型）。
2. **`getDocument({data})` 会转移/分离 `ArrayBuffer`**（transferable），之后该 buffer 不可再用。**因此指纹必须在把字节交给 pdf.js 之前计算**（`loadBytes` 已按此实现）——直接决定 INC-5 的调用顺序。
3. **无需 background 代取跨域 PDF**：扩展页凭借 `<all_urls>` host 权限即可绕过 CORS，简化了架构、避免消息体积上限问题。
4. **text layer 需要 `--total-scale-factor`（v6 已从 `--scale-factor` 改名）**：必须设在页容器上。spike 初版误用旧名，导致文字被渲染成 9.75px、肉眼几乎无法选中；修正后为 27px，鼠标拖选正常。**这是本轮唯一的实际缺陷，已修复并截图确认。**
5. **worker 走 `?worker` + `workerPort` 即可**：无需 `web_accessible_resources`，CRXJS/Vite 正常打包。
6. **体积影响**：worker ~1.20 MB、spike 主包 ~442 KB（gzip 132 KB）。正式 INC-3 需考虑按需加载。

## 未覆盖 / 局限
- 文件句柄 IndexedDB 持久化与跨会话重新授权：**仅人工可验**（原生 picker 不可自动化）。
- Firefox：本轮决策**暂不支持**，未实测。
- 跨页选区、扫描件/无文本层、加密 PDF、超大型 PDF 内存：未覆盖。
- 远端测试依赖网络与第三方站点可用性。

## 产出物
- `myz-annotator/src/pdf/spike.html`、`myz-annotator/src/pdf/spike.ts`（临时，验证用）。
- `myz-annotator/tests/fixtures/myz-pdf-spike.pdf`。
- `myz-annotator/tests/spike/pdf-spike.spec.ts`、`myz-annotator/tests/spike/pdf-diag.spec.ts`（独立于默认 e2e，含网络/截图）。
- `vite.config.mjs` 新增 `pdf-spike` 构建入口。
- 依赖：`pdfjs-dist@6.3.289`。

## go / no-go
**GO**：INC-1 的 8 个问题中 6 个通过、1 个部分通过（仅人工项待验证）、1 个明确不做（Firefox）。唯一"可能做不出来"的技术风险（MV3 下 pdf.js worker、文本锚点、跨域加载）均已证实可行；过程中发现并修复了一个真实缺陷（文字层缩放因子），可进入 INC-2。
