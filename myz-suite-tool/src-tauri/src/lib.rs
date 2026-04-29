use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::fs;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

#[derive(Debug, Clone, Serialize, Deserialize)]
struct DesktopSettings {
    #[serde(rename = "dashboardView")]
    dashboard_view: String,
    #[serde(rename = "colorPalette")]
    color_palette: Vec<String>,
    #[serde(rename = "lastUsedColor")]
    last_used_color: String,
    #[serde(rename = "lastUsedStyle")]
    last_used_style: String,
}

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
    let serialized =
        serde_json::to_string_pretty(value).map_err(|error| error.to_string())?;
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
    DesktopSettings {
        dashboard_view: "cards".to_string(),
        color_palette: vec![
            "#b58900".to_string(),
            "#ef476f".to_string(),
            "#9f7aea".to_string(),
            "#38bdf8".to_string(),
            "#34d399".to_string(),
        ],
        last_used_color: "#b58900".to_string(),
        last_used_style: "paint".to_string(),
    }
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

fn read_records(app: &AppHandle) -> Result<Vec<Value>, String> {
    let path = records_path(app)?;
    read_json_file(&path, &default_records())
}

fn write_records(app: &AppHandle, records: &[Value]) -> Result<(), String> {
    let path = records_path(app)?;
    write_json_file(&path, &records)
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
    let mut current = serde_json::to_value(read_json_file(&path, &default_settings())?)
        .map_err(|error| error.to_string())?;
    merge_json_value(&mut current, &patch);
    let next: DesktopSettings =
        serde_json::from_value(current).map_err(|error| error.to_string())?;
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
    let next: SyncConfig =
        serde_json::from_value(current).map_err(|error| error.to_string())?;
    write_json_file(&path, &next)?;
    Ok(next)
}

#[tauri::command]
fn desktop_get_sync_status(app: AppHandle) -> Result<SyncStatus, String> {
    let path = sync_status_path(&app)?;
    read_json_file(&path, &default_sync_status())
}

#[tauri::command]
fn desktop_run_sync(app: AppHandle, _reason: Option<String>) -> Result<SyncRunResult, String> {
    let records = read_records(&app)?;
    let config = desktop_get_sync_config(app.clone())?;
    let result = SyncRunResult {
        ok: config.enabled,
        state: if config.enabled {
            "idle".to_string()
        } else {
            "error".to_string()
        },
        synced_records: if config.enabled { Some(records.len()) } else { Some(0) },
        skipped_records: Some(0),
        finished_at: Some("2026-04-29T00:00:00.000Z".to_string()),
        message: Some(if config.enabled {
            "Sync adapter is connected to the desktop host contract."
        } else {
            "Enable sync and configure S3 before running desktop sync."
        }
        .to_string()),
    };
    let status = SyncStatus {
        enabled: config.enabled,
        state: result.state.clone(),
        last_sync_at: result.finished_at.clone(),
        pending_records: Some(0),
        last_error: if result.ok {
            None
        } else {
            result.message.clone()
        },
    };
    let path = sync_status_path(&app)?;
    write_json_file(&path, &status)?;
    Ok(result)
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
            desktop_run_sync
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
