use std::collections::HashMap;
use std::sync::{Arc, RwLock};
use std::time::SystemTime;

use log::{debug, error, info, warn};
use reqwest::Client;
use serde_json::Value;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader, BufWriter};
use tokio::process::Command;
use tokio::sync::{oneshot, Mutex as AsyncMutex};
use tokio::time::{sleep, Duration};
use uuid::Uuid;

use crate::mcp_config::{McpConfig, McpServerConfig, McpServerKind};

pub const SUPPORTED_PROTOCOL_VERSION: &str = "2025-06-18";

#[derive(Clone)]
pub struct McpManager {
    pub(crate) inner: Arc<McpInner>,
}

pub(crate) struct McpInner {
    pub(crate) servers: RwLock<HashMap<String, Arc<McpServer>>>,
    pub(crate) sessions: RwLock<HashMap<String, Arc<McpSession>>>,
    pub(crate) config: RwLock<McpConfig>,
    pub(crate) config_path: std::path::PathBuf,
    pub(crate) tool_registry: RwLock<HashMap<String, ToolRoute>>,
}

pub fn create_manager_from_default_config() -> McpManager {
    let (config, config_path) = McpConfig::load_default();
    let mut servers = HashMap::new();
    for (id, cfg) in &config.servers {
        if cfg.enabled {
            servers.insert(id.clone(), Arc::new(McpServer::new(id.clone(), cfg.clone())));
        }
    }
    McpManager {
        inner: Arc::new(McpInner {
            servers: RwLock::new(servers),
            sessions: RwLock::new(HashMap::new()),
            config: RwLock::new(config),
            config_path,
            tool_registry: RwLock::new(HashMap::new()),
        }),
    }
}

impl McpManager {
    pub fn servers(&self) -> Vec<Arc<McpServer>> {
        self.inner
            .servers
            .read()
            .unwrap()
            .values()
            .cloned()
            .collect()
    }

    pub fn create_session(&self, protocol_version: String) -> Arc<McpSession> {
        let id = Uuid::new_v4().to_string();
        let session = Arc::new(McpSession {
            id: id.clone(),
            protocol_version,
            tool_index: AsyncMutex::new(HashMap::new()),
        });
        self.inner
            .sessions
            .write()
            .unwrap()
            .insert(id.clone(), session.clone());
        session
    }

    pub fn get_session(&self, id: &str) -> Option<Arc<McpSession>> {
        self.inner.sessions.read().unwrap().get(id).cloned()
    }

    pub async fn start_all_servers(&self) {
        let servers = self.servers();
        info!("MCP manager starting {} configured servers", servers.len());
        for server in servers {
            info!("MCP manager ensuring server '{}' is started", server.id);
            let s = server.clone();
            tauri::async_runtime::spawn(async move {
                let _ = s.ensure_started().await;
            });
        }
    }

    pub async fn shutdown_all(&self) {
        let servers = self.servers();
        info!("MCP manager shutting down {} servers", servers.len());
        for server in servers {
            info!("shutting down MCP server '{}'", server.id);
            server.shutdown().await;
        }
    }

    pub async fn preload_tools(&self) {
        let mut registry: HashMap<String, ToolRoute> = HashMap::new();

        for server in self.servers() {
            let tools = match server.list_tools().await {
                Ok(t) => t,
                Err(err) => {
                    error!(
                        "failed to preload tools from MCP server {}: {}",
                        server.id, err
                    );
                    continue;
                }
            };
            for tool in tools {
                let name = tool
                    .get("name")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();
                if name.is_empty() {
                    continue;
                }
                let external_name = if let Some(alias) = server.config.aliases.get(&name) {
                    alias.clone()
                } else if let Some(prefix) = &server.config.prefix {
                    if prefix.ends_with('.') || prefix.ends_with('/') || prefix.ends_with(':') {
                        format!("{prefix}{name}")
                    } else {
                        format!("{prefix}.{name}")
                    }
                } else {
                    name.clone()
                };
                registry.insert(
                    external_name,
                    ToolRoute {
                        server_id: server.id.clone(),
                        tool_name: name,
                    },
                );
            }
        }

        let mut guard = self.inner.tool_registry.write().unwrap();
        *guard = registry;
        info!("MCP manager preloaded tool registry with {} entries", guard.len());
    }

    pub fn resolve_tool_global(&self, external: &str) -> Option<ToolRoute> {
        let registry = self.inner.tool_registry.read().unwrap();
        registry.get(external).cloned()
    }
}

pub(crate) struct McpSession {
    pub(crate) id: String,
    pub(crate) protocol_version: String,
    pub(crate) tool_index: AsyncMutex<HashMap<String, ToolRoute>>,
}

#[derive(Clone)]
pub(crate) struct ToolRoute {
    pub(crate) server_id: String,
    pub(crate) tool_name: String,
}

impl McpSession {
    pub async fn insert_tool_mapping(&self, external: String, server_id: String, tool_name: String) {
        let mut index = self.tool_index.lock().await;
        index.insert(
            external,
            ToolRoute {
                server_id,
                tool_name,
            },
        );
    }

    pub async fn resolve_tool(&self, external: &str) -> Option<ToolRoute> {
        let index = self.tool_index.lock().await;
        index.get(external).cloned()
    }
}

pub(crate) struct McpServer {
    pub(crate) id: String,
    pub(crate) config: McpServerConfig,
    pub(crate) runtime: AsyncMutex<McpServerRuntime>,
    pub(crate) stats: AsyncMutex<McpServerStats>,
}

pub(crate) struct McpServerRuntime {
    pub(crate) writer: Option<BufWriter<tokio::process::ChildStdin>>,
    pub(crate) pending: HashMap<u64, oneshot::Sender<Value>>,
    pub(crate) next_id: u64,
    pub(crate) http_client: Option<Client>,
    pub(crate) http_session_id: Option<String>,
    pub(crate) http_monitor_started: bool,
}

pub(crate) struct McpServerStats {
    pub(crate) running: bool,
    pub(crate) total_requests: u64,
    pub(crate) total_errors: u64,
    pub(crate) last_start_time: Option<SystemTime>,
    pub(crate) tools_count: u64,
    pub(crate) tools_call_count: u64,
}

impl Default for McpServerStats {
    fn default() -> Self {
        Self {
            running: false,
            total_requests: 0,
            total_errors: 0,
            last_start_time: None,
            tools_count: 0,
            tools_call_count: 0,
        }
    }
}

impl McpServer {
    pub fn new(id: String, config: McpServerConfig) -> Self {
        Self {
            id,
            config,
            runtime: AsyncMutex::new(McpServerRuntime {
                writer: None,
                pending: HashMap::new(),
                next_id: 1,
                http_client: None,
                http_session_id: None,
                http_monitor_started: false,
            }),
            stats: AsyncMutex::new(McpServerStats::default()),
        }
    }

    async fn ensure_http_session(&self, url: &str) -> Result<(), String> {
        let mut runtime = self.runtime.lock().await;
        if runtime.http_session_id.is_some() {
            return Ok(());
        }
        let client = runtime
            .http_client
            .get_or_insert_with(|| Client::builder().build().unwrap());
        let body = serde_json::json!({
            "jsonrpc": "2.0",
            "id": 1,
            "method": "initialize",
            "params": {
                "protocolVersion": SUPPORTED_PROTOCOL_VERSION,
                "capabilities": {},
                "clientInfo": {
                    "name": "myz-suite-tool-mcp-gateway",
                    "version": "0.1.0"
                }
            }
        });
        let resp = client
            .post(url)
            .header("Accept", "application/json, text/event-stream")
            .json(&body)
            .send()
            .await
            .map_err(|e| e.to_string())?;
        let headers = resp.headers().clone();
        let bytes = resp.bytes().await.map_err(|e| e.to_string())?;
        let val: Value = serde_json::from_slice(&bytes).map_err(|e| e.to_string())?;
        if val.get("error").is_some() {
            return Err(val.to_string());
        }
        let session_id = headers
            .get("Mcp-Session-Id")
            .and_then(|v| v.to_str().ok())
            .map(|s| s.to_string());
        runtime.http_session_id = session_id;
        Ok(())
    }

    async fn request_http(
        &self,
        url: &str,
        method: &str,
        params: Option<Value>,
    ) -> Result<Value, String> {
        self.ensure_http_session(url).await?;
        let mut runtime = self.runtime.lock().await;
        let client = runtime
            .http_client
            .get_or_insert_with(|| Client::builder().build().unwrap())
            .clone();
        let id = runtime.next_id;
        runtime.next_id += 1;
        let session_id = runtime.http_session_id.clone();
        drop(runtime);

        let body = match params {
            Some(p) => serde_json::json!({
                "jsonrpc": "2.0",
                "id": id,
                "method": method,
                "params": p
            }),
            None => serde_json::json!({
                "jsonrpc": "2.0",
                "id": id,
                "method": method
            }),
        };

        let mut req = client
            .post(url)
            .header("Accept", "application/json, text/event-stream")
            .json(&body);

        if let Some(sid) = session_id {
            req = req
                .header("Mcp-Session-Id", sid)
                .header("MCP-Protocol-Version", SUPPORTED_PROTOCOL_VERSION);
        }

        let resp = req.send().await.map_err(|e| e.to_string())?;
        let content_type = resp
            .headers()
            .get("content-type")
            .and_then(|v| v.to_str().ok())
            .map(|s| s.to_string())
            .unwrap_or_else(|| "".to_string());

    if content_type.starts_with("application/json") {
            let bytes = resp.bytes().await.map_err(|e| e.to_string())?;
            let val: Value = serde_json::from_slice(&bytes).map_err(|e| e.to_string())?;
            if let Some(err) = val.get("error") {
                return Err(err.to_string());
            }
            let result = val
                .get("result")
                .cloned()
                .ok_or_else(|| "missing result".to_string())?;
            Ok(result)
    } else if content_type.starts_with("text/event-stream") {
            // Collapse SSE stream into a single final JSON-RPC response.
        let text = resp.text().await.map_err(|e| e.to_string())?;
            for line in text.lines() {
                let line = line.trim();
                if line.starts_with("data:") {
                    let data = line.trim_start_matches("data:").trim();
                    if data.is_empty() {
                        continue;
                    }
                    if let Ok(msg) = serde_json::from_str::<Value>(data) {
                        if msg.get("id").and_then(|v| v.as_u64()) == Some(id) {
                            if let Some(err) = msg.get("error") {
                                return Err(err.to_string());
                            }
                            if let Some(result) = msg.get("result") {
                                return Ok(result.clone());
                            }
                        }
                    }
                }
            }
            Err("no matching response in SSE stream".to_string())
    } else {
            // 对某些未设置 Content-Type 或返回 text/plain 的服务，尝试按 JSON 解析。
            let bytes = resp.bytes().await.map_err(|e| e.to_string())?;
            if let Ok(val) = serde_json::from_slice::<Value>(&bytes) {
                if let Some(err) = val.get("error") {
                    return Err(err.to_string());
                }
                if let Some(result) = val.get("result") {
                    return Ok(result.clone());
                }
            }
            Err(format!(
                "unsupported content-type {} and invalid JSON body",
                content_type
            ))
        }
    }
    pub async fn ensure_started(self: &Arc<Self>) -> Result<(), String> {
        match &self.config.kind {
            McpServerKind::Stdio { command, args, env } => {
                {
                    let runtime = self.runtime.lock().await;
                    if runtime.writer.is_some() {
                        debug!("MCP server {} already started", self.id);
                        return Ok(());
                    }
                }
                info!(
                    "starting stdio MCP server {} with command={} args={:?}",
                    self.id, command, args
                );
                if let Err(err) = self.start_stdio(command, args, env).await {
                    error!("failed to start MCP server {}: {}", self.id, err);
                    return Err(err);
                }
            }
            McpServerKind::Http { url, .. } => {
                debug!("HTTP MCP server {} does not require local startup", self.id);
                // Start HTTP health monitor (ping loop) once.
                let mut runtime = self.runtime.lock().await;
                if !runtime.http_monitor_started {
                    runtime.http_monitor_started = true;
                    let url = url.clone();
                    let server = self.clone();
                    tauri::async_runtime::spawn(async move {
                        server.http_monitor_loop(url).await;
                    });
                }
                return Ok(());
            }
        }
        Ok(())
    }

    pub async fn shutdown(&self) {
        let mut runtime = self.runtime.lock().await;
        runtime.writer = None;
        runtime.pending.clear();
        let mut stats = self.stats.lock().await;
        stats.running = false;
        info!("MCP server {} shutdown requested", self.id);
    }

    async fn start_stdio(
        self: &Arc<Self>,
        command: &str,
        args: &[String],
        env: &HashMap<String, String>,
    ) -> Result<(), String> {
        let mut cmd = Command::new(command);
        cmd.args(args);
        for (k, v) in env {
            cmd.env(k, v);
        }
        cmd.stdin(std::process::Stdio::piped());
        cmd.stdout(std::process::Stdio::piped());
        let mut child = cmd.spawn().map_err(|e| e.to_string())?;
        let stdout = child
            .stdout
            .take()
            .ok_or_else(|| "missing stdout".to_string())?;
        let stdin = child
            .stdin
            .take()
            .ok_or_else(|| "missing stdin".to_string())?;
        {
            let mut runtime = self.runtime.lock().await;
            runtime.writer = Some(BufWriter::new(stdin));
            runtime.pending.clear();
            runtime.next_id = 1;
        }
        {
            let mut stats = self.stats.lock().await;
            stats.running = true;
            stats.last_start_time = Some(SystemTime::now());
        }
        let server_for_reader = self.clone();
        let mut reader = BufReader::new(stdout);
        tauri::async_runtime::spawn(async move {
            let mut line = String::new();
            loop {
                line.clear();
                let read = reader.read_line(&mut line).await.unwrap_or(0);
                if read == 0 {
                    break;
                }
                let trimmed = line.trim();
                if trimmed.is_empty() {
                    continue;
                }
                if let Ok(msg) = serde_json::from_str::<Value>(trimmed) {
                    if let Some(id_val) = msg.get("id").and_then(|v| v.as_u64()) {
                        let tx = {
                            let mut runtime = server_for_reader.runtime.lock().await;
                            runtime.pending.remove(&id_val)
                        };
                        if let Some(tx) = tx {
                            let _ = tx.send(msg);
                        }
                    }
                }
            }
            let mut stats = server_for_reader.stats.lock().await;
            stats.running = false;
            info!("MCP server {} stdout reader loop exited", server_for_reader.id);
        });
        let server_for_wait = self.clone();
        tauri::async_runtime::spawn(async move {
            let _ = child.wait().await;
            let mut stats = server_for_wait.stats.lock().await;
            stats.running = false;
            info!("MCP server {} process exited", server_for_wait.id);
        });
        self.perform_handshake().await?;
        Ok(())
    }

    async fn perform_handshake(&self) -> Result<(), String> {
        let params = serde_json::json!({
            "protocolVersion": SUPPORTED_PROTOCOL_VERSION,
            "capabilities": {},
            "clientInfo": {
                "name": "myz-suite-tool-mcp-gateway",
                "version": "0.1.0"
            }
        });
        info!("performing MCP handshake with server {}", self.id);
        let _ = self.request("initialize", Some(params)).await?;
        let _ = self.notify("notifications/initialized", None).await;
        info!("MCP handshake completed for server {}", self.id);
        Ok(())
    }

    async fn http_monitor_loop(self: Arc<Self>, url: String) {
        loop {
            // 简单的健康检查：调用 ping 方法，失败则标记为未运行
            // ping 请求不应包含 params 字段，因此这里传 None。
            let result = self.request_http(&url, "ping", None).await;
            let mut stats = self.stats.lock().await;
            match result {
                Ok(_) => {
                    info!("HTTP MCP server {} ping ok", self.id);
                    stats.running = true;
                }
                Err(err) => {
                    warn!("HTTP MCP server {} ping failed: {}", self.id, err);
                    stats.running = false;
                }
            }
            drop(stats);
            sleep(Duration::from_secs(30)).await;
        }
    }

    pub async fn request(&self, method: &str, params: Option<Value>) -> Result<Value, String> {
        {
            let mut stats = self.stats.lock().await;
            stats.total_requests += 1;
            if method == "tools/call" {
                stats.tools_call_count += 1;
            }
        }
        // Branch by server kind: stdio vs HTTP transport.
        match &self.config.kind {
            McpServerKind::Stdio { .. } => self.request_stdio(method, params).await,
            McpServerKind::Http { url, .. } => self.request_http(url, method, params).await,
        }
    }

    async fn request_stdio(&self, method: &str, params: Option<Value>) -> Result<Value, String> {
        let (tx, rx) = oneshot::channel();
        {
            let mut runtime = self.runtime.lock().await;
            if runtime.writer.is_none() {
                return Err("server not running".to_string());
            }
            let id = runtime.next_id;
            runtime.next_id += 1;
            runtime.pending.insert(id, tx);
            let msg = match params {
                Some(p) => serde_json::json!({
                    "jsonrpc": "2.0",
                    "id": id,
                    "method": method,
                    "params": p
                }),
                None => serde_json::json!({
                    "jsonrpc": "2.0",
                    "id": id,
                    "method": method
                }),
            };
            let text = serde_json::to_string(&msg).map_err(|e| e.to_string())?;
            if let Some(writer) = runtime.writer.as_mut() {
                writer
                    .write_all(text.as_bytes())
                    .await
                    .map_err(|e| e.to_string())?;
                writer
                    .write_all(b"\n")
                    .await
                    .map_err(|e| e.to_string())?;
                writer.flush().await.map_err(|e| e.to_string())?;
            } else {
                return Err("server not running".to_string());
            }
        }
        let msg = rx.await.map_err(|_| "channel closed".to_string())?;
        if let Some(error) = msg.get("error") {
            {
                let mut stats = self.stats.lock().await;
                stats.total_errors += 1;
            }
            return Err(error.to_string());
        }
        if let Some(result) = msg.get("result") {
            Ok(result.clone())
        } else {
            Err("missing result".to_string())
        }
    }

    pub async fn notify(&self, method: &str, params: Option<Value>) -> Result<(), String> {
        match &self.config.kind {
            McpServerKind::Stdio { .. } => self.notify_stdio(method, params).await,
            McpServerKind::Http { url, .. } => {
                // For HTTP transports, notifications are best-effort; fire and forget.
                let client = Client::new();
                let body = serde_json::json!({
                    "jsonrpc": "2.0",
                    "method": method,
                    "params": params.unwrap_or(Value::Null)
                });
                let _ = client.post(url).json(&body).send().await;
                Ok(())
            }
        }
    }

    async fn notify_stdio(&self, method: &str, params: Option<Value>) -> Result<(), String> {
        let mut runtime = self.runtime.lock().await;
        let writer = match runtime.writer.as_mut() {
            Some(w) => w,
            None => return Err("server not running".to_string()),
        };
        let msg = serde_json::json!({
            "jsonrpc": "2.0",
            "method": method,
            "params": params.unwrap_or(Value::Null)
        });
        let text = serde_json::to_string(&msg).map_err(|e| e.to_string())?;
        writer
            .write_all(text.as_bytes())
            .await
            .map_err(|e| e.to_string())?;
        writer
            .write_all(b"\n")
            .await
            .map_err(|e| e.to_string())?;
        writer.flush().await.map_err(|e| e.to_string())?;
        Ok(())
    }

    pub async fn list_tools(self: &Arc<Self>) -> Result<Vec<Value>, String> {
        self.ensure_started().await?;
        let params = serde_json::json!({});
        let result = self.request("tools/list", Some(params)).await?;
        let tools = result
            .get("tools")
            .and_then(|v| v.as_array())
            .cloned()
            .unwrap_or_else(Vec::new);
        {
            let mut stats = self.stats.lock().await;
            stats.tools_count = tools.len() as u64;
        }
        Ok(tools)
    }
}
