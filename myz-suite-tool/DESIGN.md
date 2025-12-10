## MCP 网关与中转服务设计

本文件描述 `myz-suite-tool` 内置的 MCP 网关 / 中转服务的设计与使用方式，基于 MCP 规范 2025‑06‑18 版和 Tauri 2。

目标：
- 对外暴露一个符合 MCP Streamable HTTP 规范的单一 MCP 端点。
- 在内部管理多个 MCP 服务器（stdio / 未来可扩展 HTTP），并聚合其 tools。
- 支持对 tools 名称做前缀 / 别名转译，解决不同 MCP 服务工具名冲突问题。
- 记录运行时状态与统计信息，并通过 Tauri 暴露给 Vue UI。

---

## 总体架构

- MCP 网关模块：
  - 配置模块：`src-tauri/src/mcp_config.rs`，负责 `McpConfig` / `McpServerConfig` / `McpServerKind` 定义与配置文件加载。
  - 运行时模块：`src-tauri/src/mcp_runtime.rs`，负责 `McpManager` / `McpServer` / `McpSession` 与 stdio/HTTP transport 的实际调用。
  - HTTP 网关模块：`src-tauri/src/mcp_http.rs`，负责对外 `/mcp` HTTP 端点及相关 Tauri commands。
  - 在 `src-tauri/src/lib.rs` 中通过 `pub mod mcp { ... }` 聚合导出，前端和其它模块统一通过 `mcp::...` 使用。
- Tauri 集成入口：`src-tauri/src/lib.rs`

主要组件：
- `McpManager`：网关管理器，负责：
  - 读取 `mcp.config.json`（或 `MYZ_MCP_CONFIG` 指定的路径）。
  - 为每个启用的 MCP server 创建 `McpServer` 实例。
  - 管理会话 `McpSession`，为每个 HTTP 初始化请求分配 `Mcp-Session-Id`。
  - 在启动时拉起所有 stdio 类型的 MCP 服务器。
- `McpServer`：单个下游 MCP 服务器的抽象：
  - 对于 `type: "stdio"`：通过 `tokio::process::Command` 启动子进程，使用 stdin/stdout 承载 JSON-RPC。
  - 对于 `type: "http"`：不启动本地进程，而是作为 MCP HTTP 客户端，通过 Streamable HTTP + 可选 SSE 调用远程 MCP 服务器。
  - 上层统一通过 `request`（有 `id` / 返回结果）和 `notify`（无 `id`）调用。
  - 维护运行状态和统计信息（请求数、错误数、tools 数量、tools 调用次数）。
- `McpSession`：
  - 记录会话所使用的协议版本。
  - 存储 tools 名称映射：外部工具名 → 具体 server + 原始工具名。
  - 同一会话内的 `tools/list` 和 `tools/call` 共用同一映射表。

对外暴露：
- 一个 MCP HTTP 端点：`POST /mcp`（绑定地址见下文），对上游表现为一个标准 MCP 服务器。
- 一个 SSE 端点：`GET /mcp`，当前作为空的 SSE stub，用于兼容期待打开 SSE 通道的客户端（暂不向上游推送实际事件）。
- 一个 Tauri command：`mcp_list_servers`，用于前端读取 MCP 服务运行状态。

---

## 配置文件设计

配置文件用于声明要接入的下游 MCP 服务器，以及工具名前缀 / 别名等转译规则。

### 文件位置

- 默认路径：当前工作目录下的 `mcp.config.json`。
- 环境变量：若设置了 `MYZ_MCP_CONFIG`，则优先使用该路径。

### 顶层结构

```json
{
  "servers": {
    "<serverId>": {
      "title": "Human readable name",
      "enabled": true,
      "prefix": "fs:",
      "aliases": {
        "read_file": "fs.read_file"
      },
      "type": "stdio",
      "command": "uvx",
      "args": ["mcp-server-filesystem"],
      "env": {
        "ROOT": "/Users/qliu23"
      }
    }
  }
}
```

字段说明（`McpServerConfig`）：
- `title: string | null`
  - 可选，人类可读名称，用于 UI 展示。
- `enabled: boolean`
  - 是否启用该 MCP server，默认 `true`。
- `prefix: string | null`
  - 可选，给该 server 的所有 tools 名称统一添加前缀，例如 `fs:`、`git:`。
  - 用于解决多个 MCP 服务器工具名冲突问题。
- `aliases: { [originalName: string]: string }`
  - 可选，工具别名表，用于单独重命名某个工具。
  - 示例：`"read_file": "fs.read_file"`。
  - 在工具名映射时优先于 `prefix`。
- `type: "stdio" | "http"`
  - 当前实现：
    - `"stdio"`：使用子进程 + stdio transport 启动 MCP 服务器。
    - `"http"`：以 MCP Streamable HTTP 方式连接已运行的 HTTP MCP 服务器。
- `command: string`（仅当 `type: "stdio"` 时使用；`"http"` 类型在 config 文件中使用 `url` 字段）
  - 可执行命令，如 `uvx` / `npx` / `node` / `python`。
- `args: string[]`（仅当 `type: "stdio"` 时使用）
  - 命令行参数数组，如 `["mcp-server-filesystem"]`。
- `env: { [key: string]: string }`
  - 可选，为 MCP server 进程设置的环境变量。

示例：结合 uvx / npx

```json
{
  "servers": {
    "fs": {
      "title": "Filesystem Server",
      "enabled": true,
      "prefix": "fs:",
      "aliases": {
        "read_file": "fs.read_file"
      },
      "type": "stdio",
      "command": "uvx",
      "args": ["mcp-server-filesystem"],
      "env": {
        "ROOT": "/Users/qliu23"
      }
    },
    "git": {
      "title": "Git Tools",
      "enabled": true,
      "prefix": "git:",
      "type": "stdio",
      "command": "npx",
      "args": ["@modelcontextprotocol/server-git"],
      "env": {}
    },
    "http-tools": {
      "title": "HTTP MCP Server",
      "enabled": true,
      "prefix": "http",
      "type": "http",
      "url": "http://127.0.0.1:9000/mcp",
      "headers": {
        "Authorization": "Bearer ...",
        "Custom-Header": "value"
      }
    }
  }
}
```

---

## Tauri 后端集成

### 依赖

在 `src-tauri/Cargo.toml` 中额外引入：
- `axum`：HTTP 服务器框架。
- `hyper`：用于处理 HTTP body。
- `tokio`：异步 runtime，包含 process/io/sync 等功能。
- `uuid`：生成会话 ID。
- `reqwest`：作为下游 HTTP MCP server 的 Streamable HTTP 客户端。
- `log` + `logforth`（附 `starter-log` 与 `append-file` feature）：统一日志输出到文件。

### 初始化流程（`src-tauri/src/lib.rs`）

```rust
mod mcp_config;
mod mcp_runtime;
mod mcp_http;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // 使用 logforth 初始化 rolling file 日志，便于调试 MCP 网关。
    let manager = mcp_runtime::create_manager_from_default_config();
    let manager_for_tauri = manager.clone();
    let manager_for_setup = manager.clone();

    let result = tauri::Builder::default()
        .manage(manager_for_tauri)
        .setup(move |_app| {
            // 顺序：先启动 stdio MCP server，再预加载 tools registry
            let for_runtime = manager_for_setup.clone();
            tauri::async_runtime::spawn(async move {
                for_runtime.start_all_servers().await;
                for_runtime.preload_tools().await;
            });

            // 启动 MCP HTTP 端点
            let for_http = manager_for_setup.clone();
            tauri::async_runtime::spawn(async move {
                mcp_http::start_http_server(for_http).await;
            });

            Ok(())
        })
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            mcp_http::mcp_list_servers,
            mcp_http::mcp_get_config,
            mcp_http::mcp_update_server,
            mcp_http::mcp_add_server,
        ])
        .run(tauri::generate_context!());

    // 应用退出时，尽量平滑关闭所有 stdio MCP server 子进程。
    let _ = tauri::async_runtime::block_on(manager.shutdown_all());
    result.expect("error while running tauri application");
}
```

说明：
- `create_manager_from_default_config()`：
  - 加载配置文件。
  - 为每个启用的 `servers` 创建 `McpServer`。
- `start_all_servers()`：
  - 依次启动所有 `type: "stdio"` 的 MCP 子进程。
  - 为每个 server 做 MCP 初始化握手（`initialize` + `notifications/initialized`）。
- `preload_tools()`：
  - 在所有 server 启动后，对每个 server 调用一次 `tools/list`，预加载所有工具列表。
  - 构建全局工具 registry，用于后续工具调用时的全局 fallback（即使某些客户端不再调用 `tools/list`）。
- `start_http_server()`：
  - 在单独任务中起一个 axum 服务器，暴露 MCP HTTP 端点 `/mcp`。
- 通过 `.manage(...)` 把 `McpManager` 注入到 Tauri，全局共享。

### 日志记录

- 在 `run()` 中使用 `logforth::starter_log` + `append::file::FileBuilder` 初始化日志：
  - 日志文件路径：
    - 优先使用环境变量 `MYZ_MCP_LOG_FILE`。
    - 否则默认写入当前目录下的 `mcp-gateway.log`。
    - 若目录不可写，则回退到 `./mcp-gateway-fallback.log`。
  - 输出级别：
    - 通过 `LevelFilter::MoreSevereEqual(Level::Debug)` 记录 `DEBUG` 及以上日志。
- 所有 MCP HTTP 网关 / stdio 子进程管理 / HTTP ping / tools 调用 / 配置读写等关键路径均通过 `log::debug!` / `info!` / `warn!` / `error!` 打日志，方便排查问题。

---

## MCP Streamable HTTP 接口设计

### 监听地址与端点

- 监听地址：
  - 环境变量 `MYZ_MCP_HTTP_ADDR`，例如 `"127.0.0.1:7812"`。
  - 若未设置，默认 `127.0.0.1:7812`。
- MCP 端点路径：
  - `POST /mcp`
- 完整 URL 示例：
  - `http://127.0.0.1:7812/mcp`

### 安全性

为了避免被浏览器通过 DNS rebinding 间接调用：
- 检查 HTTP `Host` 头：
  - 只接受以 `127.0.0.1:` 或 `localhost:` 开头的 Host。
  - 否则返回 `403 Forbidden`。

### 协议版本

- 当前 gateway 固定支持的 MCP 协议版本：`2025-06-18`。
- `initialize`：
  - 从 `params.protocolVersion` 读取上游请求的版本。
  - 若不为 `2025-06-18`，返回 JSON-RPC error（`Unsupported protocol version`）。
  - 若一致，创建会话并返回：
    - `result.protocolVersion = "2025-06-18"`
    - `capabilities.tools.listChanged = false`
    - `serverInfo.name = "myz-suite-tool-mcp-gateway"`
  - 同时在 HTTP 响应头写入：
    - `Mcp-Session-Id: <uuid>`
    - `MCP-Protocol-Version: 2025-06-18`
- 后续请求：
  - 必须携带：
    - `Mcp-Session-Id`：对应初始化返回的会话 ID。
    - `MCP-Protocol-Version: 2025-06-18`。
  - 如果缺失或版本不匹配，返回 `400` / `404`。

### 传输模式

当前实现遵守 MCP Streamable HTTP 要求，但对上游客户端采用“单个 JSON 响应”模式，对下游 HTTP MCP 服务器则支持 Streamable HTTP + SSE：
- `POST /mcp`：
  - 请求体为单个 JSON-RPC 消息（request / notification）。
  - 对 JSON-RPC request（带 `id`）返回单个 `application/json` 对象。
- `GET /mcp`：
  - 返回 `200 OK` + `Content-Type: text/event-stream` 的空 SSE 流，用于兼容期待打开 SSE 通道的客户端，目前不推送实际事件。

上游 Host（例如其他 MCP 客户端、Claude Desktop 等）可以直接把 gateway 当成一个 MCP HTTP 服务器：
1. `POST /mcp` 发送 `initialize` 请求。
2. 从响应头读取 `Mcp-Session-Id`。
3. 后续所有请求都携带 `Mcp-Session-Id` 和 `MCP-Protocol-Version` 头。
4. 调用 `tools/list` 和 `tools/call` 等方法。

### 下游 HTTP Transport 支持（Streamable HTTP + SSE）

对于配置为 `type: "http"` 的下游 MCP server，gateway 作为 MCP HTTP 客户端，通过 Streamable HTTP 调用目标服务：

- 初始化（`initialize`）：
  - gateway 启动时不会主动连接 HTTP server，而是在第一次调用时：
    - 通过 `POST <url>` 发送 JSON-RPC `initialize` 请求。
    - 请求头设置 `Accept: application/json, text/event-stream`。
    - 从响应中读取 `Mcp-Session-Id`（若存在），并缓存到 runtime 中。
- 后续请求（例如 `tools/list` / `tools/call`）：
  - gateway 构造单个 JSON-RPC request（body），并通过 `POST <url>` 发送。
  - 请求头：
    - `Accept: application/json, text/event-stream`
    - `Mcp-Session-Id`：使用上一步缓存的 session id（如有）。
    - `MCP-Protocol-Version: 2025-06-18`。
  - 响应处理：
    - 若下游返回 `Content-Type: application/json`：
      - gateway 将其解析为 JSON-RPC 响应，提取 `result` 或 `error`。
      - 将 `result` 原样嵌入上游的 JSON 响应。
    - 若下游返回 `Content-Type: text/event-stream`：
      - gateway 将 SSE 流整体读取为文本。
      - 从 `data:` 行中解析 JSON-RPC 消息，按 `id` 匹配对应请求。
      - 找到带有匹配 `id` 的响应后，提取其 `result`（或 `error`），返回给上游。
  - 当前实现会将下游 SSE 流收敛为一个最终 JSON 结果响应给上游客户端，而不是向上游透传逐条 SSE 事件。

---

## Tools 转译与路由逻辑

为解决多个 MCP server 工具名冲突问题，gateway 在 `tools/list` 和 `tools/call` 上做了统一的转译与路由。

### 工具名映射规则

1. 对每个 MCP server，从下游获取 `tools/list` 的结果：
   - 调用 server 的 JSON-RPC 方法 `tools/list`。
   - 当前实现不做分页，不返回 `nextCursor` 字段（缺失表示没有更多结果）。
2. 对 server 返回的每个 tool：
   - 取其原始名称 `originalName = tool.name`。
   - 计算外部展示名 `externalName`：
     - 若配置中 `aliases[originalName]` 存在 → 使用 alias 值（优先级最高）。
     - 否则若配置中 `prefix` 存在：
       - 若 `prefix` 以 `. / :` 结尾（例如 `search.`、`search/`、`search:`）→ 使用 `<prefix><originalName>`。
       - 否则 → 使用 `<prefix>.<originalName>`，例如 `search` + `search-links` → `search.search-links`。
     - 否则 → 使用原始名称 `originalName`。
   - 在 tool 对象中：
     - 覆盖 `name` 字段为 `externalName`。
     - 在 `annotations` 中增加标记：

       ```json
       "annotations": {
         "myz.mcpGateway": {
           "serverId": "<serverId>",
           "originalTool": "<originalName>"
         }
       }
       ```
   - 在当前会话 `McpSession` 中记录映射：
     - `externalName -> { server_id, original_tool_name }`。

### tools/list 请求

上游请求示例：

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/list",
  "params": {}
}
```

处理流程：
- gateway 遍历所有启用的 `McpServer`，调用其 `tools/list`。
- 按上述规则转译工具名，并构建会话内映射。
- 聚合所有 server 的工具列表，构成统一的 `tools` 数组，返回给上游。

返回示例（简化）：

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "tools": [
      {
        "name": "fs.read_file",
        "title": "Read file",
        "description": "...",
        "inputSchema": { ... },
        "annotations": {
          "myz.mcpGateway": {
            "serverId": "fs",
            "originalTool": "read_file"
          }
        }
      }
    ]
  }
}
```

### tools/call 请求

上游请求示例：

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/call",
  "params": {
    "name": "fs.read_file",
    "arguments": {
      "path": "README.md"
    }
  }
}
```

处理流程：
1. gateway 优先根据当前 `McpSession` 的映射表查找：
   - `fs.read_file -> { server_id: "fs", tool_name: "read_file" }`。
   - 若当前会话尚未调用 `tools/list` 导致映射缺失，则回退到全局 tools registry：
     - 启动时由 `preload_tools()` 预先构建：`externalName -> { server_id, tool_name }`。
     - 找到后会把映射写回当前 `McpSession`，便于后续快速查找。
2. 找到目标 `McpServer` 后：
   - 构造下游请求参数，将 `name` 替换为原始工具名：

     ```json
     {
       "name": "read_file",
       "arguments": {
         "path": "README.md"
       }
     }
     ```
3. 通过 `McpServer::request("tools/call", params)` 将 JSON-RPC 请求发送到下游 stdio MCP server。
4. 等待下游返回 JSON-RPC 响应：
   - 若包含 `error`，视作错误增加统计计数，并向上游返回对应 error。
   - 若包含 `result`，则将 `result` 部分原样返回给上游。

返回示例（简化）：

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "file content..."
      }
    ],
    "isError": false
  }
}
```

---

## Stdio MCP Server 管理与统计

每个下游 server 由一个 `McpServer` 管理：

### 启动与关闭

- 当 gateway 启动时，`start_all_servers()` 会：
  - 针对每个 `type: "stdio"` 的配置：
    - 使用 `tokio::process::Command` 启动子进程：
      - 设置 `stdin` / `stdout` 为 piped。
      - 应用配置中的 `env` 环境变量。
    - 将子进程的 `stdin` 封装为 `BufWriter`，用于写 JSON-RPC 消息。
    - 将 `stdout` 封装为 `BufReader`，起一个独立异步任务循环读取每一行：
      - 每行解析为 JSON。
      - 若包含 `id`，则根据 `id` 找到对应 pending 请求的 `oneshot` 发送结果。
    - 更新统计信息：
      - `running = true`
      - `last_start_time = now`
    - 完成 MCP 初始化握手：
      - `initialize` 请求（`protocolVersion: "2025-06-18"`）。
      - `notifications/initialized` 通知。
- `shutdown_all()`：
  - 关闭所有 stdio server 的 stdin，清空 pending，标记 `running = false`，让子进程平滑退出。

### 请求发送与响应分发（stdio）

- `request(method, params)`：
  - 内部维护一个自增 `next_id: u64`。
  - 构造 JSON-RPC 消息：

    ```json
    {
      "jsonrpc": "2.0",
      "id": <next_id>,
      "method": "<method>",
      "params": { ... }
    }
    ```

    - 若 `params` 为 `None`，则不包含 `params` 字段（例如 `ping` 时）。
  - 将消息序列化后写入 stdin，每条消息占一行。
  - 在 `pending` map 中记录 `id -> oneshot::Sender`。
  - 读协程从 stdout 收到响应行后，将对应消息送回。
  - 若消息包含 `error` 字段，累加 `total_errors`。

- `notify(method, params)`：
  - 构造不带 `id` 的 JSON-RPC 消息并写入 stdin。

### 统计信息结构

`McpServerStats`（内部使用）：
- `running: bool`
  - 当前是否认为 server 处于运行状态。
- `total_requests: u64`
  - 调用 `request` 的次数（成功/失败都会计数）。
- `total_errors: u64`
  - 收到 JSON-RPC error 时的累积计数。
- `last_start_time: Option<SystemTime>`
  - 最近一次启动时间。
- `tools_count: u64`
  - 最近一次 `tools/list` 成功返回的工具数量。
- `tools_call_count: u64`
  - `tools/call` 方法被调用的总次数。

对外 DTO：`McpServerStatusDto`：
- `id: string`
- `title: string | null`
- `prefix: string | null`
- `running: boolean`
- `total_requests: number`
- `total_errors: number`
- `tools_count: number`
- `tools_call_count: number`

对于 `type: "http"` 的 MCP server，由于没有本地子进程，`running` 状态通过定期对下游 server 调用 `ping` 方法来判断：
- gateway 为每个 HTTP 类型 server 启动一个后台 ping 任务（例如每 30 秒一次）。
- ping 请求采用 JSON-RPC：

  ```json
  {
    "jsonrpc": "2.0",
    "id": 1,
    "method": "ping"
  }
  ```

  即不包含 `params` 字段。
- 若 ping 调用成功回应，则将 `running` 标记为 `true`。
- 若 ping 失败（网络错误或 JSON-RPC error），则将 `running` 标记为 `false`。
- MonitorMCP 界面中 HTTP server 的运行状态与统计信息基于此 ping 结果更新。

---

## Tauri 与 Vue UI 交互

### Tauri commands

所有 MCP 相关命令定义在 `src-tauri/src/mcp_http.rs` 中，并在 `src-tauri/src/lib.rs` 里注册：

- `mcp_list_servers`：
  - 输入：`tauri::State<'_, McpManager>`。
  - 输出：`Result<Vec<McpServerStatusDto>, String>`。
  - 用于前端监控界面展示运行时状态与统计信息。
- `mcp_get_config`：
  - 返回当前配置文件中的所有 MCP server 配置（附带实时 `running` 状态）。
- `mcp_update_server`：
  - 根据前端传入的部分更新（title/enabled/prefix/command/args/env）修改 `McpConfig`。
  - 写回 `mcp.config.json`，并根据 `enabled` 状态平滑重启或停止对应 `McpServer`。
- `mcp_add_server`：
  - 新增一个 MCP server 配置（支持 `stdio` / `http`）。
  - 写回 `mcp.config.json`，若 `enabled = true` 则立即创建 runtime server 并尝试启动。

在 `lib.rs` 中通过：

```rust
.invoke_handler(tauri::generate_handler![
    greet,
    mcp_http::mcp_list_servers,
    mcp_http::mcp_get_config,
    mcp_http::mcp_update_server,
    mcp_http::mcp_add_server,
])
```

暴露给前端。

### 前端 MonitorMCP（运行状态监控）

- 文件：`src/views/monitor/MonitorMCP.tsx`。
- 周期性或手动刷新时调用：

  ```ts
  const services = await invoke<McpServerStatus[]>("mcp_list_servers");
  ```

- UI 展示内容：
  - 名称（`title` 或 `id`）。
  - `running` 状态（“运行中”/“已停止”）及绿色/红色标记。
  - `total_requests`、`total_errors`。
  - `tools_count`、`tools_call_count` 统计信息。

### 前端 MCPSettings（配置管理）

- 文件：`src/views/settings/MCPSettings.tsx`。
- 通过：

  ```ts
  const configs = await invoke<McpServerConfig[]>("mcp_get_config");
  ```

  获取配置 + 实时运行状态。
- 支持：
  - 编辑已有 server：
    - 使用 `McpServerEditItem` 组件（`src/components/settings/mcp/McpServerEditItem.tsx`）。
    - 可编辑 `title`、`prefix`、`enabled`、命令/URL、参数、环境变量（KEY=VALUE 每行）。
    - 保存时调用 `mcp_update_server` 并刷新列表。
  - 新增 server：
    - 使用 `McpServerAddForm` 组件（`src/components/settings/mcp/McpServerAddForm.tsx`）。
    - 支持选择类型 `stdio` / `http`：
      - `stdio`：`command` + `args` + `env`。
      - `http`：`command` 字段存放 URL，`args` 仅对 stdio 生效。
    - 保存时调用 `mcp_add_server`，成功后刷新列表。

MonitorMCP 与 MCPSettings 结合，实现了运行时状态监控 + 配置文件编辑的闭环。

---

## 后续扩展方向

当前实现已经支持：
- 多个 MCP server 工具名冲突的 prefix / alias 转译。
- 从 stdio / HTTP transport 的 MCP server 聚合 tools 并统一暴露为 MCP HTTP 服务器。
- 启动时预加载 tools registry（`preload_tools`），支持未先调用 `tools/list` 的客户端。
- 通过 Tauri / Vue 展示 MCP server 的运行状态、tools 数量与调用次数。
- 对 HTTP server 通过 `ping` 周期性健康检查。

后续可考虑的扩展：
- 上游 Streaming（SSE）透传：
  - 当前对下游 HTTP SSE 流做“收敛为单一 JSON 响应”的处理；
  - 可以进一步把下游 SSE 事件转成上游 `text/event-stream`，支持逐步输出。
- 更丰富的统计与监控：
  - 每个工具调用耗时分布、成功率。
  - 最近 N 次调用历史记录，便于调试问题。
- 更细粒度的配置：
  - 为 HTTP server 单独配置超时、重试、proxy。
  - 为不同 server 配置独立的前缀规则或 alias 模板。

以上是当前 MCP 网关 / 中转服务的完整技术设计，后续如有协议或实现变更，应以本文件为基础进行同步更新。
