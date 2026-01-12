# 安装指南

选择你的浏览器并进入对应的商店页面进行安装：

- Chrome 商店：<https://chromewebstore.google.com/detail/myz-annotator/mhakfcbobhdemicjelhjjpmgibhnnplg>
- Edge 商店：<https://microsoftedge.microsoft.com/addons/detail/myz-annotator/fepakkoggnancnpcclldodfbpgobkabj>

你也可以直接在首页点击「Chrome 安装」或「Edge 安装」按钮快速进入商店。

## 开始使用

1. 安装后，固定扩展图标到工具栏以便快速使用。
2. 选中网页中的文本，浮动工具条会出现，可进行高亮、下划线、波浪线标注，或点击 📸 截取选区图片。
3. 在页面右上角的图标角标中查看当前页面标注数量。
4. 打开 Popup 或 Dashboard 管理你的收藏与标注：搜索、标签筛选、导入/导出皆可在此完成。

## Dashboard 设置（功能配置）

在 Dashboard 顶部导航点击「设置」，可看到以下配置项：

### 导入标注

- **JSON 文件**：选择先前导出的 JSON 文件，或导入他人分享的标注
- **冲突处理**：
  - **遇到重复时跳过**
  - **遇到重复时覆盖**
  - **保留最近更新**

### 社区导入

通过打开网页并抓取内容的方式导入（无需调用官方 API）。书签页为私有内容，需要在浏览器里已登录对应账号。

- **Twitter / X**：填写个人主页地址，勾选要导入的类型（推文/回复/点赞/书签），可设置每类最多导入数量
- **Mastodon**：填写个人主页地址，勾选要导入的类型（嘟文/回复/转发/收藏/书签），可设置每类最多导入数量

### AI 智能助理

> 说明：AI Provider 目前使用 **OpenAI 兼容接口**。配置完成后，可在 SidePanel 中与模型对话，并按模型能力启用图片、工具与向量检索等功能。

#### 1) 启用智能助理

- 开启后才会启用下面的 Provider / Agent / Tools 等配置

#### 2) Providers（模型提供方）

- **Base URL**：例如 `https://api.openai.com/v1`
- **API Key**：例如 `sk-...`
- **Headers（可选）**：以 `Key: Value` 的形式逐行填写（用于自定义鉴权/路由头）
- **测试连接**：选择一个模型并测试，通过后才能「启用 Provider」
- **模型列表**：
  - 可点击刷新按钮从 `{Base URL}/models` 加载
  - 也可手动添加模型名（例如 `gpt-4o-mini`）
  - 只有“启用”的模型才会出现在 Agent 选择列表中
  - 每个模型可配置能力与 token 参数：
    - **支持 Vision**：允许在对话中附带图片
    - **支持 Tool Calling**：允许模型调用工具（MCP / 本地 tools）
    - **支持 Reasoning**：用于启用/显示推理相关能力（如模型支持）
    - **Context Window / Max Output Tokens / 输出参数名**：用于控制上下文与输出 token 行为

#### 3) Agent 模型选择

- **Conversation**：SidePanel 主对话使用的模型与温度（temperature）
  - **发送前压缩图片（最长边 ≤ 640px）**：启用后会在发送前按等比例缩小图片（原图本身小于 640px 则不压缩）
- **Insights**：自动摘要/要点等分析功能使用的模型与温度

#### 4) MCP 服务器

用于接入外部工具（tools）。需先 **测试连接**，通过后才能启用。

- **URL**：MCP Server 地址
- **Headers（可选）**：逐行填写请求头（例如 `Authorization: Bearer ...`）

#### 5) 本地 Tools

本地 tools 会访问扩展内的数据（例如标注内容）。你可以按需勾选启用哪些工具，避免把不必要的信息暴露给模型。

- **手动模式**：对话时暴露所有“已启用的本地 tools”
- **自动**：为每次用户输入，使用一个“选择器模型”从已启用工具中挑选本次可用的 subset（更省、更安全）

#### 6) 向量检索（Vectoria）

用于根据当前页面内容匹配你历史标注的相似内容，并在页面内浮窗/SidePanel 中展示。

- **模型**：选择用于 embeddings 的 Provider+Model
- **测试连接**：通过后才能启用
- **启用**
- **匹配阈值（40% - 100%）**：只有相似度（score）高于阈值的结果才会展示，默认 **50%**
- **重建索引**：首次启用或更换模型后建议重建（将把已有标注重新建索引）

## 常见问题

- 如何导出到 Markdown？在详情面板或 Dashboard 中点击复制 Markdown 即可。
- 页面是单页应用（SPA）导航后丢失标注？扩展会自动感知 URL 变化并恢复，若仍无法定位会在页面与 Popup 中提示处理。
- AI / 向量检索无结果？
  - 请先在 Dashboard 的「设置 → AI 智能助理」里配置 Provider、启用对应模型，并为 Conversation / Vectoria 选择模型
  - 向量检索首次启用或更换模型后建议点击「重建索引」
