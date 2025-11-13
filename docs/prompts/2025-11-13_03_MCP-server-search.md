---
agent: Codex
model: GPT-5 High
date: 2025-11-13
---

请创建一个MCP Server，使用 Streaming HTTP 作为传输协议，提供一个通过关键字搜索链接的工具，以及通过URL提取网页文本的工具。搜索和提取内容通过playwright控制Chrome来实现，使用bing搜索引擎。搜索可以接受一个可选的数据条目量（小于等于50），如果能够继续访问下一页来满足数据量的要求，就继续收集更多的结果。返回的内容包含搜索结果的链接、标题、和摘要文本。提取页面文字返回的结果包含页面主要内容（如 main、#content、article等之类的关键数据部分的纯文本内容，如果找不到则返回空，同时提示并非内容页面。

你可以启动加载测试这个工具是否正常工作。同时添加一个开关方便以 非 headless 的方式运行playwright查看执行过程。

---

请使用 npm install @modelcontextprotocol/sdk 而非自己手动实现的方式创建这个服务

---


我手动测试了一下感觉没有问题。为了避免再hang住请不要运行smoke test了。请额外提供几个参数用于启动mcp服务，1. 服务运行的端口，2. 给到playwright的代理配置 （http/socks），3. 页面加载的超时时间。 另外在这两个工具调用里移除 headless 和 channel 的参数，同时对于 extract-page-text，添加一个 css selector 的参数，如果提供了的话就直接获取对应的匹配该selector的元素中的文本就OK。 前面提到的所有mcp服务的参数都不是用于调用工具的参数，只在mcp server启动的时候可用。可以通过环境变量 MYZ_SEARCH_* 或者 命令行参数 如 --port <port> --proxy <prox> --timeout <timeout-in-ms> 的方式传递。


---

启动一个浏览器的进程以后对齐进行持续管理，不要每次都启动新的进程。可以重复复用同一个页面，节省响应时间

---

Bing 会加入一个验证机制，需要正确点击验证以后才能通过。如果没有的话就会随机返回结果，请实现某种方式绕过这个验证。

---

OK，加入几个新的搜索引擎，包括 duckduckgo、yandex、baidu 和 google。并且在 search tool中添加这个 provider 参数，默认是 bing。

---

把更改同步到README.md

---

All of other providers (except bing) cannot locate search result items (links), please see why and fix

---

