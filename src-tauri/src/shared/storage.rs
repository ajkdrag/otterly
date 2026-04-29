use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::http::{Request, Response};
use tauri::{AppHandle, Manager};

fn default_is_available() -> bool {
    true
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Vault {
    pub id: String,
    pub path: String,
    pub name: String,
    pub created_at: i64,
    #[serde(default)]
    pub last_opened_at: Option<i64>,
    #[serde(default)]
    pub note_count: Option<u64>,
    #[serde(default = "default_is_available")]
    pub is_available: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VaultEntry {
    pub vault: Vault,
    pub last_opened_at: i64,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct VaultStore {
    pub vaults: Vec<VaultEntry>,
    pub last_vault_id: Option<String>,
}

pub fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}

pub fn vault_id_for_path(path: &str) -> String {
    blake3::hash(path.as_bytes()).to_hex().to_string()
}

pub fn store_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    let dir = dir.join("leapgrownotes");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("vaults.json"))
}

pub fn load_store(app: &AppHandle) -> Result<VaultStore, String> {
    log::debug!("Loading vault store");
    let path = store_path(app)?;
    let bytes = match std::fs::read(&path) {
        Ok(b) => b,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(VaultStore::default()),
        Err(e) => {
            log::error!("Failed to read vault store at {}: {}", path.display(), e);
            return Err(e.to_string());
        }
    };
    serde_json::from_slice(&bytes).map_err(|e| {
        log::error!("Failed to parse vault store at {}: {}", path.display(), e);
        e.to_string()
    })
}

pub fn save_store(app: &AppHandle, store: &VaultStore) -> Result<(), String> {
    log::debug!("Saving vault store");
    let path = store_path(app)?;
    let tmp = path.with_extension("json.tmp");
    let bytes = serde_json::to_vec_pretty(store).map_err(|e| e.to_string())?;
    std::fs::write(&tmp, &bytes).map_err(|e| {
        log::error!("Failed to write vault store to {}: {}", tmp.display(), e);
        e.to_string()
    })?;
    std::fs::rename(&tmp, &path).map_err(|e| {
        log::error!(
            "Failed to rename vault store {} -> {}: {}",
            tmp.display(),
            path.display(),
            e
        );
        e.to_string()
    })?;
    Ok(())
}

pub fn vault_path_by_id(store: &VaultStore, vault_id: &str) -> Option<String> {
    store
        .vaults
        .iter()
        .find(|v| v.vault.id == vault_id)
        .map(|v| v.vault.path.clone())
}

pub fn normalize_relative_path(path: &Path) -> String {
    path.iter()
        .map(|c| c.to_string_lossy())
        .collect::<Vec<_>>()
        .join("/")
}

pub fn vault_path(app: &AppHandle, vault_id: &str) -> Result<PathBuf, String> {
    let store = load_store(app)?;
    let path = vault_path_by_id(&store, vault_id).ok_or("vault not found")?;
    Ok(PathBuf::from(path))
}

fn url_decode(input: &str) -> String {
    let mut result = String::with_capacity(input.len());
    let mut chars = input.bytes();
    while let Some(b) = chars.next() {
        if b == b'%' {
            let hi = chars.next().and_then(|c| (c as char).to_digit(16));
            let lo = chars.next().and_then(|c| (c as char).to_digit(16));
            if let (Some(h), Some(l)) = (hi, lo) {
                result.push((h * 16 + l) as u8 as char);
            } else {
                result.push('%');
            }
        } else {
            result.push(b as char);
        }
    }
    result
}

pub fn handle_asset_request(app: &AppHandle, req: Request<Vec<u8>>) -> Response<Vec<u8>> {
    let uri = req.uri().to_string();
    let rel = uri
        .trim_start_matches("leapgrownotes-asset://")
        .trim_start_matches("leapgrownotes-asset:")
        .trim_start_matches('/');

    let parts: Vec<&str> = rel.splitn(3, '/').collect();
    if parts.len() != 3 || parts[0] != "vault" {
        return Response::builder().status(400).body(Vec::new()).unwrap();
    }

    let vault_id = parts[1];
    let asset_rel = url_decode(parts[2]);

    let vault_path = match vault_path(app, vault_id) {
        Ok(p) => p,
        Err(_) => return Response::builder().status(404).body(Vec::new()).unwrap(),
    };

    let abs = match crate::features::notes::service::safe_vault_abs(&vault_path, &asset_rel) {
        Ok(p) => p,
        Err(_) => return Response::builder().status(403).body(Vec::new()).unwrap(),
    };

    let bytes = match std::fs::read(&abs) {
        Ok(b) => b,
        Err(_) => return Response::builder().status(404).body(Vec::new()).unwrap(),
    };

    let mime = mime_guess::from_path(&abs).first_or_octet_stream();
    Response::builder()
        .header("Content-Type", mime.as_ref())
        .body(bytes)
        .unwrap()
}
