use chrono::{SecondsFormat, Utc};
use glob::{glob_with, MatchOptions};
use hmac::{Hmac, Mac};
use reqwest::blocking::Client;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::fs;
use std::path::{Component, Path, PathBuf};
use std::time::Duration;
use tauri::{AppHandle, Manager};
type HmacSha256 = Hmac<sha2::Sha256>;

type DesktopSettings = Value;

#[derive(Debug, Clone, Serialize, Deserialize)]
struct SyncS3Config {
    endpoint: String,
    region: String,
    bucket: String,
    #[serde(rename = "accessKeyId")]
    access_key_id: String,
    #[serde(rename = "secretAccessKey")]
    secret_access_key: String,
    #[serde(rename = "sessionToken")]
    session_token: Option<String>,
    prefix: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct SyncConfig {
    enabled: bool,
    provider: String,
    s3: SyncS3Config,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct SyncStatus {
    enabled: bool,
    state: String,
    #[serde(rename = "lastSyncAt")]
    last_sync_at: Option<String>,
    #[serde(rename = "pendingRecords")]
    pending_records: Option<usize>,
    #[serde(rename = "lastError")]
    last_error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct SyncRunResult {
    ok: bool,
    state: String,
    #[serde(rename = "syncedRecords")]
    synced_records: Option<usize>,
    #[serde(rename = "skippedRecords")]
    skipped_records: Option<usize>,
    #[serde(rename = "finishedAt")]
    finished_at: Option<String>,
    message: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct RecordExportResult {
    markdown: String,
    json: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct RecordImportInput {
    records: Vec<Value>,
    strategy: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct RecordImportResult {
    inserted: usize,
    replaced: usize,
    skipped: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct DesktopChatConversation {
    info: Value,
    messages: Vec<Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct DesktopChatState {
    #[serde(rename = "activeConversationId")]
    active_conversation_id: Option<String>,
    conversations: Vec<DesktopChatConversation>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct DesktopWorkspaceContext {
    #[serde(rename = "workspaceRoot")]
    workspace_root: String,
    #[serde(rename = "agentsFile")]
    agents_file: String,
    #[serde(rename = "scopeLabel")]
    scope_label: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
struct DesktopWorkspaceEntry {
    path: String,
    kind: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct DesktopWorkspaceListResult {
    #[serde(rename = "basePath")]
    base_path: String,
    entries: Vec<DesktopWorkspaceEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct DesktopWorkspaceReadResult {
    path: String,
    content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct DesktopWorkspaceWriteInput {
    path: String,
    content: String,
    mode: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct DesktopWorkspaceWriteResult {
    path: String,
    mode: String,
    #[serde(rename = "bytesWritten")]
    bytes_written: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct DesktopWorkspaceEditInput {
    path: String,
    find: String,
    replace: String,
    #[serde(rename = "replaceAll")]
    replace_all: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct DesktopWorkspaceEditResult {
    path: String,
    replacements: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct DesktopWorkspaceGlobInput {
    pattern: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct DesktopWorkspaceGlobResult {
    pattern: String,
    matches: Vec<String>,
}

const DEFAULT_WORKSPACE_AGENTS_MD: &str = r#"# MyZ Desktop Workspace

This workspace is the default local context for @myz-suite/desktop.

## Rules
- All agent file operations must stay inside this workspace root.
- Use this directory for notes, generated files, scripts, and task artifacts.
- Do not assume access to paths outside this workspace unless the user explicitly moves or copies content here first.
"#;

fn ensure_dir(path: &Path) -> Result<(), String> {
    fs::create_dir_all(path).map_err(|error| error.to_string())
}

fn desktop_data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?
        .join("dashboard");
    ensure_dir(&dir)?;
    Ok(dir)
}

fn desktop_workspace_root(app: &AppHandle) -> Result<PathBuf, String> {
    let home_dir = app.path().home_dir().map_err(|error| error.to_string())?;
    let workspace_root = home_dir.join(".myz-desktop").join("workspace");
    ensure_dir(&workspace_root)?;
    ensure_workspace_agents_file(&workspace_root)?;
    Ok(workspace_root)
}

fn workspace_agents_file_path(workspace_root: &Path) -> PathBuf {
    workspace_root.join("AGENTS.md")
}

fn ensure_workspace_agents_file(workspace_root: &Path) -> Result<(), String> {
    let agents_file = workspace_agents_file_path(workspace_root);
    if !agents_file.exists() {
        fs::write(&agents_file, DEFAULT_WORKSPACE_AGENTS_MD).map_err(|error| error.to_string())?;
    }
    Ok(())
}

fn normalize_workspace_relative_path(raw_path: &str) -> Result<String, String> {
    let trimmed = raw_path.trim();
    if trimmed.is_empty() || trimmed == "." {
        return Ok(".".to_string());
    }
    let path = Path::new(trimmed);
    if path.is_absolute() {
        return Err("只允许使用 workspace 内的相对路径".to_string());
    }

    let mut segments: Vec<String> = Vec::new();
    for component in path.components() {
        match component {
            Component::CurDir => {}
            Component::Normal(value) => {
                let segment = value.to_string_lossy().trim().to_string();
                if segment.is_empty() {
                    continue;
                }
                segments.push(segment);
            }
            Component::ParentDir => return Err("不允许访问 workspace 根目录之外的路径".to_string()),
            Component::RootDir | Component::Prefix(_) => {
                return Err("只允许使用 workspace 内的相对路径".to_string())
            }
        }
    }

    if segments.is_empty() {
        Ok(".".to_string())
    } else {
        Ok(segments.join("/"))
    }
}

fn workspace_relative_path_for_display(
    workspace_root: &Path,
    path: &Path,
) -> Result<String, String> {
    let relative = path
        .strip_prefix(workspace_root)
        .map_err(|_| "目标路径超出 workspace 范围".to_string())?;
    let raw = relative.to_string_lossy().replace('\\', "/");
    if raw.is_empty() {
        Ok(".".to_string())
    } else {
        Ok(raw)
    }
}

fn resolve_workspace_path(
    workspace_root: &Path,
    raw_path: &str,
) -> Result<(String, PathBuf), String> {
    let normalized = normalize_workspace_relative_path(raw_path)?;
    let target_path = if normalized == "." {
        workspace_root.to_path_buf()
    } else {
        workspace_root.join(&normalized)
    };
    Ok((normalized, target_path))
}

fn collect_workspace_entries(
    workspace_root: &Path,
    current_path: &Path,
    remaining_depth: usize,
    entries: &mut Vec<DesktopWorkspaceEntry>,
) -> Result<(), String> {
    let mut dir_entries = fs::read_dir(current_path)
        .map_err(|error| format!("读取目录失败：{}", error))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("读取目录失败：{}", error))?;

    dir_entries.sort_by_key(|entry| entry.path());

    for entry in dir_entries {
        let path = entry.path();
        let file_type = entry
            .file_type()
            .map_err(|error| format!("读取目录项类型失败：{}", error))?;
        let kind = if file_type.is_dir() {
            "directory"
        } else if file_type.is_file() {
            "file"
        } else {
            "other"
        };
        entries.push(DesktopWorkspaceEntry {
            path: workspace_relative_path_for_display(workspace_root, &path)?,
            kind: kind.to_string(),
        });

        if file_type.is_dir() && remaining_depth > 0 {
            collect_workspace_entries(workspace_root, &path, remaining_depth - 1, entries)?;
        }
    }

    Ok(())
}

fn list_workspace_entries(
    workspace_root: &Path,
    raw_path: Option<&str>,
    depth: usize,
) -> Result<DesktopWorkspaceListResult, String> {
    let (base_path, target_path) = resolve_workspace_path(workspace_root, raw_path.unwrap_or("."))?;
    if !target_path.exists() {
        return Err(format!("路径不存在：{}", base_path));
    }
    if !target_path.is_dir() {
        return Err(format!("目标不是目录：{}", base_path));
    }
    let mut entries = Vec::new();
    collect_workspace_entries(workspace_root, &target_path, depth, &mut entries)?;
    Ok(DesktopWorkspaceListResult { base_path, entries })
}

fn read_workspace_file(
    workspace_root: &Path,
    raw_path: &str,
) -> Result<DesktopWorkspaceReadResult, String> {
    let (path, target_path) = resolve_workspace_path(workspace_root, raw_path)?;
    if !target_path.exists() {
        return Err(format!("文件不存在：{}", path));
    }
    if !target_path.is_file() {
        return Err(format!("目标不是文件：{}", path));
    }
    let content =
        fs::read_to_string(&target_path).map_err(|error| format!("读取文件失败：{}", error))?;
    Ok(DesktopWorkspaceReadResult { path, content })
}

fn write_workspace_file(
    workspace_root: &Path,
    input: DesktopWorkspaceWriteInput,
) -> Result<DesktopWorkspaceWriteResult, String> {
    let (path, target_path) = resolve_workspace_path(workspace_root, &input.path)?;
    if path == "." {
        return Err("不能直接写入 workspace 根目录".to_string());
    }
    let mode = input.mode.unwrap_or_else(|| "overwrite".to_string());
    if let Some(parent) = target_path.parent() {
        ensure_dir(parent)?;
    }
    let bytes_written = match mode.as_str() {
        "append" => {
            let existing = if target_path.exists() {
                fs::read_to_string(&target_path)
                    .map_err(|error| format!("读取文件失败：{}", error))?
            } else {
                String::new()
            };
            let next = format!("{}{}", existing, input.content);
            fs::write(&target_path, next.as_bytes())
                .map_err(|error| format!("写入文件失败：{}", error))?;
            next.len()
        }
        "create" => {
            if target_path.exists() {
                return Err(format!("文件已存在：{}", path));
            }
            fs::write(&target_path, input.content.as_bytes())
                .map_err(|error| format!("写入文件失败：{}", error))?;
            input.content.len()
        }
        _ => {
            fs::write(&target_path, input.content.as_bytes())
                .map_err(|error| format!("写入文件失败：{}", error))?;
            input.content.len()
        }
    };

    Ok(DesktopWorkspaceWriteResult {
        path,
        mode,
        bytes_written,
    })
}

fn edit_workspace_file(
    workspace_root: &Path,
    input: DesktopWorkspaceEditInput,
) -> Result<DesktopWorkspaceEditResult, String> {
    if input.find.is_empty() {
        return Err("编辑操作必须提供 find 内容".to_string());
    }
    let (path, target_path) = resolve_workspace_path(workspace_root, &input.path)?;
    if !target_path.exists() {
        return Err(format!("文件不存在：{}", path));
    }
    if !target_path.is_file() {
        return Err(format!("目标不是文件：{}", path));
    }
    let current =
        fs::read_to_string(&target_path).map_err(|error| format!("读取文件失败：{}", error))?;
    let replacements = current.matches(&input.find).count();
    if replacements == 0 {
        return Err(format!("未找到可替换内容：{}", input.find));
    }
    let next = if input.replace_all.unwrap_or(false) {
        current.replace(&input.find, &input.replace)
    } else {
        current.replacen(&input.find, &input.replace, 1)
    };
    let applied = if input.replace_all.unwrap_or(false) {
        replacements
    } else {
        1
    };
    fs::write(&target_path, next.as_bytes()).map_err(|error| format!("写入文件失败：{}", error))?;
    Ok(DesktopWorkspaceEditResult {
        path,
        replacements: applied,
    })
}

fn glob_workspace_paths(
    workspace_root: &Path,
    input: DesktopWorkspaceGlobInput,
) -> Result<DesktopWorkspaceGlobResult, String> {
    let normalized_pattern = normalize_workspace_relative_path(&input.pattern)?;
    let pattern_path = if normalized_pattern == "." {
        workspace_root.join("*")
    } else {
        workspace_root.join(&normalized_pattern)
    };
    let pattern = pattern_path.to_string_lossy().to_string();
    let options = MatchOptions {
        case_sensitive: true,
        require_literal_separator: false,
        require_literal_leading_dot: false,
    };
    let mut matches = Vec::new();
    for entry in
        glob_with(&pattern, options).map_err(|error| format!("Glob 模式无效：{}", error.msg))?
    {
        let path = entry.map_err(|error| format!("Glob 扫描失败：{}", error))?;
        matches.push(workspace_relative_path_for_display(workspace_root, &path)?);
    }
    matches.sort();
    matches.dedup();
    Ok(DesktopWorkspaceGlobResult {
        pattern: normalized_pattern,
        matches,
    })
}

fn read_json_file<T>(path: &Path, default: &T) -> Result<T, String>
where
    T: Serialize + for<'de> Deserialize<'de> + Clone,
{
    if !path.exists() {
        write_json_file(path, default)?;
        return Ok(default.clone());
    }
    let raw = fs::read_to_string(path).map_err(|error| error.to_string())?;
    serde_json::from_str(&raw).map_err(|error| error.to_string())
}

fn write_json_file<T>(path: &Path, value: &T) -> Result<(), String>
where
    T: Serialize,
{
    if let Some(parent) = path.parent() {
        ensure_dir(parent)?;
    }
    let serialized = serde_json::to_string_pretty(value).map_err(|error| error.to_string())?;
    fs::write(path, serialized).map_err(|error| error.to_string())
}

fn records_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(desktop_data_dir(app)?.join("records.json"))
}

fn settings_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(desktop_data_dir(app)?.join("settings.json"))
}

fn theme_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(desktop_data_dir(app)?.join("theme.json"))
}

fn sync_config_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(desktop_data_dir(app)?.join("sync.json"))
}

fn sync_status_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(desktop_data_dir(app)?.join("sync-status.json"))
}

fn chat_state_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(desktop_data_dir(app)?.join("chat-state.json"))
}

fn default_records() -> Vec<Value> {
    vec![
        json!({
            "schemaVersion": "1.0.0",
            "id": "desktop-welcome-record",
            "kind": "ai-generated",
            "text": "MyZ Desktop will use local files as the source of truth and expose sync through a desktop adapter.",
            "contentType": "text/markdown",
            "tags": ["desktop", "sync", "migration"],
            "createdAt": "2026-04-29T00:00:00.000Z",
            "updatedAt": "2026-04-29T00:00:00.000Z",
            "title": "Welcome to @myz-suite/desktop",
            "hostname": "local.desktop",
            "url": "myz://desktop/welcome",
            "sourceUrl": "myz://desktop/welcome",
            "note": "This starter record is stored in a local JSON file managed by the Tauri host."
        }),
        json!({
            "schemaVersion": "1.0.0",
            "id": "desktop-storage-record",
            "kind": "bookmark",
            "text": "Shared dashboard modules should talk to repository interfaces instead of browser-specific background storage.",
            "contentType": "text/plain",
            "tags": ["architecture", "repository"],
            "createdAt": "2026-04-29T00:05:00.000Z",
            "updatedAt": "2026-04-29T00:05:00.000Z",
            "title": "Repository-first desktop host",
            "hostname": "local.desktop",
            "url": "myz://desktop/repository-first",
            "sourceUrl": "myz://desktop/repository-first"
        }),
    ]
}

fn default_settings() -> DesktopSettings {
    json!({
        "dashboardView": "cards",
        "colorPalette": [
            "#b58900",
            "#ef476f",
            "#9f7aea",
            "#38bdf8",
            "#34d399"
        ],
        "lastUsedColor": "#b58900",
        "lastUsedStyle": "paint",
        "aiAssistantEnabled": false,
        "aiProviders": [],
        "aiAgents": {
            "conversation": {
                "target": null,
                "temperature": 0.7,
                "compressImages": false,
                "multimodalTarget": null,
                "superpowerMode": false,
                "contextCompressionThreshold": 80
            },
            "insights": {
                "target": null,
                "temperature": 0.7
            },
            "autoHighlight": {
                "target": null,
                "temperature": 0.4,
                "maxHighlights": 15,
                "categoryStyles": {
                    "conceptual": {
                        "style": "paint",
                        "color": "#b58900"
                    },
                    "structural": {
                        "style": "underline",
                        "color": "#38bdf8"
                    },
                    "behavioural": {
                        "style": "wavy",
                        "color": "#ef476f"
                    }
                }
            }
        },
        "aiMcpServers": [],
        "aiLocalTools": {
            "enabledToolNames": [
                "SelectTools",
                "PromptingAgent",
                "WebSearch",
                "WebFetch",
                "CodeExecution",
                "List",
                "Read",
                "Write",
                "Edit",
                "Glob",
                "Task",
                "ListTabs",
                "GotoPage",
                "NewTab",
                "ActivateTab",
                "RunDomActions",
                "GetPageContext",
                "EvalInPage"
            ],
            "mode": "manual",
            "autoSelectorTarget": null
        },
        "aiSkills": {
            "mode": "manual",
            "autoSelectorTarget": null
        },
        "vectorSearch": {
            "enabled": false,
            "target": null,
            "lastTest": null,
            "matchThreshold": 0.5
        },
        "desktopAgent": {
            "personaName": "MyZ Desktop Agent",
            "rolePrompt": "你是一个本地优先的桌面 Agent。回答时优先给出可执行、可验证的下一步，并明确区分你已经完成的内容与需要用户手动执行的内容。"
        },
        "socialImport": {
            "twitter": {
                "profileUrl": ""
            },
            "mastodon": {
                "profileUrl": ""
            }
        }
    })
}

fn default_sync_config() -> SyncConfig {
    SyncConfig {
        enabled: false,
        provider: "s3".to_string(),
        s3: SyncS3Config {
            endpoint: String::new(),
            region: String::new(),
            bucket: String::new(),
            access_key_id: String::new(),
            secret_access_key: String::new(),
            session_token: None,
            prefix: Some("myz-desktop".to_string()),
        },
    }
}

fn default_sync_status() -> SyncStatus {
    SyncStatus {
        enabled: false,
        state: "idle".to_string(),
        last_sync_at: None,
        pending_records: Some(0),
        last_error: None,
    }
}

fn default_chat_state() -> DesktopChatState {
    DesktopChatState {
        active_conversation_id: None,
        conversations: vec![],
    }
}

fn now_iso_string() -> String {
    Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true)
}

fn count_pending_sync_records(app: &AppHandle, enabled: bool) -> Result<usize, String> {
    if !enabled {
        return Ok(0);
    }
    Ok(read_records(app)?.len())
}

fn normalize_sync_status(app: &AppHandle, mut status: SyncStatus) -> Result<SyncStatus, String> {
    let config = desktop_get_sync_config(app.clone())?;
    status.enabled = config.enabled;
    status.pending_records = Some(count_pending_sync_records(app, config.enabled)?);
    if !config.enabled {
        status.state = "idle".to_string();
        status.last_error = None;
    }
    Ok(status)
}

fn merge_sync_status_patch(app: &AppHandle, patch: SyncStatus) -> Result<SyncStatus, String> {
    let normalized = normalize_sync_status(app, patch)?;
    let path = sync_status_path(app)?;
    write_json_file(&path, &normalized)?;
    Ok(normalized)
}

fn validate_sync_config(config: &SyncConfig) -> Result<(), String> {
    if !config.enabled {
        return Err("请先启用同步".to_string());
    }
    if config.provider.trim() != "s3" {
        return Err("桌面端当前仅支持 S3 同步配置".to_string());
    }
    if config.s3.endpoint.trim().is_empty() {
        return Err("S3 Endpoint 不能为空".to_string());
    }
    if config.s3.bucket.trim().is_empty() {
        return Err("Bucket 不能为空".to_string());
    }
    if config.s3.access_key_id.trim().is_empty() {
        return Err("Access Key ID 不能为空".to_string());
    }
    if config.s3.secret_access_key.trim().is_empty() {
        return Err("Secret Access Key 不能为空".to_string());
    }
    Ok(())
}

fn encode_uri_component(value: &str) -> String {
    value
        .bytes()
        .flat_map(|byte| match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                vec![byte as char]
            }
            _ => format!("%{:02X}", byte).chars().collect(),
        })
        .collect()
}

fn encode_s3_path(path: &str) -> String {
    path.split('/')
        .map(encode_uri_component)
        .collect::<Vec<_>>()
        .join("/")
}

fn build_s3_key(prefix: Option<&str>, path: &str) -> String {
    let clean_prefix = prefix.unwrap_or("").trim().trim_matches('/').to_string();
    let clean_path = path.trim_start_matches('/').to_string();
    if clean_prefix.is_empty() {
        return clean_path;
    }
    if clean_path.is_empty() {
        return clean_prefix;
    }
    if clean_path == clean_prefix || clean_path.starts_with(&format!("{clean_prefix}/")) {
        return clean_path;
    }
    format!("{clean_prefix}/{clean_path}")
}

fn build_s3_object_url(config: &SyncS3Config, key: &str) -> String {
    let endpoint = config.endpoint.trim_end_matches('/');
    format!(
        "{}/{}/{}",
        endpoint,
        config.bucket.trim(),
        encode_s3_path(key)
    )
}

fn sha256_hex(bytes: &[u8]) -> String {
    use sha2::Digest;

    let mut hasher = sha2::Sha256::new();
    hasher.update(bytes);
    hex::encode(hasher.finalize())
}

fn hmac_sha256_bytes(key: &[u8], data: &[u8]) -> Result<Vec<u8>, String> {
    let mut mac = HmacSha256::new_from_slice(key).map_err(|error| error.to_string())?;
    mac.update(data);
    Ok(mac.finalize().into_bytes().to_vec())
}

fn signing_key(secret: &str, date: &str, region: &str) -> Result<Vec<u8>, String> {
    let k_date = hmac_sha256_bytes(format!("AWS4{secret}").as_bytes(), date.as_bytes())?;
    let k_region = hmac_sha256_bytes(&k_date, region.as_bytes())?;
    let k_service = hmac_sha256_bytes(&k_region, b"s3")?;
    hmac_sha256_bytes(&k_service, b"aws4_request")
}

fn sign_s3_request(
    method: &str,
    url: &reqwest::Url,
    body: &[u8],
    config: &SyncS3Config,
    extra_headers: &[(String, String)],
) -> Result<Vec<(String, String)>, String> {
    let now = Utc::now();
    let amz_date = now.format("%Y%m%dT%H%M%SZ").to_string();
    let date_stamp = now.format("%Y%m%d").to_string();
    let region = if config.region.trim().is_empty() {
        "us-east-1".to_string()
    } else {
        config.region.trim().to_string()
    };
    let payload_hash = sha256_hex(body);

    let mut headers = vec![
        (
            "host".to_string(),
            url.host_str().unwrap_or_default().to_string(),
        ),
        ("x-amz-date".to_string(), amz_date.clone()),
        ("x-amz-content-sha256".to_string(), payload_hash.clone()),
    ];
    if let Some(token) = &config.session_token {
        if !token.trim().is_empty() {
            headers.push(("x-amz-security-token".to_string(), token.trim().to_string()));
        }
    }
    headers.extend(extra_headers.iter().cloned());
    headers.sort_by(|left, right| left.0.cmp(&right.0));

    let canonical_headers = headers
        .iter()
        .map(|(key, value)| format!("{}:{}", key.to_lowercase(), value.trim()))
        .collect::<Vec<_>>()
        .join("\n");
    let signed_headers = headers
        .iter()
        .map(|(key, _)| key.to_lowercase())
        .collect::<Vec<_>>()
        .join(";");
    let mut query_pairs = url
        .query_pairs()
        .map(|(key, value)| (key.to_string(), value.to_string()))
        .collect::<Vec<_>>();
    query_pairs.sort_by(|left, right| left.0.cmp(&right.0).then(left.1.cmp(&right.1)));
    let canonical_query = query_pairs
        .iter()
        .map(|(key, value)| {
            format!(
                "{}={}",
                encode_uri_component(key),
                encode_uri_component(value)
            )
        })
        .collect::<Vec<_>>()
        .join("&");
    let canonical_request = [
        method.to_uppercase(),
        encode_s3_path(url.path()),
        canonical_query,
        format!("{canonical_headers}\n"),
        signed_headers.clone(),
        payload_hash.clone(),
    ]
    .join("\n");
    let canonical_request_hash = sha256_hex(canonical_request.as_bytes());
    let credential_scope = format!("{date_stamp}/{region}/s3/aws4_request");
    let string_to_sign = [
        "AWS4-HMAC-SHA256".to_string(),
        amz_date.clone(),
        credential_scope.clone(),
        canonical_request_hash,
    ]
    .join("\n");
    let signature = hex::encode(hmac_sha256_bytes(
        &signing_key(&config.secret_access_key, &date_stamp, &region)?,
        string_to_sign.as_bytes(),
    )?);
    let authorization = format!(
        "AWS4-HMAC-SHA256 Credential={}/{}, SignedHeaders={}, Signature={}",
        config.access_key_id.trim(),
        credential_scope,
        signed_headers,
        signature
    );

    let mut signed = headers;
    signed.push(("authorization".to_string(), authorization));
    Ok(signed)
}

fn send_s3_request(
    client: &Client,
    method: reqwest::Method,
    url: &str,
    body: Option<Vec<u8>>,
    config: &SyncS3Config,
    extra_headers: Vec<(String, String)>,
) -> Result<reqwest::blocking::Response, String> {
    let parsed = reqwest::Url::parse(url).map_err(|error| error.to_string())?;
    let payload = body.clone().unwrap_or_default();
    let signed_headers =
        sign_s3_request(method.as_str(), &parsed, &payload, config, &extra_headers)?;
    let mut request = client.request(method, parsed);
    for (key, value) in signed_headers {
        request = request.header(key, value);
    }
    if let Some(bytes) = body {
        request = request.body(bytes);
    }
    request.send().map_err(|error| error.to_string())
}

fn validate_s3_connectivity(config: &SyncConfig) -> Result<(), String> {
    validate_sync_config(config)?;
    let client = Client::builder()
        .timeout(Duration::from_secs(20))
        .build()
        .map_err(|error| error.to_string())?;

    let endpoint = config.s3.endpoint.trim_end_matches('/');
    let probe_prefix = build_s3_key(config.s3.prefix.as_deref(), "desktop-probe");
    let list_url = format!(
        "{}/{}?list-type=2&max-keys=1&prefix={}",
        endpoint,
        config.s3.bucket.trim(),
        encode_uri_component(&probe_prefix)
    );
    let list_response = send_s3_request(
        &client,
        reqwest::Method::GET,
        &list_url,
        None,
        &config.s3,
        Vec::new(),
    )?;
    if !list_response.status().is_success() {
        return Err(format!("S3 list 校验失败：{}", list_response.status()));
    }

    let probe_key = build_s3_key(
        config.s3.prefix.as_deref(),
        &format!("desktop-probe/{}.json", Utc::now().timestamp_millis()),
    );
    let probe_body = json!({ "source": "myz-suite-desktop", "checkedAt": now_iso_string() })
        .to_string()
        .into_bytes();
    let put_response = send_s3_request(
        &client,
        reqwest::Method::PUT,
        &build_s3_object_url(&config.s3, &probe_key),
        Some(probe_body),
        &config.s3,
        vec![("content-type".to_string(), "application/json".to_string())],
    )?;
    if !put_response.status().is_success() {
        return Err(format!("S3 写入校验失败：{}", put_response.status()));
    }

    let delete_response = send_s3_request(
        &client,
        reqwest::Method::DELETE,
        &build_s3_object_url(&config.s3, &probe_key),
        None,
        &config.s3,
        Vec::new(),
    )?;
    if !delete_response.status().is_success() && delete_response.status().as_u16() != 404 {
        return Err(format!("S3 删除探测文件失败：{}", delete_response.status()));
    }
    Ok(())
}

fn read_records(app: &AppHandle) -> Result<Vec<Value>, String> {
    let path = records_path(app)?;
    read_json_file(&path, &default_records())
}

fn write_records(app: &AppHandle, records: &[Value]) -> Result<(), String> {
    let path = records_path(app)?;
    write_json_file(&path, &records)
}

fn read_chat_state(app: &AppHandle) -> Result<DesktopChatState, String> {
    let path = chat_state_path(app)?;
    read_json_file(&path, &default_chat_state())
}

fn write_chat_state(app: &AppHandle, state: &DesktopChatState) -> Result<(), String> {
    let path = chat_state_path(app)?;
    write_json_file(&path, state)
}

fn merge_json_value(target: &mut Value, patch: &Value) {
    match (target, patch) {
        (Value::Object(target_map), Value::Object(patch_map)) => {
            for (key, patch_value) in patch_map {
                match target_map.get_mut(key) {
                    Some(target_value) => merge_json_value(target_value, patch_value),
                    None => {
                        target_map.insert(key.clone(), patch_value.clone());
                    }
                }
            }
        }
        (target_slot, patch_value) => {
            *target_slot = patch_value.clone();
        }
    }
}

fn record_id(record: &Value) -> Option<&str> {
    record.get("id").and_then(Value::as_str)
}

fn conversation_info_id(conversation: &Value) -> Option<&str> {
    conversation.get("id").and_then(Value::as_str)
}

#[tauri::command]
fn desktop_list_records(app: AppHandle) -> Result<Vec<Value>, String> {
    read_records(&app)
}

#[tauri::command]
fn desktop_get_record(app: AppHandle, target_record_id: String) -> Result<Option<Value>, String> {
    let records = read_records(&app)?;
    Ok(records
        .into_iter()
        .find(|record| record_id(record) == Some(target_record_id.as_str())))
}

#[tauri::command]
fn desktop_save_record(app: AppHandle, record: Value) -> Result<Value, String> {
    let mut records = read_records(&app)?;
    let Some(current_id) = record_id(&record).map(str::to_string) else {
        return Err("record.id is required".to_string());
    };
    if let Some(index) = records
        .iter()
        .position(|existing| record_id(existing) == Some(current_id.as_str()))
    {
        records[index] = record.clone();
    } else {
        records.insert(0, record.clone());
    }
    write_records(&app, &records)?;
    Ok(record)
}

#[tauri::command]
fn desktop_save_records(app: AppHandle, records: Vec<Value>) -> Result<Vec<Value>, String> {
    let mut current = read_records(&app)?;
    for record in &records {
        let Some(current_id) = record_id(record).map(str::to_string) else {
            continue;
        };
        if let Some(index) = current
            .iter()
            .position(|existing| record_id(existing) == Some(current_id.as_str()))
        {
            current[index] = record.clone();
        } else {
            current.push(record.clone());
        }
    }
    write_records(&app, &current)?;
    Ok(records)
}

#[tauri::command]
fn desktop_remove_records(app: AppHandle, record_ids: Vec<String>) -> Result<(), String> {
    let current = read_records(&app)?;
    let next: Vec<Value> = current
        .into_iter()
        .filter(|record| {
            record_id(record)
                .map(|value| !record_ids.iter().any(|candidate| candidate == value))
                .unwrap_or(true)
        })
        .collect();
    write_records(&app, &next)
}

#[tauri::command]
fn desktop_export_records(app: AppHandle) -> Result<RecordExportResult, String> {
    let records = read_records(&app)?;
    let markdown = records
        .iter()
        .map(|record| {
            let title = record
                .get("title")
                .and_then(Value::as_str)
                .unwrap_or("Untitled record");
            let text = record.get("text").and_then(Value::as_str).unwrap_or("");
            format!("## {title}\n\n{text}")
        })
        .collect::<Vec<_>>()
        .join("\n\n");
    let json = serde_json::to_string_pretty(&records).map_err(|error| error.to_string())?;
    Ok(RecordExportResult { markdown, json })
}

#[tauri::command]
fn desktop_import_records(
    app: AppHandle,
    input: RecordImportInput,
) -> Result<RecordImportResult, String> {
    let mut current = read_records(&app)?;
    let mut inserted = 0usize;
    let mut replaced = 0usize;
    let mut skipped = 0usize;

    for record in input.records {
        let Some(current_id) = record_id(&record).map(str::to_string) else {
            skipped += 1;
            continue;
        };
        if let Some(index) = current
            .iter()
            .position(|existing| record_id(existing) == Some(current_id.as_str()))
        {
            match input.strategy.as_str() {
                "overwrite" | "latest" => {
                    current[index] = record;
                    replaced += 1;
                }
                _ => skipped += 1,
            }
        } else {
            current.push(record);
            inserted += 1;
        }
    }

    write_records(&app, &current)?;
    Ok(RecordImportResult {
        inserted,
        replaced,
        skipped,
    })
}

#[tauri::command]
fn desktop_get_settings(app: AppHandle) -> Result<DesktopSettings, String> {
    let path = settings_path(&app)?;
    read_json_file(&path, &default_settings())
}

#[tauri::command]
fn desktop_update_settings(app: AppHandle, patch: Value) -> Result<DesktopSettings, String> {
    let path = settings_path(&app)?;
    let mut current = read_json_file(&path, &default_settings())?;
    merge_json_value(&mut current, &patch);
    let next = current;
    write_json_file(&path, &next)?;
    Ok(next)
}

#[tauri::command]
fn desktop_get_theme(app: AppHandle) -> Result<Option<String>, String> {
    let path = theme_path(&app)?;
    if !path.exists() {
        write_json_file(&path, &json!({ "theme": "dark" }))?;
    }
    let value: Value = read_json_file(&path, &json!({ "theme": "dark" }))?;
    Ok(value
        .get("theme")
        .and_then(Value::as_str)
        .map(ToString::to_string))
}

#[tauri::command]
fn desktop_set_theme(app: AppHandle, theme: String) -> Result<(), String> {
    let path = theme_path(&app)?;
    write_json_file(&path, &json!({ "theme": theme }))
}

#[tauri::command]
fn desktop_get_sync_config(app: AppHandle) -> Result<SyncConfig, String> {
    let path = sync_config_path(&app)?;
    read_json_file(&path, &default_sync_config())
}

#[tauri::command]
fn desktop_update_sync_config(app: AppHandle, patch: Value) -> Result<SyncConfig, String> {
    let path = sync_config_path(&app)?;
    let mut current = serde_json::to_value(read_json_file(&path, &default_sync_config())?)
        .map_err(|error| error.to_string())?;
    merge_json_value(&mut current, &patch);
    let next: SyncConfig = serde_json::from_value(current).map_err(|error| error.to_string())?;
    write_json_file(&path, &next)?;
    let current_status = normalize_sync_status(
        &app,
        read_json_file(&sync_status_path(&app)?, &default_sync_status())?,
    )?;
    write_json_file(&sync_status_path(&app)?, &current_status)?;
    Ok(next)
}

#[tauri::command]
fn desktop_get_sync_status(app: AppHandle) -> Result<SyncStatus, String> {
    let path = sync_status_path(&app)?;
    normalize_sync_status(&app, read_json_file(&path, &default_sync_status())?)
}

#[tauri::command]
fn desktop_run_sync(app: AppHandle, _reason: Option<String>) -> Result<SyncRunResult, String> {
    let config = desktop_get_sync_config(app.clone())?;
    let pending_records = count_pending_sync_records(&app, config.enabled)?;
    let finished_at = now_iso_string();
    let validation = validate_s3_connectivity(&config);
    let result = match validation {
        Ok(()) => SyncRunResult {
            ok: true,
            state: "idle".to_string(),
            synced_records: Some(0),
            skipped_records: Some(pending_records),
            finished_at: Some(finished_at.clone()),
            message: Some(format!(
                "已验证 S3 读写连接；桌面端暂未执行记录上传/下载。当前有 {} 条本地记录待后续同步能力接入。",
                pending_records
            )),
        },
        Err(message) => SyncRunResult {
            ok: false,
            state: "error".to_string(),
            synced_records: Some(0),
            skipped_records: Some(pending_records),
            finished_at: Some(finished_at.clone()),
            message: Some(message),
        },
    };
    merge_sync_status_patch(
        &app,
        SyncStatus {
            enabled: config.enabled,
            state: result.state.clone(),
            last_sync_at: result.finished_at.clone(),
            pending_records: Some(pending_records),
            last_error: if result.ok {
                None
            } else {
                result.message.clone()
            },
        },
    )?;
    Ok(result)
}

#[tauri::command]
fn desktop_chat_list_conversations(app: AppHandle) -> Result<Vec<Value>, String> {
    let mut conversations: Vec<Value> = read_chat_state(&app)?
        .conversations
        .into_iter()
        .map(|conversation| conversation.info)
        .collect();
    conversations.sort_by(|left, right| {
        let left_updated = left
            .get("updatedAt")
            .and_then(Value::as_str)
            .unwrap_or_default();
        let right_updated = right
            .get("updatedAt")
            .and_then(Value::as_str)
            .unwrap_or_default();
        right_updated.cmp(left_updated)
    });
    Ok(conversations)
}

#[tauri::command]
fn desktop_chat_get_conversation(
    app: AppHandle,
    conversation_id: String,
) -> Result<Option<Value>, String> {
    let state = read_chat_state(&app)?;
    Ok(state
        .conversations
        .into_iter()
        .find(|conversation| {
            conversation_info_id(&conversation.info) == Some(conversation_id.as_str())
        })
        .map(|conversation| conversation.info))
}

#[tauri::command]
fn desktop_chat_save_conversation(app: AppHandle, conversation: Value) -> Result<Value, String> {
    let Some(current_id) = conversation_info_id(&conversation).map(str::to_string) else {
        return Err("conversation.id is required".to_string());
    };
    let mut state = read_chat_state(&app)?;
    if let Some(existing) = state
        .conversations
        .iter_mut()
        .find(|entry| conversation_info_id(&entry.info) == Some(current_id.as_str()))
    {
        existing.info = conversation.clone();
    } else {
        state.conversations.push(DesktopChatConversation {
            info: conversation.clone(),
            messages: vec![],
        });
    }
    if state.active_conversation_id.is_none() {
        state.active_conversation_id = Some(current_id);
    }
    write_chat_state(&app, &state)?;
    Ok(conversation)
}

#[tauri::command]
fn desktop_chat_delete_conversation(app: AppHandle, conversation_id: String) -> Result<(), String> {
    let mut state = read_chat_state(&app)?;
    state.conversations.retain(|conversation| {
        conversation_info_id(&conversation.info) != Some(conversation_id.as_str())
    });
    if state.active_conversation_id.as_deref() == Some(conversation_id.as_str()) {
        state.active_conversation_id = state
            .conversations
            .first()
            .and_then(|conversation| conversation_info_id(&conversation.info).map(str::to_string));
    }
    write_chat_state(&app, &state)
}

#[tauri::command]
fn desktop_chat_get_messages(
    app: AppHandle,
    conversation_id: String,
) -> Result<Vec<Value>, String> {
    let state = read_chat_state(&app)?;
    Ok(state
        .conversations
        .into_iter()
        .find(|conversation| {
            conversation_info_id(&conversation.info) == Some(conversation_id.as_str())
        })
        .map(|conversation| conversation.messages)
        .unwrap_or_default())
}

#[tauri::command]
fn desktop_chat_replace_messages(
    app: AppHandle,
    conversation_id: String,
    messages: Vec<Value>,
) -> Result<Vec<Value>, String> {
    let mut state = read_chat_state(&app)?;
    if let Some(existing) = state
        .conversations
        .iter_mut()
        .find(|entry| conversation_info_id(&entry.info) == Some(conversation_id.as_str()))
    {
        existing.messages = messages.clone();
    } else {
        state.conversations.push(DesktopChatConversation {
            info: json!({
                "id": conversation_id,
                "title": "",
                "url": "",
                "createdAt": "",
                "updatedAt": "",
                "sendContextEnabled": false
            }),
            messages: messages.clone(),
        });
    }
    write_chat_state(&app, &state)?;
    Ok(messages)
}

#[tauri::command]
fn desktop_chat_get_active_conversation_id(app: AppHandle) -> Result<Option<String>, String> {
    Ok(read_chat_state(&app)?.active_conversation_id)
}

#[tauri::command]
fn desktop_chat_set_active_conversation_id(
    app: AppHandle,
    conversation_id: Option<String>,
) -> Result<Option<String>, String> {
    let mut state = read_chat_state(&app)?;
    state.active_conversation_id = conversation_id.clone();
    write_chat_state(&app, &state)?;
    Ok(conversation_id)
}

#[tauri::command]
fn desktop_chat_get_workspace_context(app: AppHandle) -> Result<DesktopWorkspaceContext, String> {
    let workspace_root = desktop_workspace_root(&app)?;
    let agents_file = workspace_agents_file_path(&workspace_root);
    Ok(DesktopWorkspaceContext {
        workspace_root: workspace_root.to_string_lossy().to_string(),
        agents_file: agents_file.to_string_lossy().to_string(),
        scope_label: format!("workspace root: {}", workspace_root.to_string_lossy()),
    })
}

#[tauri::command]
fn desktop_agent_list_workspace(
    app: AppHandle,
    path: Option<String>,
    depth: Option<usize>,
) -> Result<DesktopWorkspaceListResult, String> {
    let workspace_root = desktop_workspace_root(&app)?;
    let safe_depth = depth.unwrap_or(2).min(6);
    list_workspace_entries(&workspace_root, path.as_deref(), safe_depth)
}

#[tauri::command]
fn desktop_agent_read_workspace_file(
    app: AppHandle,
    path: String,
) -> Result<DesktopWorkspaceReadResult, String> {
    let workspace_root = desktop_workspace_root(&app)?;
    read_workspace_file(&workspace_root, &path)
}

#[tauri::command]
fn desktop_agent_write_workspace_file(
    app: AppHandle,
    input: DesktopWorkspaceWriteInput,
) -> Result<DesktopWorkspaceWriteResult, String> {
    let workspace_root = desktop_workspace_root(&app)?;
    write_workspace_file(&workspace_root, input)
}

#[tauri::command]
fn desktop_agent_edit_workspace_file(
    app: AppHandle,
    input: DesktopWorkspaceEditInput,
) -> Result<DesktopWorkspaceEditResult, String> {
    let workspace_root = desktop_workspace_root(&app)?;
    edit_workspace_file(&workspace_root, input)
}

#[tauri::command]
fn desktop_agent_glob_workspace(
    app: AppHandle,
    input: DesktopWorkspaceGlobInput,
) -> Result<DesktopWorkspaceGlobResult, String> {
    let workspace_root = desktop_workspace_root(&app)?;
    glob_workspace_paths(&workspace_root, input)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            desktop_list_records,
            desktop_get_record,
            desktop_save_record,
            desktop_save_records,
            desktop_remove_records,
            desktop_export_records,
            desktop_import_records,
            desktop_get_settings,
            desktop_update_settings,
            desktop_get_theme,
            desktop_set_theme,
            desktop_get_sync_config,
            desktop_update_sync_config,
            desktop_get_sync_status,
            desktop_run_sync,
            desktop_chat_list_conversations,
            desktop_chat_get_conversation,
            desktop_chat_save_conversation,
            desktop_chat_delete_conversation,
            desktop_chat_get_messages,
            desktop_chat_replace_messages,
            desktop_chat_get_active_conversation_id,
            desktop_chat_set_active_conversation_id,
            desktop_chat_get_workspace_context,
            desktop_agent_list_workspace,
            desktop_agent_read_workspace_file,
            desktop_agent_write_workspace_file,
            desktop_agent_edit_workspace_file,
            desktop_agent_glob_workspace
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn normalize_workspace_path_rejects_escape() {
        assert_eq!(
            normalize_workspace_relative_path("notes/today.md").unwrap(),
            "notes/today.md"
        );
        assert!(normalize_workspace_relative_path("../secret.txt").is_err());
        assert!(normalize_workspace_relative_path("/tmp/secret.txt").is_err());
    }

    #[test]
    fn workspace_file_roundtrip_stays_in_root() {
        let dir = tempdir().unwrap();
        let root = dir.path();

        let write_result = write_workspace_file(
            root,
            DesktopWorkspaceWriteInput {
                path: "notes/today.md".to_string(),
                content: "hello workspace".to_string(),
                mode: Some("create".to_string()),
            },
        )
        .unwrap();
        assert_eq!(write_result.path, "notes/today.md");

        let read_result = read_workspace_file(root, "notes/today.md").unwrap();
        assert_eq!(read_result.content, "hello workspace");
    }

    #[test]
    fn workspace_edit_updates_target_file() {
        let dir = tempdir().unwrap();
        let root = dir.path();

        write_workspace_file(
            root,
            DesktopWorkspaceWriteInput {
                path: "notes/edit.md".to_string(),
                content: "alpha beta alpha".to_string(),
                mode: Some("create".to_string()),
            },
        )
        .unwrap();

        let edit_result = edit_workspace_file(
            root,
            DesktopWorkspaceEditInput {
                path: "notes/edit.md".to_string(),
                find: "alpha".to_string(),
                replace: "omega".to_string(),
                replace_all: Some(true),
            },
        )
        .unwrap();
        assert_eq!(edit_result.replacements, 2);

        let read_result = read_workspace_file(root, "notes/edit.md").unwrap();
        assert_eq!(read_result.content, "omega beta omega");
    }

    #[test]
    fn workspace_list_and_glob_return_relative_paths() {
        let dir = tempdir().unwrap();
        let root = dir.path();

        write_workspace_file(
            root,
            DesktopWorkspaceWriteInput {
                path: "notes/a.md".to_string(),
                content: "a".to_string(),
                mode: Some("create".to_string()),
            },
        )
        .unwrap();
        write_workspace_file(
            root,
            DesktopWorkspaceWriteInput {
                path: "notes/sub/b.md".to_string(),
                content: "b".to_string(),
                mode: Some("create".to_string()),
            },
        )
        .unwrap();

        let list_result = list_workspace_entries(root, Some("notes"), 2).unwrap();
        assert_eq!(list_result.base_path, "notes");
        assert!(list_result
            .entries
            .iter()
            .any(|entry| entry.path == "notes/a.md" && entry.kind == "file"));
        assert!(list_result
            .entries
            .iter()
            .any(|entry| entry.path == "notes/sub" && entry.kind == "directory"));

        let glob_result = glob_workspace_paths(
            root,
            DesktopWorkspaceGlobInput {
                pattern: "notes/**/*.md".to_string(),
            },
        )
        .unwrap();
        assert_eq!(
            glob_result.matches,
            vec!["notes/a.md".to_string(), "notes/sub/b.md".to_string()]
        );
    }

    #[test]
    fn workspace_operations_reject_out_of_root_paths() {
        let dir = tempdir().unwrap();
        let root = dir.path();

        let error = write_workspace_file(
            root,
            DesktopWorkspaceWriteInput {
                path: "../escape.txt".to_string(),
                content: "bad".to_string(),
                mode: Some("overwrite".to_string()),
            },
        )
        .unwrap_err();

        assert!(error.contains("workspace"));
    }
}
