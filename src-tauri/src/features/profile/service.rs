use std::path::Path;
use std::process::Command;
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{AppHandle, Manager, State};

// A profile is one Otterly process with its own Tauri identifier. Settings,
// the vault list, window state, logs, webview storage and the single-instance
// lock all derive from the identifier, so each profile gets its own for free.
// The default profile keeps the identifier from tauri.conf.json, which is
// where existing users' data already lives.
//
//   otterly                      -> "default", com.otterly.app
//   otterly --profile=work       -> "work",    com.otterly.app.profile-work
//   OTTERLY_PROFILE=work otterly -> same as above (the flag wins over the env)

pub const DEFAULT_PROFILE_ID: &str = "default";
pub const PROFILE_ENV_VAR: &str = "OTTERLY_PROFILE";
// Only the `=` form. With `--profile work`, files_from_args would take `work`
// for a file to open. A bare `--profile` is an error so the default profile
// does not start silently.
const PROFILE_ARG_PREFIX: &str = "--profile=";
const BARE_PROFILE_ARG: &str = "--profile";
const PROFILE_DIR_INFIX: &str = ".profile-";
const MAX_PROFILE_ID_LEN: usize = 32;

pub struct ProfileState {
    pub id: String,
    // The identifier from tauri.conf.json, before the rewrite for a profile.
    base_identifier: String,
    // Set by the Dock's "New Profile…". The main window takes it when it
    // mounts, because the event goes nowhere if the window did not exist yet.
    dialog_requested: AtomicBool,
}

impl ProfileState {
    pub fn new(profile_id: Option<String>, base_identifier: String) -> Self {
        Self {
            id: profile_id.unwrap_or_else(|| DEFAULT_PROFILE_ID.to_string()),
            base_identifier,
            dialog_requested: AtomicBool::new(false),
        }
    }
}

// Same rule as normalize_profile_name on the frontend: ^[a-z0-9][a-z0-9-]{0,31}$.
// The id ends up in a folder name and in the single-instance socket name.
pub fn is_valid_profile_id(id: &str) -> bool {
    let starts_ok = id
        .chars()
        .next()
        .is_some_and(|c| c.is_ascii_lowercase() || c.is_ascii_digit());
    starts_ok
        && id.len() <= MAX_PROFILE_ID_LEN
        && id
            .chars()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-')
}

// Ok(None) is the default profile. The first --profile=<id> argument wins over
// the env var. args[0] is the executable.
pub fn profile_from_launch(
    args: &[String],
    env_profile: Option<&str>,
) -> Result<Option<String>, String> {
    let user_args = args.iter().skip(1);
    let from_args = user_args
        .clone()
        .find_map(|arg| arg.strip_prefix(PROFILE_ARG_PREFIX));
    let has_bare_flag = user_args.clone().any(|arg| arg == BARE_PROFILE_ARG);
    if from_args.is_none() && has_bare_flag {
        return Err("Use --profile=<id> with an equals sign, not --profile <id>".to_string());
    }
    let Some(profile_id) = from_args.or(env_profile) else {
        return Ok(None);
    };
    if !is_valid_profile_id(profile_id) {
        return Err(format!(
            "Invalid profile id {profile_id:?}: use up to {MAX_PROFILE_ID_LEN} lowercase letters, digits and dashes"
        ));
    }
    if profile_id == DEFAULT_PROFILE_ID {
        return Ok(None);
    }
    Ok(Some(profile_id.to_string()))
}

pub fn profile_identifier(base_identifier: &str, profile_id: &str) -> String {
    if profile_id == DEFAULT_PROFILE_ID {
        return base_identifier.to_string();
    }
    format!("{base_identifier}{PROFILE_DIR_INFIX}{profile_id}")
}

// The reverse of profile_identifier for a folder in the config dir. The
// default profile's folder is the base identifier itself, so it never matches.
pub fn profile_id_from_dir_name(base_identifier: &str, dir_name: &str) -> Option<String> {
    let profile_id = dir_name
        .strip_prefix(base_identifier)?
        .strip_prefix(PROFILE_DIR_INFIX)?;
    let is_profile = is_valid_profile_id(profile_id) && profile_id != DEFAULT_PROFILE_ID;
    is_profile.then(|| profile_id.to_string())
}

// The vault session lives inside the vault, which several profiles can open,
// so each profile keeps its own tabs file there.
pub fn session_file_name(profile_id: &str) -> String {
    if profile_id == DEFAULT_PROFILE_ID {
        return "latest.json".to_string();
    }
    format!("latest-{profile_id}.json")
}

// WKWebView has no data directory setting, so on macOS every profile would
// share one localStorage. A data store id gives a profile its own. wry ignores
// it below macOS 14, where profiles share the store and the theme cache.
#[cfg(target_os = "macos")]
fn webview_data_store_id(state: &ProfileState) -> Option<[u8; 16]> {
    if state.id == DEFAULT_PROFILE_ID {
        return None;
    }
    let identifier = profile_identifier(&state.base_identifier, &state.id);
    let hash = blake3::hash(identifier.as_bytes());
    let mut store_id = [0u8; 16];
    store_id.copy_from_slice(&hash.as_bytes()[..16]);
    Some(store_id)
}

// Every window we build (main and documents) goes through this, so a profile
// has one webview store. The default profile keeps the shared one.
#[cfg(target_os = "macos")]
pub fn with_profile_data_store<'a>(
    builder: tauri::WebviewWindowBuilder<'a, tauri::Wry, AppHandle>,
    app: &AppHandle,
) -> tauri::WebviewWindowBuilder<'a, tauri::Wry, AppHandle> {
    match webview_data_store_id(&app.state::<ProfileState>()) {
        Some(store_id) => builder.data_store_identifier(store_id),
        None => builder,
    }
}

pub fn list_profile_ids(app: &AppHandle) -> Result<Vec<String>, String> {
    let state = app.state::<ProfileState>();
    let config_dir = app.path().config_dir().map_err(|e| e.to_string())?;
    profile_ids_in_config_dir(&config_dir, &state.base_identifier, &state.id)
}

// "default" first, then every <base>.profile-<id> folder in the config dir,
// sorted. A profile exists when its folder does. There is no list to keep in
// sync. Files and folders with an invalid id are skipped. The running profile
// is always listed, because its folder only appears on its first write, and
// someone can delete it by hand.
pub fn profile_ids_in_config_dir(
    config_dir: &Path,
    base_identifier: &str,
    current_id: &str,
) -> Result<Vec<String>, String> {
    let mut profile_ids = Vec::new();
    match std::fs::read_dir(config_dir) {
        Ok(entries) => {
            for entry in entries.flatten() {
                if !entry.path().is_dir() {
                    continue;
                }
                let dir_name = entry.file_name().to_string_lossy().to_string();
                if let Some(id) = profile_id_from_dir_name(base_identifier, &dir_name) {
                    profile_ids.push(id);
                }
            }
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
        Err(error) => return Err(error.to_string()),
    }
    if current_id != DEFAULT_PROFILE_ID {
        profile_ids.push(current_id.to_string());
    }
    profile_ids.sort();
    profile_ids.dedup();
    profile_ids.insert(0, DEFAULT_PROFILE_ID.to_string());
    Ok(profile_ids)
}

// Starts another Otterly process for the profile. If that profile already
// runs, the new process hands its arguments to it through the single-instance
// plugin (which focuses its window) and exits.
pub fn launch_profile(app: &AppHandle, profile_id: &str) -> Result<(), String> {
    if !is_valid_profile_id(profile_id) {
        return Err(format!("Invalid profile id {profile_id:?}"));
    }
    let state = app.state::<ProfileState>();
    if profile_id == state.id {
        return Ok(());
    }

    // Spawning our own executable works the same for the bundle, the Windows
    // and Linux installs, and `tauri dev`. The flag always goes along, even for
    // the default profile, so our own OTTERLY_PROFILE cannot leak into it.
    //
    // current_binary gives the .AppImage file when we run from one, because
    // the executable inside an AppImage sits on a temporary mount. On macOS it
    // refuses a path that goes through a symlink, because we would run
    // whatever the link points at (Tauri's own restart has the same guard). So
    // an app behind a symlink cannot open profiles, and the error names the
    // link.
    let exe_path = tauri::process::current_binary(&app.env()).map_err(|e| e.to_string())?;
    let mut command = Command::new(exe_path);
    command
        .arg(format!("{PROFILE_ARG_PREFIX}{profile_id}"))
        .env_remove(PROFILE_ENV_VAR);
    // Its own process group, so Ctrl+C or closing the terminal we were started
    // from (`tauri dev`, say) does not take every profile down with us.
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        command.process_group(0);
    }
    let mut child = command.spawn().map_err(|e| e.to_string())?;
    // A child that forwards to a running profile exits right away. Without the
    // wait it stays a zombie for as long as we run.
    std::thread::spawn(move || {
        let _ = child.wait();
    });

    // A profile exists when its folder does, so this makes it show up in the
    // lists right away. The new process creates the folder itself too, so a
    // failure here is only logged. It comes after the spawn because a failed
    // spawn must not leave an empty folder, which would list as a profile.
    match app.path().config_dir() {
        Ok(config_dir) => {
            let profile_dir =
                config_dir.join(profile_identifier(&state.base_identifier, profile_id));
            if let Err(error) = std::fs::create_dir_all(&profile_dir) {
                log::warn!("Could not create {}: {error}", profile_dir.display());
            }
        }
        Err(error) => log::warn!("No config dir to create profile {profile_id} in: {error}"),
    }
    log::info!("Launched profile {profile_id}");
    Ok(())
}

// Only the Dock menu asks for the profiles dialog from the backend.
#[cfg(target_os = "macos")]
pub fn request_profile_dialog(app: &AppHandle) {
    use tauri::Emitter;

    app.state::<ProfileState>()
        .dialog_requested
        .store(true, Ordering::SeqCst);
    if let Err(error) = app.emit_to("main", "profile_dialog_requested", ()) {
        log::error!("Could not ask the main window for the profiles dialog: {error}");
    }
}

#[tauri::command]
pub fn get_current_profile(state: State<ProfileState>) -> String {
    state.id.clone()
}

#[tauri::command]
pub fn list_profiles(app: AppHandle) -> Result<Vec<String>, String> {
    list_profile_ids(&app)
}

#[tauri::command]
pub fn open_profile(app: AppHandle, profile_id: String) -> Result<(), String> {
    launch_profile(&app, &profile_id)
}

// Take and clear, so the event and the mount check can both ask without
// opening the dialog twice.
#[tauri::command]
pub fn take_profile_dialog_request(state: State<ProfileState>) -> bool {
    state.dialog_requested.swap(false, Ordering::SeqCst)
}
