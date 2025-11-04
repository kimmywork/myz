---
agent: Copilot
model: GPT-5-Codex
date: 2025-11-04
---

`extension/` 目录下是我创建的一个用于标注网页内容的插件。 我希望添加对于 Internet Archive 的支持。

1. 如果访问到了 Internet Archive 中的我们标记的页面，也可以高亮显示对应的内容。
2. 在进行标记的时候，用户可以选择是否同时把页面保存一份到 Internet Archive。执行保存之前先通过 CDX API 检查是否已经有存档存在。同时把保存的记录保留在本地存储中，以防止多次提交同一个页面的保存请求。
3. 用户可以在Dashboard中开启 Internet Archive 保存的功能，同时可以添加可选的 credentials，包含一个 Access Key 和一个 Access Secret

请参考文档 #file:internet-archive.md 。

---

首先，我在 https://myz.kimmy.fun/privacy.html 加了高亮以后，并没有在 http://web.archive.org/web/20251104091250/https://myz.kimmy.fun/privacy.html 上面看到高亮结果复现

---

The comment web archive injected is 
`<!-- BEGIN WAYBACK TOOLBAR INSERT -->`
and 
`<!-- END WAYBACK TOOLBAR INSERT -->`

---

还是不能正常匹配。现在连原本页面都不能展示了。

---

刚刚测试有问题。现在可以了。

---

鉴于internet archive的负载和不稳定性，请维护一个持久化的保存请求队列，并且记录每一次到internet archive API 调用的历史。如果有新的archive 请求，请先检查历史和队列中是否存在这个 URL，否则跳过。

Dashboard 中在设置页面添加查看请求历史的入口

---

Dashboard 设置页面加上查看请求历史和请求队列的功能

---

ReferenceError: archiveQueueWithPosition is not defined

---

不错，问题搞定了。

但是我发现另外一个小bug。
当我们在 Web Archive 上再编辑或者添加新的标注时，插件可以成功把页面定位到原始页面上。但是在Web页面上添加的内容其 hostname 和 sourceurl 都是 web.archive.org。我希望能够保持跟原始页面一致——同时如果是来自 web archive 的标注，在记录 webarchive 的 url 的同时，在dashboard页面记录上添加一个操作以打开 web archive 的对应页面。

---

这次修改导致某个测试失败了，请修复：

tests/extension/dashboard.spec.js:391:1 › import_by_file_via_settings

因为我们对dashboard的改动影响了导入组件的位置。
我的建议是把导入组件放在internet archive等组件的前面。这样不用修改测试，保持逻辑照常。

---

运行测试之前先 npm run build

---

更新一下 Wording，记录列表和卡片里的 “打开页面“ ”打开存档“ “降级为保存” 分别改为 “页面”， “存档” 和 “降级”。

---

请把 Internet Archive 的支持和同步功能涉及到的相关隐私问题更新到 `docs/PRIVACY_POLICY.md` 和 `privacy.md`。指出作为插件我们不收集和利用这些数据，请用户使用时自行承担风险。

请同时生成中文和英文各一份服务协议（Term Of Service），其中也指出我们不收集任何用户数据，请用户自行承担使用时的风险。

---

