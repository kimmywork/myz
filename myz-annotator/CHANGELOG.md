# Changelog

# v0.6.4 EPUB 阅读器、端上翻译与加密同步 v2

- 新增内置 EPUB 阅读器（重排）：支持本地文件来源（File System Access 文件句柄 + 文件指纹）；解析 EPUB3 nav / EPUB2 NCX 目录；上一章 / 下一章、阅读进度记忆、主题跟随；选中文本可划线 / 摘录，重开同一本书按「章节锚点 + 文本引用」还原高亮。
- 新增端上翻译（PDF / EPUB / 网页采集条三处接入）：基于 Chrome 内置 Translator / Language Detector API，含语言映射、分块与本地缓存，无网络依赖；目标语言固定中文，阅读器用 `myz_translate_db`、内容层用 `chrome.storage.local`。
- 抽出共享阅读器 chrome（侧栏 / 目录 / 标注行 / 选区工具条 / 翻译浮层 / 阅读落地页），PDF 与 EPUB 复用；Dashboard 新增「阅读」页，聚合两个本地进度库作为最近文档入口。
- PDF 选区升级为段落 / 栏感知：几何分行分段、拖拽端点吸附段落边界、三连击选整段，减少跨栏串扰。
- 设计系统 v0.2 落地：token 真源、配色方案、Tailwind 映射；新增共享 `StatePanel` / `ColorPalette` / `SelectInput` / `SettingsRow`，设置页统一为「左标签 + 右控件」；本地打包 SC/TC/HK/JP/KR CJK 字体按 UI 语言动态加载；新增设计规范 §4.17–§4.25。
- 加密同步 v2（E2EE）：设备绑定密钥模型（A 身份 / D 数据密钥被设备公钥包裹）、按设备签名与 roster、设备配对入组、账号级多流同步与失败隔离、确定性 LWW 合并、分片打包与有界并发 IO、抗回滚与凭证加密落盘；高亮与 Inbox 状态的删除以墓碑跨设备传播，并按设备签名水位回收墓碑。设置页在账号存在时隐藏旧格式密钥 / KeyId。
- Inbox v0.5：左侧栏（状态导航 + 标签，拖拽打标签、点击筛选）、独立状态子流、稍后（snooze）分桶、可关闭的每日清理提醒、队列页 / 专注分流与批量操作。
- UX 修复：焦点陷阱、键盘可达性、保存状态可见、文本截断与滚动选择器、Esc 关闭、命中区放大、标注列表分批 + 无限滚动、标签排序与上限；e2e 默认无头运行。
- 阅读器大文件性能：PDF 改为有界并发渲染队列 + 可取消渲染 + 离屏页位图回收（LRU），不再随滚动无限增长内存；远端 PDF 默认按需 range 拉取而非后台下载全文；限制画布分辨率与解码图片体积；滚动测量 rAF 合并、跳页不再等待 IndexedDB 写入。EPUB 解压在 Worker 中执行以避免打开大书时冻结主线程，并缓存章节渲染结果（按主题失效）、去除资源重复拷贝、复用 IndexedDB 连接。
- PDF 落点渲染优化：跳转/拖动到某页时优先独占渲染该页（不与相邻页争 CPU），先绘制低分辨率预览「秒开」，再在后台升级到全分辨率；拖动过程中丢弃/取消已远离视口的排队与在飞渲染，滚动页码定位改为 O(1)，扫描页（无文本层）跳过字体等待与文本层同步。

# v0.6.3 PDF 阅读器导航侧栏与选择修复

- PDF 阅读器新增左侧导航侧栏：可按 PDF 目录（书签）跳转章节，或按页查看标注并精确定位到标注位置；侧栏开关与标签页会记忆。
- 标注列表支持关键词搜索，可按选中文本 / 批注 / 标签过滤，也可按类型（高亮 / 保存文字）筛选。
- 修复下划线 / 波浪线会覆盖选中文字前后内容的问题（pdf.js 以整行 text item 为一个 span，旧实现会装饰整个 span）。
- 修复长段落选中或高亮时，范围在文字右侧多出一截空白的问题（文本层宽度改为对齐实际墨迹）。
- 修复从 Dashboard 跳转阅读器打开本地 PDF 时因缺少用户激活导致 `requestPermission` 失败的问题：改为在点击处预先申请读取权限，必要时在阅读器内提供「重新授权并打开」。
- 内部重构：阅读器状态迁移到 Pinia store 与组件化拆分，行为与对外接口保持不变。

# v0.6.1 PDF 阅读与标注

- 新增内置 PDF 阅读器：显式打开本地文件（File System Access 文件句柄）或网页 PDF，默认连续滚动、按需懒渲染、缩放（50%–300%）与阅读进度记忆。
- 支持在 PDF 中选中文本进行高亮 / 保存文字，添加批注与标签；重新打开同一 PDF（本地按文件指纹、网页按 URL）自动还原高亮，下划线 / 波浪线贴合字形。
- 支持 JPEG2000 / JBIG2 等图片型 PDF：随包提供 pdf.js WASM 解码资源，并在 MV3 CSP 中启用 `'wasm-unsafe-eval'`。
- 入口：Popup 的 PDF 按钮、右键链接「在 MyZ 中打开 PDF」；网页 PDF 无 `.pdf` 后缀（如 arXiv）也可识别。
- Dashboard：卡片 / 列表 / 查看器显示「第 N 页」徽标，并可一键跳回阅读器对应页。
- 新建标注沿用上次使用的高亮样式与颜色；Inspector 提供显式「保存」按钮与保存状态提示。
- 说明：本地 PDF 目前仅支持 Chrome（依赖 File System Access API）。

# v0.6.0 移除 AI 能力与 Dashboard 收敛

- 移除 AI 智能助理（SidePanel）及其全部相关能力：Provider 配置、MCP Server、本地 tools、Agent Skills、向量检索（Vectoria）、自动高亮、Superpower 多 Agent 协作与 Dashboard 聊天页面。
- 移除社区导入（X / Mastodon）；导入统一为本地文件导入（MyZ JSON、RainDrop CSV、Weava CSV、Chrome 书签 HTML）。
- 精简扩展权限与右键菜单：移除 `sidePanel` 权限，右键菜单仅保留禅定模式相关项。
- Dashboard 收敛为高亮管理与设置两大区域：高亮列表 / 查看器 + 设置（标注偏好、外观、导入、加密同步）。

# v0.5.0 Dashboard UI 重构与交互优化

- ThemeToggle 下拉改为按 effective theme 显示状态，并修复 Dashboard 中下拉被面板遮挡的问题。
- HighlightCard / HighlightListRow 的 RecordKind 与操作按钮统一改为 lucide icon，去除文字标签并支持 hover tooltip。
- 标签区增加 Hash icon，紧凑化排列；Card 视图改为 CSS columns masonry 流式布局。
- 摘要内容区应用 prose 排版，修复列表等富文本样式异常。
- Card 内批注改为上下结构，适配瀑布流卡片高度。
- 内容浮动工具条第四按钮改为搜索：调用 `chrome.search.query` 打开新页面搜索选中内容。

# v0.4.4 Provider Tiering 与 Mistral SDK 接入

- 新增 `mistral` provider type，并接入官方 `@mistralai/mistralai` SDK，用于模型列表、连接测试、对话、streaming 与 tool calling。
- 为 `openai_compatible` 新增 `compatProfile` / `reasoningMode` / `reasoningEffort` / `reasoningBudget` 设置项，按供应商 profile 进行 request patching，而不是再假设统一 reasoning 契约。
- 将 Tier 1 兼容支持收敛为 `deepseek` / `moonshot` / `glm`，并把 reasoning replay 改成 profile-aware 策略。
- 将 Qwen 等 Tier 2 兼容接口改成显式 profile 入口，避免继续暴露已删除的独立 provider type。

# v0.4.3 OpenAI-compatible reasoning 续传修复

- 修复第三方 OpenAI-compatible Chat Completions 接口在 thinking mode 下的多轮对话失败问题：当供应商要求回传 `reasoning_content` 时，后续对话与 tool-calling 续轮会自动回放该字段。
- 限定 reasoning 回放只对非官方 `api.openai.com` 的 OpenAI-compatible provider 生效，避免误把该兼容字段发送到官方接口。
- 修复 Settings 中启用 Streaming 后“测试连接”仍发送 `stream: false` 的问题，并让 OpenAI-compatible client 组装显式遵守该开关。
- 将 OpenAI-compatible / OpenAI Responses 的传输层切换到 `openai` SDK，将 Anthropic 传输层切换到 `@anthropic-ai/sdk`，并将 Gemini 传输层与模型列表切换到 `@google/genai`，保留现有统一消息映射、tool calling 和自定义 headers 兼容。
- 收缩 provider 类型范围：仅保留 `openai_compatible` / `openai_responses` / `anthropic` / `gemini`，删除 `moonshot` / `qwen` / `ollama` / `vllm` / `llama_cpp` 的设置入口与 runtime 支持。

# v0.4.2 Dashboard 新查看器与页面聚合

- 新增 `/highlights/:id` 查看器页面，支持同页标注连续阅读、滚动到底自动切换、上一页/下一页导航。
- Dashboard 高亮列表新增可折叠页面侧边栏，支持按网页筛选与按时间/Range 顺序查看。
- 标注内容新增 `contentType` 字段，支持 Markdown/HTML/纯文本渲染，AI 摘录默认使用 Markdown。

# v0.4.1 Dashboard 路由与导入增强

- 重构了 Dashboard（docs/plan/vuerouter-refactoring.md）。
- 设置页面加入了 sidebar。
- 加入了 Dashboard 的聊天页面。
- 加入了 RainDrop 和 Chrome 书签的导入支持。

# v0.4.0 Superpower Mode 与多 Agent 协作

- 实现 Superpower Mode，加入多 Agent 协作流程（规划 → 审核 → 执行 → 验证）与任务编排。
- 对话侧边栏 UI 收敛信息密度：顶部控制区合并为图标按钮，任务面板默认折叠为进度行并支持悬浮预览。
- 新增对话标题生成与历史列表展示优化：基于原始请求生成标题，展示页面标题/域名/时间；历史或失败统一显示“未命名对话”。
- 修复内容脚本编辑弹窗中调色板颜色编辑无法打开颜色选择器的问题。

# v0.3.2 自动高亮与分类标注

- 新增 Auto Highlight Agent：基于页面主体内容自动生成高亮，并创建对应 MyZRecord 与 “AI生成标注” 标签。
- “发现关键要点”改为独立右键菜单入口，可直接触发自动高亮。
- Dashboard AI 设置支持 Auto Highlight 模型选择、最大高亮条数与分类（conceptual / structural / behavioural）样式/颜色映射，并显示图标与样式预览。
- Popup 空状态增加“一键自动高亮”按钮。
- 自动高亮范围匹配增加标点容错与重叠过滤，提升生成稳定性。

# v0.3.1 交互与设置稳定性

- 修复高亮点击后 Inspector 不显示的问题，并将其改为贴近高亮的工具条式展示（有批注则上方展示，编辑时自动关闭）。
- 调整高亮定位提示为更柔和的脉冲/光晕动画，提升夜间与马克笔模式的可见性。
- Interests 功能仅在向量检索启用且配置了模型时显示；同时清理悬浮指示器并降低指示点体积。
- 统一新增 SVG 图标到共享库，更新 Popup/SidePanel/Inspector 的设置与操作图标样式。
- 修复 AiProviderEditor 模型列表在重新排序时的误选问题，取消勾选时自动选中相邻项方便继续编辑。

# v0.3.0 端到端加密同步（E2EE）

- 新增加密同步（S3 兼容）：由你自行填写对象存储信息并发起同步。
- 同步密钥由用户输入密码派生，密钥仅保存在本地；遗忘密码需重新全量加密并同步。
- 云端仅存储密文与必要的元信息，并提供同步状态与手动同步入口。

# v0.2.0 Agent Skills

- 加入 Agent Skills：支持内置技能与自定义技能（Zip/文件夹导入）。
- 支持 `@skill-name` 显式引用技能，并提供“自动”模式由选择器模型挑选。
- Dashboard 新增技能管理与编辑入口。

# v0.1.5 AI 智能助理与向量检索

- 加入 AI 智能助理（SidePanel）：
  - 支持向模型发送网页上下文、选中内容、图片/截图进行对话探索（需要模型开启 Vision 能力）。
  - 支持“发送前压缩图片（最长边 ≤ 640px）”的可选设置。
  - 支持 Tool Calling：可配置 MCP Server，也可启用/禁用本地 tools，并支持“自动”模式用一个选择器模型为每次输入选择需要启用的工具子集。
- 加入向量检索（Vectoria）：通过 embeddings 在你历史标注中检索相似内容，并在页面内/侧边栏展示；支持配置匹配阈值与重建索引。
- 加入社区导入：支持从 X（Twitter）与 Mastodon 抓取导入内容（无需官方 API）。
- 移除 LogSeq 同步功能（避免额外网络集成与复杂配置）。

# v0.1.4 图标统一与 SPA 修复

- 将浮动工具条、Popup 与 Dashboard 中沿用的 Emoji 按钮统一替换为自研 SVG 图标，在不同浏览器与操作系统下保持亮度与细节一致。
- 调整标注样式切换器的视觉：恢复马克笔造型的高亮图标，将下划线样式改为 `U` + 下划线组合，三种样式一眼可分辨。
- Dashboard 设置入口扩大图标字号并添加外轮廓，让设置按钮在工具栏中更易被发现。
- 修复 Twitter 等 SPA 内部导航仅在前进/后退时才恢复高亮的问题；现在点击推文直达页面也会监听 History 变更并即时重新应用标注与角标。

# v0.1.3 Vue3 架构与高亮稳健性

- 将扩展整体迁移到 Vite + `@crxjs/vite-plugin` + Vue 3/JSX 架构，重构 Popup、Dashboard、content script 与 background 模块以组件化方式组织代码。
- 重新设计高亮 Range 序列化逻辑：暂时拆除 `.myz-highlight` 包裹节点，记录元素路径 + 字符偏移，在恢复时按原始 DOM 重新定位，解决删除旧标注导致后续标注错位的问题。
- 在 `handleAnnotateClick` 中增加重叠检测，遇到已有标注直接弹出提示并终止创建，Playwright 新增覆盖用例防止回归。
- 更新暗色友好的调色板默认色值，并保持 Markdown 导出描述同步。
- 为 SPA 导航挂钩 History API 监听，配合 `updateHighlightIndicators()` 保证页面跳转后高亮与扩展角标即时刷新。
- 修复浮动工具栏「保存文字」流程未写入内容的问题，扩充 Playwright 套件（复杂页面、高亮导出、截图下载）并在 `extension-ci` 工作流中默认执行。
- 设计全新带有「ℤ」符号的图标资产，统一扩展图标与操作栏视觉语言。

# v0.1.2 多样标注样式与纯文本收藏

- 浮动工具栏新增 📝 按钮，可将选中文本仅作为收藏保存，扩展角标与 Popup 统计中会与标注一并计数。
- Popup 与 Dashboard 在列表中清晰区分「划线标注 / 保存文字」，并提供将无法定位的标注一键降级为纯文本收藏。
- Dashboard 卡片视图调整顶部布局：类型标识与站点名称分行展示，长网址自动裁剪不再撑开版面；列表视图移除独立标签列，将标签嵌入类型信息下方并统一溢出处理。
- 标注支持 🖍️ 高亮、✏️ 下划线、〰️ 波浪线三种样式，内容脚本和 Dashboard 弹窗内均可切换且记忆最近选择，Markdown 导出会包含样式描述。
- 优化下划线 / 波浪线样式实现，仅增添文本装饰、不再改变字体粗细或行距，在 Twitter 等窄行距页面呈现更自然。
- 采集弹窗与 Dashboard 详情中长标题改为单行省略的小号字体，避免影响整体布局。

# v0.1.1 标注和截图功能增强

- 添加了导入功能
- 添加了浏览器工具栏角标提示
- Popup页面中会提醒定位失败的标注
- 修复了动态页面标注定位的问题
- 修复了工具栏会展示到页面外的问题
- 修复了截图时会截取选中状态的问题

# v0.1.0 初始发布

**MyZ 高亮智能助理** 是一款 Chrome 扩展，帮助你在任意网页高亮文本、撰写批注、截图收集，并在本地管理这些资料。它支持导出 JSON / Markdown。

## 主要特性
✍️ 即时高亮：选中文本自动出现浮动工具条，可一键添加批注或使用 📸 按钮截取选区图片。
🎨 可定制调色板：提供 5 色调色板并记忆最近使用的颜色，支持快速编辑颜色值。
🧭 稳定的高亮回放：所有数据持久化在 chrome.storage.local，重新访问同一页面时自动恢复高亮。
📑 富文本保真：采集时保留链接、列表、引用、代码块等基础结构，展示与导出时按需转换为 Markdown。
🧰 管理中心：Dashboard 支持卡片 / 列表视图（记忆上次选择）、标签多选、全文搜索、日期范围与网站筛选，并采用懒加载保障性能。
🗂️ 侧边详情面板：点击任意高亮即可在页面右侧打开固定位置的详情面板，支持复制 Markdown、编辑、删除。
