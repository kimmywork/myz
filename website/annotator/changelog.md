# 更新日志

以下内容摘自扩展的变更记录，便于用户快速了解版本更新。

当前商店版本：
- [![](https://img.shields.io/chrome-web-store/v/mhakfcbobhdemicjelhjjpmgibhnnplg)](https://chromewebstore.google.com/detail/mhakfcbobhdemicjelhjjpmgibhnnplg) 
- [![](https://img.shields.io/badge/dynamic/json?label=edge%20add-on&prefix=v&query=$.version&url=https://microsoftedge.microsoft.com/addons/getproductdetailsbycrxid/fepakkoggnancnpcclldodfbpgobkabj)](https://microsoftedge.microsoft.com/addons/detail/fepakkoggnancnpcclldodfbpgobkabj)

## v0.4.1 — Dashboard 体验升级

- Dashboard 结构升级，更清晰易用。
- 设置页面新增侧边导航，快速跳转到不同设置区域。
- 新增 Dashboard 内的聊天页面，便于集中管理对话。
- 导入能力增强：支持 RainDrop CSV 和 Chrome 书签 HTML。

## v0.4.0 — Superpower 模式与多 Agent 协作

- 新增 Superpower 模式，支持多 Agent 协作式的任务流程。
- 对话侧边栏界面更清爽，信息更集中。
- 对话标题与历史列表展示优化，浏览更直观。
- 修复调色板颜色编辑无法打开的问题。

## v0.3.2 — 自动高亮与分类标注

- 新增自动高亮能力，自动生成关键内容标注。
- 关键要点发现改为独立入口，操作更便捷。
- AI 设置新增自动高亮的模型与分类样式配置。
- Popup 空状态新增“一键自动高亮”按钮。
- 高亮匹配更稳健，降低误差与重叠。

## v0.3.1 — 交互与设置稳定性

- 修复高亮点击后 Inspector 不显示的问题，并改为贴近高亮的工具条式展示（有批注则上方展示，编辑时自动关闭）。
- 调整高亮定位提示为更柔和的脉冲/光晕动画，提升夜间与马克笔模式的可见性。
- Interests 功能仅在向量检索启用且配置了模型时显示；同时清理悬浮指示器并降低指示点体积。
- 统一新增 SVG 图标到共享库，更新 Popup/SidePanel/Inspector 的设置与操作图标样式。
- 修复 AiProviderEditor 模型列表在重新排序时的误选问题，取消勾选时自动选中相邻项方便继续编辑。

## v0.3.0 — 端到端加密同步（E2EE）

- 新增加密同步（S3 兼容）：由你自行填写对象存储信息并发起同步。
- 同步密钥仅保存在本地，云端只存储密文与必要的元信息。
- 新增同步状态展示与手动同步入口（KeyId、Manifest 版本、上次同步时间等）。

## v0.2.0 — Agent Skills

- 加入 Agent Skills 能力：
  - 支持内置技能与自定义技能（Zip/文件夹导入）。
  - 支持 `@skill-name` 显式引用技能。
  - 支持“自动”模式，用选择器模型为每次输入挑选技能。
- 新增技能管理与编辑入口（Dashboard → AI 设置）。

## v0.1.5 — 集成 AI

- 加入 AI Assistant 集成：
  - 支持 AI 模型分析页面，
  - 支持发送页面上下文与 AI 对话，
  - 支持自定义 Provider 和 MCP 服务器，
  - 支持向量索引和网页内容智能发现。
- 移除 LogSeq 同步功能。
- 加入社交网络内容导入功能 - 支持 X（Twitter）、Mastodon。

## v0.1.4 — 图标统一与 SPA 修复
- 浮动工具条、Popup、Dashboard 的按钮图标全部改为自研 SVG，避免不同系统的 Emoji 渲染差异。
- 标注样式切换器恢复马克笔高亮图标，新增带下划线的字母 U 图标，三种样式一眼可辨。
- Dashboard 设置按钮增大字号并添加描边，入口更醒目。
- 修复 Twitter 等单页应用在站内跳转时高亮不会刷新问题，现在点击推文也会立即重新应用标注。

## v0.1.3 — Vue3 架构与高亮稳健性
- 迁移到 Vite + `@crxjs/vite-plugin` + Vue 3/JSX 架构。
- 重构 Popup、Dashboard、content 与 background 模块。
- 重新设计高亮 Range 序列化，修复删除旧标注导致错位的问题。
- 增加重叠检测与相关 Playwright 覆盖用例。
- 更新暗色友好调色板与导出描述同步。
- 为 SPA 导航挂钩 History API，保证页面跳转后即时刷新。
- 扩充端到端测试套件与统一图标视觉语言。

## v0.1.2 — 多样标注与纯文本收藏
- 新增「保存文字」按钮，将选中文本作为收藏保存。
- Popup/Dashboard 清晰区分类型并支持降级为纯文本。
- 三种样式：高亮、下划线、波浪线；导出包含样式描述。
- 优化文本装饰在窄行距页面的表现。

## v0.1.1 — 标注与截图增强
- 导入功能与浏览器工具栏角标。
- 定位失败标注提醒；修复多项稳定性问题。
- 截图流程优化，解决选中态截取问题。

## v0.1.0 — 初始发布
MyZ Annotator 帮助你在任意网页高亮文本、撰写批注、截图收集，并在本地管理这些资料。支持导出 JSON/Markdown 与 LogSeq 增量同步。
