use std::collections::HashMap;
use std::path::PathBuf;

use log::{info, warn};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct McpConfig {
    #[serde(default)]
    pub servers: HashMap<String, McpServerConfig>,
}

impl Default for McpConfig {
    fn default() -> Self {
        Self {
            servers: HashMap::new(),
        }
    }
}

impl McpConfig {
    pub fn load_default() -> (Self, PathBuf) {
        let path = std::env::var("MYZ_MCP_CONFIG")
            .ok()
            .map(PathBuf::from)
            .unwrap_or_else(|| std::env::current_dir().unwrap_or_default().join("mcp.config.json"));
        info!("loading MCP config from {:?}", path);
        if let Ok(bytes) = std::fs::read(&path) {
            match serde_json::from_slice(&bytes) {
                Ok(cfg) => (cfg, path),
                Err(err) => {
                    warn!("failed to parse MCP config, using defaults: {}", err);
                    (McpConfig::default(), path)
                }
            }
        } else {
            info!("no MCP config found, using defaults");
            (McpConfig::default(), path)
        }
    }
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct McpServerConfig {
    pub title: Option<String>,
    #[serde(default = "default_enabled")]
    pub enabled: bool,
    pub prefix: Option<String>,
    #[serde(default)]
    pub aliases: HashMap<String, String>,
    #[serde(flatten)]
    pub kind: McpServerKind,
}

fn default_enabled() -> bool {
    true
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(tag = "type", rename_all = "lowercase")]
pub enum McpServerKind {
    Stdio {
        command: String,
        #[serde(default)]
        args: Vec<String>,
        #[serde(default)]
        env: HashMap<String, String>,
    },
    Http {
        url: String,
        #[serde(default)]
        headers: HashMap<String, String>,
    },
}

