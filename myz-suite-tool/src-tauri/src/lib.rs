use logforth::append;
use logforth::record::{Level, LevelFilter};

mod mcp_config;
mod mcp_runtime;
mod mcp_http;

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Initialize logging once using logforth, writing to rolling file so logs
    // can be inspected even if terminal output is hidden.
    let log_path =
        std::env::var("MYZ_MCP_LOG_FILE").unwrap_or_else(|_| "mcp-gateway.log".to_string());

    // Split path into directory and filename for FileBuilder.
    let path_buf = std::path::PathBuf::from(&log_path);
    let (basedir, filename) = match (path_buf.parent(), path_buf.file_name()) {
        (Some(parent), Some(name)) => (
            parent.to_path_buf(),
            name.to_string_lossy().to_string(),
        ),
        _ => (std::path::PathBuf::from("."), "mcp-gateway.log".to_string()),
    };

    let _ = logforth::starter_log::builder()
        .dispatch(move |d| {
            let file = append::file::FileBuilder::new(&basedir, &filename)
                .build()
                .unwrap_or_else(|_| {
                    append::file::FileBuilder::new(".", "mcp-gateway-fallback.log")
                        .build()
                        .unwrap()
                });
            d.filter(LevelFilter::MoreSevereEqual(Level::Debug))
                .append(file)
        })
        .apply();

    let manager = mcp_runtime::create_manager_from_default_config();
    let manager_for_tauri = manager.clone();
    let manager_for_setup = manager.clone();

    let result = tauri::Builder::default()
        .manage(manager_for_tauri)
        .setup(move |_app| {
            // 顺序：先启动 stdio MCP 服务器，再预加载工具 registry。
            let for_runtime = manager_for_setup.clone();
            tauri::async_runtime::spawn(async move {
                for_runtime.start_all_servers().await;
                for_runtime.preload_tools().await;
            });

            // HTTP 网关可以并行启动。
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
            mcp_http::mcp_add_server
        ])
        .run(tauri::generate_context!());

    // On app exit, attempt to gracefully shut down all MCP servers.
    // This closes their stdin so they can exit cleanly.
    let _ = tauri::async_runtime::block_on(manager.shutdown_all());

    result.expect("error while running tauri application");
}
