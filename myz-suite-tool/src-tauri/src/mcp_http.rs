use std::collections::HashMap;
use std::net::SocketAddr;
use std::sync::Arc;

use axum::body::{to_bytes, Body};
use axum::extract::State;
use axum::http::{HeaderMap, HeaderValue, Request, Response, StatusCode};
use axum::routing::post;
use axum::Router;
use log::{debug, error, info, warn};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use crate::mcp_config::{McpServerConfig, McpServerKind};
use crate::mcp_runtime::{McpManager, McpServer, McpSession, SUPPORTED_PROTOCOL_VERSION};

#[derive(Serialize)]
pub struct McpServerStatusDto {
    pub id: String,
    pub title: Option<String>,
    pub prefix: Option<String>,
    pub running: bool,
    pub total_requests: u64,
    pub total_errors: u64,
    pub tools_count: u64,
    pub tools_call_count: u64,
}

#[derive(Serialize)]
pub struct McpServerConfigDto {
    pub id: String,
    pub title: Option<String>,
    pub enabled: bool,
    pub prefix: Option<String>,
    pub kind: String,
    pub command: Option<String>,
    pub args: Vec<String>,
    pub running: bool,
    pub env: HashMap<String, String>,
    pub headers: HashMap<String, String>,
}

#[derive(Deserialize)]
pub struct McpServerUpdate {
    pub id: String,
    pub title: Option<String>,
    pub enabled: Option<bool>,
    pub prefix: Option<String>,
    pub command: Option<String>,
    pub args: Option<Vec<String>>,
    pub env: Option<HashMap<String, String>>,
    pub headers: Option<HashMap<String, String>>,
}

#[derive(Deserialize)]
pub struct McpServerNew {
    pub id: String,
    pub title: Option<String>,
    pub enabled: bool,
    pub prefix: Option<String>,
    pub kind: String,
    pub command: Option<String>,
    pub args: Option<Vec<String>>,
    pub env: Option<HashMap<String, String>>,
    pub headers: Option<HashMap<String, String>>,
}

fn save_config(inner: &Arc<crate::mcp_runtime::McpInner>) -> Result<(), String> {
    let config = inner.config.read().unwrap();
    let json = serde_json::to_vec_pretty(&*config).map_err(|e| e.to_string())?;
    if let Some(parent) = inner.config_path.parent() {
        if let Err(err) = std::fs::create_dir_all(parent) {
            warn!("failed to create MCP config directory {:?}: {}", parent, err);
        }
    }
    std::fs::write(&inner.config_path, json).map_err(|e| e.to_string())
}

pub async fn start_http_server(manager: McpManager) {
    let addr: SocketAddr = std::env::var("MYZ_MCP_HTTP_ADDR")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or_else(|| "127.0.0.1:7812".parse().unwrap());
    info!("starting MCP HTTP gateway at {}", addr);
    let app = Router::new()
        .route("/mcp", post(handle_post).get(handle_get))
        .with_state(manager);
    if let Ok(listener) = tokio::net::TcpListener::bind(addr).await {
        if let Err(err) = axum::serve(listener, app).await {
            error!("MCP HTTP gateway exited with error: {}", err);
        }
    } else {
        error!("failed to bind MCP HTTP gateway listener at {}", addr);
    }
}

async fn handle_get() -> Response<Body> {
    let status = StatusCode::OK;
    debug!("HTTP GET /mcp (SSE stub) -> status={}", status);
    Response::builder()
        .status(StatusCode::OK)
        .header(axum::http::header::CONTENT_TYPE, "text/event-stream")
        .body(Body::empty())
        .unwrap()
}

async fn handle_post(
    State(manager): State<McpManager>,
    req: Request<Body>,
) -> Result<Response<Body>, StatusCode> {
    let (parts, body) = req.into_parts();
    let headers = parts.headers;
    debug!("HTTP POST /mcp request: headers={:?}", headers);
    if !is_localhost(&headers) {
        warn!(
            "rejecting non-localhost MCP HTTP request with Host: {:?}",
            headers.get(axum::http::header::HOST)
        );
        return Ok(Response::builder()
            .status(StatusCode::FORBIDDEN)
            .body(Body::from("Forbidden"))
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?);
    }
    let bytes = to_bytes(body, 1024 * 1024)
        .await
        .map_err(|_| {
            warn!("failed to read MCP HTTP request body");
            StatusCode::BAD_REQUEST
        })?;
    let msg: Value = serde_json::from_slice(&bytes).map_err(|_| {
        warn!("failed to parse MCP HTTP request body as JSON");
        StatusCode::BAD_REQUEST
    })?;
    let method = msg.get("method").and_then(|v| v.as_str());
    let id = msg.get("id").cloned();
    let params = msg.get("params").cloned().unwrap_or(Value::Null);
    if method.is_none() {
        return Ok(empty_accepted_response());
    }
    let method = method.unwrap();
    if id.is_none() {
        return Ok(empty_accepted_response());
    }
    let id_value = id.unwrap();
    if method == "initialize" {
        let protocol_version = params
            .get("protocolVersion")
            .and_then(|v| v.as_str())
            .unwrap_or(SUPPORTED_PROTOCOL_VERSION);
        if protocol_version != SUPPORTED_PROTOCOL_VERSION {
            warn!(
                "unsupported MCP protocol version from client: {}, expected {}",
                protocol_version, SUPPORTED_PROTOCOL_VERSION
            );
            let body = json!({
                "jsonrpc": "2.0",
                "id": id_value,
                "error": {
                    "code": -32602,
                    "message": "Unsupported protocol version"
                }
            });
            let status = StatusCode::OK;
            debug!(
                "HTTP POST /mcp initialize response: status={} error=Unsupported protocol version",
                status
            );
            return Ok(json_response(body, None, status));
        }
        let session = manager.create_session(protocol_version.to_string());
        let result = json!({
            "protocolVersion": SUPPORTED_PROTOCOL_VERSION,
            "capabilities": {
                "tools": {
                    "listChanged": false
                }
            },
            "serverInfo": {
                "name": "myz-suite-tool-mcp-gateway",
                "version": "0.1.0"
            }
        });
        let body = json!({
            "jsonrpc": "2.0",
            "id": id_value,
            "result": result
        });
        let mut extra_headers = HeaderMap::new();
        extra_headers.insert(
            "Mcp-Session-Id",
            HeaderValue::from_str(&session.id).unwrap(),
        );
        extra_headers.insert(
            "MCP-Protocol-Version",
            HeaderValue::from_static(SUPPORTED_PROTOCOL_VERSION),
        );
        let status = StatusCode::OK;
        debug!(
            "HTTP POST /mcp initialize response: status={} session_id={}",
            status, session.id
        );
        return Ok(json_response(body, Some(extra_headers), status));
    }
    let session_id = headers
        .get("Mcp-Session-Id")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");
    if session_id.is_empty() {
        warn!("missing Mcp-Session-Id on non-initialize MCP request");
        return Err(StatusCode::BAD_REQUEST);
    }
    let session = manager
        .get_session(session_id)
        .ok_or(StatusCode::NOT_FOUND)?;
    let header_version = headers
        .get("MCP-Protocol-Version")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");
    if header_version != session.protocol_version {
        return Err(StatusCode::BAD_REQUEST);
    }
    if method == "tools/list" {
        let response = handle_tools_list(&manager, session, id_value, params).await?;
        debug!(
            "HTTP POST /mcp tools/list response: status={}",
            response.status()
        );
        return Ok(response);
    }
    if method == "tools/call" {
        let response = handle_tools_call(&manager, session, id_value, params).await?;
        debug!(
            "HTTP POST /mcp tools/call response: status={}",
            response.status()
        );
        return Ok(response);
    }
    let body = json!({
        "jsonrpc": "2.0",
        "id": id_value,
        "error": {
            "code": -32601,
            "message": "Method not implemented"
        }
    });
    let status = StatusCode::OK;
    debug!(
        "HTTP POST /mcp unknown method '{}' response: status={}",
        method, status
    );
    Ok(json_response(body, None, status))
}

fn is_localhost(headers: &HeaderMap) -> bool {
    if let Some(host) = headers.get(axum::http::header::HOST) {
        if let Ok(host_str) = host.to_str() {
            return host_str.starts_with("127.0.0.1:") || host_str.starts_with("localhost:");
        }
    }
    true
}

fn empty_accepted_response() -> Response<Body> {
    let status = StatusCode::ACCEPTED;
    debug!(
        "HTTP POST /mcp response: status={} (empty 202 Accepted)",
        status
    );
    Response::builder()
        .status(status)
        .body(Body::empty())
        .unwrap()
}

fn json_response(body: Value, extra_headers: Option<HeaderMap>, status: StatusCode) -> Response<Body> {
    let bytes = serde_json::to_vec(&body).unwrap();
    let mut builder = Response::builder()
        .status(status)
        .header(axum::http::header::CONTENT_TYPE, "application/json");
    if let Some(extra) = extra_headers {
        for (name, value) in extra {
            if let Some(name) = name {
                builder = builder.header(name, value);
            }
        }
    }
    builder.body(Body::from(bytes)).unwrap()
}

async fn handle_tools_list(
    manager: &McpManager,
    session: Arc<McpSession>,
    id: Value,
    _params: Value,
) -> Result<Response<Body>, StatusCode> {
    let mut tools_out = Vec::new();
    for server in manager.servers() {
        let tools = match server.list_tools().await {
            Ok(t) => t,
            Err(err) => {
                error!(
                    "failed to list tools from MCP server {}: {}",
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
            let mut tool_value = tool.clone();
            if let Some(obj) = tool_value.as_object_mut() {
                obj.insert("name".to_string(), Value::String(external_name.clone()));
                let annotations = obj
                    .entry("annotations".to_string())
                    .or_insert_with(|| Value::Object(serde_json::Map::new()));
                if let Value::Object(map) = annotations {
                    let mut gateway = serde_json::Map::new();
                    gateway.insert("serverId".to_string(), Value::String(server.id.clone()));
                    gateway.insert("originalTool".to_string(), Value::String(name.clone()));
                    map.insert("myz.mcpGateway".to_string(), Value::Object(gateway));
                }
            }
            session
                .insert_tool_mapping(external_name.clone(), server.id.clone(), name.clone())
                .await;
            tools_out.push(tool_value);
        }
    }
    let result = Value::Object({
        let mut map = serde_json::Map::new();
        map.insert("tools".to_string(), Value::Array(tools_out.clone()));
        map
    });
    let body = json!({
        "jsonrpc": "2.0",
        "id": id,
        "result": result
    });
    let status = StatusCode::OK;
    debug!(
        "HTTP POST /mcp tools/list response body built: status={} tools_count={}",
        status,
        tools_out.len()
    );
    Ok(json_response(body, None, status))
}

async fn handle_tools_call(
    manager: &McpManager,
    session: Arc<McpSession>,
    id: Value,
    params: Value,
) -> Result<Response<Body>, StatusCode> {
    let external_name = params
        .get("name")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    if external_name.is_empty() {
        let body = json!({
            "jsonrpc": "2.0",
            "id": id,
            "error": {
                "code": -32602,
                "message": "Missing tool name"
            }
        });
        let status = StatusCode::OK;
        debug!(
            "HTTP POST /mcp tools/call response: status={} error=Missing tool name",
            status
        );
        return Ok(json_response(body, None, status));
    }
    // 优先使用当前 session 中的映射，找不到时回退到全局 registry。
    let route = match session.resolve_tool(&external_name).await {
        Some(r) => r,
        None => match manager.resolve_tool_global(&external_name) {
            Some(r) => {
                // 将全局映射回填到当前 session，避免后续重复查找。
                session
                    .insert_tool_mapping(
                        external_name.clone(),
                        r.server_id.clone(),
                        r.tool_name.clone(),
                    )
                    .await;
                r
            }
            None => {
                let body = json!({
                    "jsonrpc": "2.0",
                    "id": id,
                    "error": {
                        "code": -32602,
                        "message": "Unknown tool"
                    }
                });
                let status = StatusCode::OK;
                debug!(
                    "HTTP POST /mcp tools/call response: status={} error=Unknown tool",
                    status
                );
                return Ok(json_response(body, None, status));
            }
        },
    };
    let server = manager
        .inner
        .servers
        .read()
        .unwrap()
        .get(&route.server_id)
        .cloned()
        .ok_or(StatusCode::NOT_FOUND)?;
    let mut new_params = params.clone();
    if let Some(obj) = new_params.as_object_mut() {
        obj.insert("name".to_string(), Value::String(route.tool_name.clone()));
    }
    let result = server
        .request("tools/call", Some(new_params))
        .await
        .map_err(|err| {
            error!(
                "tools/call to downstream server {} failed: {}",
                route.server_id, err
            );
            StatusCode::BAD_GATEWAY
        })?;
    let body = json!({
        "jsonrpc": "2.0",
        "id": id,
        "result": result
    });
    let status = StatusCode::OK;
    debug!(
        "HTTP POST /mcp tools/call response body built: status={} server_id={} tool_name={}",
        status, route.server_id, route.tool_name
    );
    Ok(json_response(body, None, status))
}

#[tauri::command]
pub async fn mcp_list_servers(
    manager: tauri::State<'_, McpManager>,
) -> Result<Vec<McpServerStatusDto>, String> {
    let mut out = Vec::new();
    for server in manager.servers() {
        let stats = server.stats.lock().await;
        out.push(McpServerStatusDto {
            id: server.id.clone(),
            title: server.config.title.clone(),
            prefix: server.config.prefix.clone(),
            running: stats.running,
            total_requests: stats.total_requests,
            total_errors: stats.total_errors,
            tools_count: stats.tools_count,
            tools_call_count: stats.tools_call_count,
        });
    }
    Ok(out)
}

#[tauri::command]
pub async fn mcp_get_config(
    manager: tauri::State<'_, McpManager>,
) -> Result<Vec<McpServerConfigDto>, String> {
    let mut out = Vec::new();

    let runtime_servers = manager.inner.servers.read().unwrap().clone();
    let configs = {
        let cfg_guard = manager.inner.config.read().unwrap();
        cfg_guard.servers.clone()
    };

    for (id, cfg) in configs.into_iter() {
        let (kind, command, args, env, headers) = match &cfg.kind {
            McpServerKind::Stdio { command, args, env } => (
                "stdio".to_string(),
                Some(command.clone()),
                args.clone(),
                env.clone(),
                HashMap::new(),
            ),
            McpServerKind::Http { url, headers } => (
                "http".to_string(),
                Some(url.clone()),
                Vec::new(),
                HashMap::new(),
                headers.clone(),
            ),
        };

        let running = if let Some(server) = runtime_servers.get(&id) {
            let stats = server.stats.lock().await;
            stats.running
        } else {
            false
        };

        out.push(McpServerConfigDto {
            id: id.clone(),
            title: cfg.title.clone(),
            enabled: cfg.enabled,
            prefix: cfg.prefix.clone(),
            kind,
            command,
            args,
            running,
            env,
            headers,
        });
    }

    Ok(out)
}

#[tauri::command]
pub async fn mcp_update_server(
    manager: tauri::State<'_, McpManager>,
    update: McpServerUpdate,
) -> Result<McpServerConfigDto, String> {
    {
        let mut cfg_guard = manager.inner.config.write().unwrap();
        let cfg = cfg_guard
            .servers
            .get_mut(&update.id)
            .ok_or_else(|| "MCP server not found".to_string())?;

        if let Some(title) = update.title {
            cfg.title = Some(title);
        }
        if let Some(enabled) = update.enabled {
            cfg.enabled = enabled;
        }
        if let Some(prefix) = update.prefix {
            cfg.prefix = if prefix.is_empty() { None } else { Some(prefix) };
        }

        match (
            &mut cfg.kind,
            update.command,
            update.args,
            update.env,
            update.headers,
        ) {
            (
                McpServerKind::Stdio { command, args, env },
                Some(cmd),
                maybe_args,
                maybe_env,
                _,
            ) => {
                *command = cmd;
                if let Some(a) = maybe_args {
                    *args = a;
                }
                if let Some(e) = maybe_env {
                    *env = e;
                }
            }
            (
                McpServerKind::Stdio { args, env, .. },
                None,
                maybe_args,
                maybe_env,
                _,
            ) => {
                if let Some(a) = maybe_args {
                    *args = a;
                }
                if let Some(e) = maybe_env {
                    *env = e;
                }
            }
            (
                McpServerKind::Http { url, headers },
                maybe_url,
                _,
                _,
                maybe_headers,
            ) => {
                if let Some(new_url) = maybe_url {
                    *url = new_url;
                }
                if let Some(h) = maybe_headers {
                    *headers = h;
                }
            }
            _ => {}
        }
    }

    save_config(&manager.inner)?;

    let cfg_now = {
        let cfg_guard = manager.inner.config.read().unwrap();
        cfg_guard
            .servers
            .get(&update.id)
            .cloned()
            .ok_or_else(|| "MCP server not found after update".to_string())?
    };

    let existing_server = {
        let servers = manager.inner.servers.read().unwrap();
        servers.get(&update.id).cloned()
    };

    if let Some(server) = existing_server {
        if !cfg_now.enabled {
            server.shutdown().await;
            let mut servers = manager.inner.servers.write().unwrap();
            servers.remove(&update.id);
        } else {
            server.shutdown().await;
            let _ = server.ensure_started().await;
        }
    } else if cfg_now.enabled {
        let server = Arc::new(McpServer::new(update.id.clone(), cfg_now.clone()));
        {
            let mut servers = manager.inner.servers.write().unwrap();
            servers.insert(update.id.clone(), server.clone());
        }
        let _ = server.ensure_started().await;
    }

    let runtime_servers = manager.inner.servers.read().unwrap().clone();
    let running = if let Some(server) = runtime_servers.get(&update.id) {
        let stats = server.stats.lock().await;
        stats.running
    } else {
        false
    };

    let cfg_guard = manager.inner.config.read().unwrap();
    let cfg = cfg_guard
        .servers
        .get(&update.id)
        .ok_or_else(|| "MCP server not found when building DTO".to_string())?;

    let (kind, command, args, env, headers) = match &cfg.kind {
        McpServerKind::Stdio { command, args, env } => (
            "stdio".to_string(),
            Some(command.clone()),
            args.clone(),
            env.clone(),
            HashMap::new(),
        ),
        McpServerKind::Http { url, headers } => (
            "http".to_string(),
            Some(url.clone()),
            Vec::new(),
            HashMap::new(),
            headers.clone(),
        ),
    };

    Ok(McpServerConfigDto {
        id: update.id.clone(),
        title: cfg.title.clone(),
        enabled: cfg.enabled,
        prefix: cfg.prefix.clone(),
        kind,
        command,
        args,
        running,
        env,
        headers,
    })
}

#[tauri::command]
pub async fn mcp_add_server(
    manager: tauri::State<'_, McpManager>,
    new: McpServerNew,
) -> Result<McpServerConfigDto, String> {
    if new.id.trim().is_empty() {
        return Err("MCP server id must not be empty".to_string());
    }

    let kind = new.kind.to_lowercase();
    let cfg = match kind.as_str() {
        "stdio" => {
            let command = new
                .command
                .ok_or_else(|| "command is required for stdio MCP server".to_string())?;
            let args = new.args.unwrap_or_default();
            let env = new.env.unwrap_or_default();
            McpServerConfig {
                title: new.title.clone(),
                enabled: new.enabled,
                prefix: new.prefix.clone(),
                aliases: HashMap::new(),
                kind: McpServerKind::Stdio { command, args, env },
            }
        }
        "http" => {
            let url = new
                .command
                .ok_or_else(|| "url is required for http MCP server".to_string())?;
            let headers = new.headers.unwrap_or_default();
            McpServerConfig {
                title: new.title.clone(),
                enabled: new.enabled,
                prefix: new.prefix.clone(),
                aliases: HashMap::new(),
                kind: McpServerKind::Http {
                    url,
                    headers,
                },
            }
        }
        _ => {
            return Err("unsupported MCP server kind; use 'stdio' or 'http'".to_string());
        }
    };

    {
        let mut cfg_guard = manager.inner.config.write().unwrap();
        if cfg_guard.servers.contains_key(&new.id) {
            return Err("MCP server id already exists".to_string());
        }
        cfg_guard.servers.insert(new.id.clone(), cfg.clone());
    }

    save_config(&manager.inner)?;

    let mut running = false;
    let maybe_server = if cfg.enabled {
        let server = Arc::new(McpServer::new(new.id.clone(), cfg.clone()));
        {
            let mut servers = manager.inner.servers.write().unwrap();
            servers.insert(new.id.clone(), server.clone());
        }
        Some(server)
    } else {
        None
    };

    if let Some(server) = maybe_server {
        let _ = server.ensure_started().await;
        let stats = server.stats.lock().await;
        running = stats.running;
    }

    let (kind_str, command, args, env, headers) = match &cfg.kind {
        McpServerKind::Stdio { command, args, env } => (
            "stdio".to_string(),
            Some(command.clone()),
            args.clone(),
            env.clone(),
            HashMap::new(),
        ),
        McpServerKind::Http { url, headers } => (
            "http".to_string(),
            Some(url.clone()),
            Vec::new(),
            HashMap::new(),
            headers.clone(),
        ),
    };

    Ok(McpServerConfigDto {
        id: new.id.clone(),
        title: cfg.title.clone(),
        enabled: cfg.enabled,
        prefix: cfg.prefix.clone(),
        kind: kind_str,
        command,
        args,
        running,
        env,
        headers,
    })
}
