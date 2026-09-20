# 阅读器内翻译（端上）

> 状态：**已实现（T1–T5，2026-09-20）并扩展到网页采集条**。`src/reader/translate/` 核心 + 共享 `SelectionToolbar`/`TranslationPopover`/`ReaderSelectionTools` + 共享 `translation-popover.css`；PDF / EPUB / 网页采集条均接入；单测 33 条、e2e 覆盖三处。挑战结论见文末「挑战与修复」。

## 背景与目标

阅读器（PDF / EPUB）目前只能划线、摘录、批注；遇到非母语材料时用户必须离开产品去外部翻译。目标：在阅读器里选中一段文字，点工具栏上的翻译按钮，弹出一个译文浮层，译文可复制；翻译用浏览器端上模型完成（离线、免费、内容不外发），相同文本有本地缓存。

## 与产品定位的关系

翻译是一个**新功能**，不是设计原则。「不做 AI，不联网也能用」只是产品定位：我们不自建、不 host、也不收集用户数据。端上翻译完全离线、内容不外发；以后允许用户自行配置第三方翻译 provider（自带 key/endpoint），与同步走用户自己的 S3 同理——那是用户自己的基础设施，不存在冲突。因此本期不需要改设计系统原则，只在 §1/§2 的措辞上保持「不自建云端、不收集数据」的说法即可。

## 已确认的关键决策

1. **引擎**：Chrome 内置 **Translator API**（端上，Chrome 138+，桌面）；源语言用内置 **Language Detector API** 检测。
2. **范围**：本期覆盖 **PDF / EPUB 阅读器**与**网页采集条**三处的选中翻译。（网页侧受宿主页 `Permissions-Policy` 影响，禁用时降级为不支持文案。）
3. **交互**：选中文字 → 采集/选区工具栏出现 → 点「翻译」（Lucide `Languages`）→ 弹出浮层。目标语言**本期默认中文**：`zh-CN`/`zh`/`zh-Hans` → `zh`，`zh-TW`/`zh-HK`/`zh-MO`/`zh-Hant` → `zh-Hant`，其他 UI 语言一律回退 `zh`（产品中文优先；本期不做语言选择器）。源语言自动检测。映射函数保留，供后续语言选择器复用。
4. **缓存**：本地缓存，键为 `源语言:目标语言:文本哈希`，只在本机，不同步。阅读器用独立库 `myz_translate_db`；网页内容层用扩展 `chrome.storage.local`（content script 的 IndexedDB 属于宿主页 origin，不可用）。

## 关键事实（已核实）

1. **API 形态**（MDN / Chrome docs）：`Translator.availability({sourceLanguage,targetLanguage})`、`Translator.create({sourceLanguage,targetLanguage,monitor,signal})`、`translator.translate(text, {signal})`（另有 `translateStreaming()`）、`translator.destroy()`、`translator.inputQuota` / `translator.measureInputUsage(text)`；`LanguageDetector.availability({expectedInputLanguages?})`、`LanguageDetector.create({expectedInputLanguages?, monitor, signal})`、`detector.detect(text, {signal})` 返回 `{detectedLanguage, confidence}[]`。availability 取值 `available | downloadable | downloading | unavailable`。Chrome 支持的目标语言码包含 `zh` 与 `zh-Hant`。
2. **约束**：`create()` 需要**瞬时用户激活**（点击触发）；**仅桌面 Chrome**，不支持移动端与 Web Worker；语言包按需下载，可用 `monitor` 监听 `downloadprogress`；`Translator` 顺序处理，长文本会阻塞后续调用（需要分块）；`Permissions-Policy` 的 `translator` / `language-detector` 指令可禁用，扩展页默认允许；网页 content script 受宿主页策略影响，缺失/被禁时按不支持降级。
3. **现有选区工具栏**：PDF 在 `src/pdf/components/PdfSelectionToolbar.tsx`，EPUB 在 `src/epub/EpubReaderApp.tsx` 内联；两者都复用共享 `.selection-toolbar` 样式，动作是 划线/摘录/取消。翻译按钮加进这里最自然。
4. **浮层定位**：PDF 用选区 rect（`selectionPos`）；EPUB 用 iframe `range.getBoundingClientRect()` + iframe 偏移（`framePoint`），已有实现。
5. **本地库模式**：阅读器已用 IndexedDB 存 progress/handles（`myz_pdf_db` / `myz_epub_db`），翻译缓存同样用独立的本地库 `myz_translate_db`。
6. **Lucide 有 `Languages` 图标**（`@lucide/vue` 已导出）。

## 假设

- 目标用户桌面版 Chrome ≥ 138；不支持时降级为明确的「当前浏览器不支持端上翻译」提示，不报错。
- 目标语言默认 `zh`（中文 UI 的繁体变体映射到 `zh-Hant`）；本期不做语言选择器与设置项。
- 选中的文本长度以句子/段落为单位（几十到几百字），不是整章；整章翻译留待后续。
- 端上模型质量对常见语种够用；质量不满意不是本期的失败条件。

## 边界与限制

- **本期仅端上**：不接远程服务、不做 API key、不做云端回退；但引擎接口按 provider 抽象，为「以后用户自配翻译 provider」留出位置（不承诺本期实现）。
- **不做**：整章/整页自动对照、双语排版、译文写回记录、跟随划线保存。
- **无同步**：缓存与翻译偏好都只在本机。
- **顺序与配额**：`translate()` 串行；长文本需要分块并显示进度；`inputQuota`/超限要有兜底。
- **隐私**：内容不出设备；语言包下载是浏览器行为。

## 风险

1. **需要用户手势**：`Translator.create()` 必须由点击触发。缓释：翻译按钮的点击即激活；首次翻译在 create 阶段显示「正在准备语言包」，并在此时机上创建。
2. **语言包下载耗时/失败**：缓释：用 `monitor` 显示下载进度，失败给重试；已下载的 pair 复用同一个 translator 实例并缓存。
3. **语言对不支持**：`availability()` 返回 `unavailable`。缓释：明确文案（如「暂不支持 en→zh」），不静默失败。
4. **长文本串行阻塞**：缓释：按句/段分块，按块缓存与显示；提供取消（`AbortController`）。
5. **检测错误**：短文本检测不稳。缓释：显示检测到的源语言，允许用户重试；源=目标时跳过并提示。
6. **e2e 无法真正跑模型**：CI 环境可能没有语言包。缓释：把 API 访问抽成可注入的 engine 接口，单测用 mock；e2e 只断言 UI 流程（按钮出现、点击后浮层状态、缓存读写），真实翻译用人工验证。

## 增量

### T1 共享翻译核心（engine / 语言 / 缓存）
**产出**：`src/reader/translate/`：可注入的 `TranslationEngine`（feature detect、availability、create+monitor、translate、destroy）、语言映射（UI 语言→BCP47、目标默认 zh、源检测）、本地缓存（`myz_translate_db`，键 `src:tgt:hash`）。
**前置**：无。
**动作**：引擎接口与浏览器实现分离，便于 mock；`crypto.subtle` 计算文本哈希；缓存命中直接返回；`AbortController` 贯穿 create/detect/translate。
**验证**：单测（mock engine：缓存命中/未命中、目标语言解析、源=目标跳过、不支持 pair 的处理、abort）。
**完成标准**：核心逻辑纯逻辑可测，UI 无关。

### T2 共享选区工具栏 + 翻译浮层，接入 PDF
**产出**：`src/reader/SelectionToolbar.tsx`（共享，动作可配置）与 `src/reader/TranslationPopover.tsx`；PDF 选区工具栏加「翻译」。
**前置**：T1。
**动作**：把 PDF/EPUB 两处选区工具栏收敛为一个共享组件（划线/摘录/翻译/取消）；翻译浮层显示原文片段、检测到的源语言、目标语言、译文、状态（准备中/下载中 %/出错）与「复制」；Esc 关闭、点击外部关闭、聚焦处理；浮层样式进 `reader-chrome.css`（well 组 Token）。
**验证**：PDF e2e：选中→工具栏出现翻译按钮→点击→浮层出现且进入加载/译文状态（引擎 mock 或真实不支持时显示不支持文案）；截图。
**完成标准**：PDF 选区可翻译，浮层与工具栏观感与其余 chrome 一致。

### T3 接入 EPUB
**前置**：T2。
**动作**：EPUB 选区工具栏改用共享 `SelectionToolbar`，翻译按钮用 iframe 选区的 rect 定位浮层。
**验证**：EPUB e2e：选中→翻译→浮层出现；iframe 内选区定位正确；截图。
**完成标准**：两个阅读器交互一致。

### T4 健壮性：下载、分块、取消、错误
**前置**：T3。
**动作**：首次下载显示进度与完成后自动翻译；长文本按句分块、逐块显示与缓存；取消按钮中止；`unavailable` / 检测失败 / 超配额给明确文案；复用 translator 实例（按语言对）并在卸载时 `destroy()`。
**验证**：单测（分块切分、取消、错误分支）；e2e（不支持时文案）；人工验证真实 en→zh 一次（记录在验证记录）。
**完成标准**：异常路径都有交代，不出现静默失败。

### T5 规范与文档
**前置**：T1–T4。
**动作**：设计系统新增「翻译浮层」组件（§4.24）：形态（尺寸/定位/内容/状态/复制/关闭）、动效（§3.8 med）、无障碍（焦点/Esc/朗读）；§4.7 采集条补充「阅读器内多一个翻译动作」；§6 场景补一句；`docs/plan/reader-translation.md` 状态更新；AGENTS/worklog；缓存与「不同步」写进文档。
**验证**：build、eslint、单测、e2e、token 检查；展示页 `index.html` 增补翻译浮层示例并与规范一致。
**完成标准**：规范与实现一致。

### T6 扩展到网页采集条（2026-09-20 追加）
**前置**：T1–T5。
**产出**：网页采集条新增「翻译」，位于截取与搜索之间；复用 `useTranslation` + 共享 `TranslationPopover` + 共享 `translation-popover.css`。
**动作**：把浮层样式从 `reader-chrome.css` 抽到 `src/reader/translation-popover.css`，`reader-chrome.css` 与 `content/styles/shadow.css` 都引用；采集条点击翻译时取选区文本与视口 rect，浮层在阴影根内以最高层级显示；`Translator` 在 content script 隔离世界缺失或被宿主页策略禁用时按不支持降级。
**验证**：内容层 e2e（按钮顺序、浮层出现、原文回显）；PDF/EPUB 翻译 e2e 回归；单测 33 条。
**完成标准**：三处入口交互一致，共享一份浮层样式与组件。

## 后续（不在本期）

- **用户自配翻译 provider**：在引擎接口后加一个 provider（自带 key/endpoint，类似同步的 S3 配置）；与端上并存、用户可选。不需要改产品定位。
- **整章/整页对照**：段落级批量翻译与双语排版。
- **译文随记录保存**：把译文写进记录/导出，属于记录模型改动，需要单独一轮 schema 设计。

## 执行顺序理由

T1 把唯一的不可测外部依赖（浏览器 AI API）隔离成可注入接口，之后的 UI 与测试都稳。T2 先做 PDF（选区与定位最简单、测试覆盖最好），T3 再把同一组件搬到 EPUB 的 iframe 选区。T4 才处理下载/长文/异常这些真实世界分支。T5 收口规范，并把「翻译浮层」写进设计系统。

## 挑战与修复（2026-09-20）

对计划做了一次对抗式检查，逐条给出判断与处置。结论：**修订后推进**。

| # | 挑战 | 判断 | 处置 |
| - | ---- | ---- | ---- |
| C1 | 「目标语言默认中文」与「取自 UI 语言」互相矛盾：UI 为 `en` 时目标取 `en`，源=目标会直接跳过，翻译功能形同不存在 | 真缺陷 | 已修：目标语言映射固定回退 `zh`，仅中文变体区分简繁（见决策 3） |
| C2 | 检测器若带 `expectedInputLanguages` 会限制/偏置检测，与「自动检测」冲突 | 真缺陷 | 自动检测调用 `LanguageDetector.create()` 时不传 `expectedInputLanguages` |
| C3 | `create()` 需要瞬时用户激活；检测先于翻译会多一次 await，可能在激活窗口外 | 真实风险 | 翻译按钮点击即进入链路；捕获 `NotAllowedError` 时给出「请再点一次翻译」重试文案，不静默失败 |
| C4 | 语言包 `downloadable` 状态对每个 pair 都返回，直到首次 create，`unavailable` 很少触发 | 可接受 | 把 `downloadable` 当正常下载分支处理；`unavailable` 仍是独立文案分支，由 e2e mock 覆盖 |
| C5 | `translate()` 串行且长文本阻塞；`inputQuota` 语义（token）不等同字符数 | 真实风险 | 服务层先按句/段切块（默认 320 字符，硬切超长句）再逐块翻译，并逐块缓存；超限统一映射为明确文案 |
| C6 | `crypto.subtle` 与 IndexedDB 让「纯逻辑可测」不成立 | 真缺陷 | 哈希与缓存都做成可注入：`hashText` 可替换、`TranslationCache` 是接口，单测用内存实现 |
| C7 | 浮层与工具栏在两处各写一遍会产生重复（jscpd 阈值 5%） | 真实风险 | 抽出共享 `SelectionToolbar` + `TranslationPopover` + 容器 `ReaderSelectionTools`，PDF/EPUB 只做接线 |
| C8 | 浮层固定在选区坐标，滚动原文后会漂移 | 可接受（本期） | 与现有选区工具栏一致；关闭/重选即消失，记录为已知限制 |
| C9 | EPUB 选区在 iframe 内，浮层定位依赖 iframe rect | 已核实可行 | 复用现有 `framePoint`；文本取自已保存的 `Range.toString()` |
| C10 | 扩展 `Permissions-Policy`、CSP、Firefox 构建可能禁用该 API | 已核实 | 扩展页面为顶层、默认允许；纯 feature-detect，缺失即提示不支持，Firefox 构建不受影响 |
| C11 | 复制按钮需要剪贴板权限/用户手势 | 真实风险 | 复制在按钮点击内调用 `navigator.clipboard.writeText`，失败降级为选中文本提示 |
| C12 | 把浮层的 `AbortSignal` 传进 `Translator.create()`。按规范，create 兑现后再 abort 等同 `destroy()`，会摧毁按语言对复用的实例，于是「首次可用、之后全被拒」 | 真缺陷（用户实测：刷新后检测/翻译只能用一次） | 已修：`create()` 不再接收 signal，取消只作用于 per-method 的 `translate`/`detect`；检测器改为每次调用新建 + `finally destroy`，被取消的检测不会污染下一次 |

**结论**：原计划方向成立，无需推翻；上述 C1/C2/C6 属实现前必须修的缺陷，其余转为实现约束或已知限制。

## 关联文档

- `docs/research/design-system/design-system.md` — §1/§2 原则、§3.8 动效、§4.7 采集条、§4.24（新增）。
- `myz-annotator/src/pdf/components/PdfSelectionToolbar.tsx`、`src/epub/EpubReaderApp.tsx` — 现有选区工具栏。
- `myz-annotator/src/reader/reader-chrome.css` — 共享 chrome 样式。
- MDN：Translator and Language Detector APIs；Chrome：Translation with built-in AI。
