# 隐私政策（Privacy Policy）

以下为 MyZ Annotator 与 MyZ Danmaku 的隐私说明，内容整理自仓库文档并面向终端用户。

**生效日期：2025-11-04**

MyZ Annotator 帮助你在浏览器中高亮、批注，并可选择提交页面到 Internet Archive 或同步到你的 LogSeq 图谱。MyZ Danmaku 则在 YouTube 页面抓取带时间码的评论并以弹幕形式本地呈现。除非你启用了可选网络功能，否则所有数据仅保存在本地浏览器中，我们不收集、不上传任何个人信息。

## 本地存储的数据
- 高亮文本、批注、标签、颜色与截图元数据
- 扩展设置（调色板、视图偏好、Internet Archive 参数、LogSeq 端点/页面/Token）
- 你主动下载的截图（保存到你的设备）
- Internet Archive 队列与历史状态（仅用于在本地显示保存进度）

以上数据存储在浏览器本地空间（如扩展自带的本地存储），且仅与当前浏览器用户有关联，我们不会传输或备份至任何外部服务。MyZ Annotator / MyZ Danmaku 项目及维护者不会接触你的高亮数据、弹幕数据、队列条目或设置。

对 MyZ Danmaku 而言：

- 扩展会通过 YouTube 的私有接口读取当前视频的公开评论，以识别时间码。请求由你的浏览器直接发出，我们不代理、不保存、不窥视这些响应。
- 弹幕结果及其元信息（评论内容、作者、时间、点赞数等）会保存在浏览器本地，方便弹窗与扩展图标离线读取。
- 我们不收集任何用户信息或访问历史。所有解析结果都保存在你的本地设备中。

## 可选 LogSeq 同步
启用后，扩展将把你选择的高亮与批注发送到你配置的 LogSeq HTTP API（通常运行在 `http://127.0.0.1`）。数据仅在你的浏览器与本地 LogSeq 服务器之间传输，我们不运营服务器、不接收副本，也不记录这些请求。

同步负载包含：
- 转换为 Markdown 的内容
- 高亮 ID、创建时间与可选标签
- 你配置的认证 Token（若提供）用于与 LogSeq 通信

你可在设置中随时关闭同步，立刻停止所有网络请求。

## 可选 Internet Archive 保存

启用后，扩展会根据你的指令向 `https://web.archive.org` 提交当前页面的快照请求。发送的数据仅包含页面 URL 以及（如果你填写）用于认证的 Access Key/Secret。请求直接从你的浏览器发往 Internet Archive，我们不代理、不查看、也不会保存任何内容。

对于 MyZ Danmaku，通过 YouTube 的私有接口访问评论数据属于非公开渠道。我们不保证 Google 对此调用的容忍度，理论上 Google 可能对频繁调用的帐号或 IP 实施限流或阻断。若因此导致账号访问受限、视频无法加载或出现其他问题，责任由用户自行承担，我们无法提供补偿。

本地会存储：

- 你要求保存的页面 URL 队列
- Internet Archive CDX 接口和保存接口返回的最新状态
- 每次尝试的时间戳及 Internet Archive 返回的错误信息（若有）

重要提示：

- 向 Internet Archive 提交 URL 可能导致该页面被公开存档，请自行确认有权保存并了解其隐私影响。
- 任何 Access Key/Secret 仅保存在本地浏览器中，并在你发起请求时由浏览器直接发送给 Internet Archive，我们不会记录这些凭据。
- 你在启用该功能时即表示理解并承担使用 Internet Archive 带来的所有风险。

## 权限说明
- `activeTab`/`tabs`：MyZ Annotator 用于读取选区和截图；MyZ Danmaku 用于识别当前 YouTube 视频。
- `<all_urls>` 内容脚本：MyZ Annotator 用于浮动工具条与高亮；MyZ Danmaku 仅在 YouTube 页面运行，用于渲染弹幕。
- `storage`：在本地保存设置、弹幕缓存或高亮信息。
- `scripting`：MyZ Danmaku 用于在页面中展示弹幕浮层。
- `https://web.archive.org/*`：启用 Internet Archive 功能时用于发起存档请求与查询状态。
- YouTube 页面访问权限：MyZ Danmaku 需要读取公开评论，以便解析时间码并展示弹幕。

## 你的选择
- 通过 Dashboard 删除任何高亮、批注或截图。
- 随时禁用 LogSeq 同步。
- 卸载扩展后，浏览器会自动清理存储数据。

如需咨询或反馈，请通过[仓库的 Issue](https://github.com/myz-suite/myz-support/issues) 联系维护者。

## 我们不收集任何用户数据

MyZ Annotator 是纯客户端扩展，维护者没有任何后端服务用于接收、聚合或分析用户数据。扩展发出的全部网络请求只会发送到你配置的服务（如本地 LogSeq 或 Internet Archive）。启用这些可选集成即表示你理解并接受相关隐私风险。

