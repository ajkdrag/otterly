use crate::features;
use crate::shared;
use std::sync::Mutex;
use tauri_plugin_window_state::StateFlags;

include!(concat!(env!("OUT_DIR"), "/icon_stamp.rs"));

#[derive(Default)]
pub struct PendingFileOpen(pub Mutex<Option<String>>);

#[tauri::command]
pub fn get_pending_file_open(state: tauri::State<PendingFileOpen>) -> Option<String> {
    state.0.lock().unwrap().take()
}

pub fn run() {
    let _ = ICON_STAMP;
    log::info!("Otterly starting");

    let log_level = if cfg!(debug_assertions) {
        log::LevelFilter::Debug
    } else {
        log::LevelFilter::Info
    };

    let mut log_builder = tauri_plugin_log::Builder::new().level(log_level).targets([
        tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::Stdout),
        tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::LogDir { file_name: None }),
        tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::Webview),
    ]);

    if std::env::var("OTTERLY_LOG_FORMAT").as_deref() == Ok("json") {
        log_builder = log_builder.format(|callback, message, record| {
            callback.finish(format_args!(
                r#"{{"level":"{}","target":"{}","message":"{}"}}"#,
                record.level(),
                record.target(),
                message
            ))
        });
    }

    tauri::Builder::default()
        .manage(PendingFileOpen::default())
        .manage(features::watcher::service::WatcherState::default())
        .manage(features::search::service::SearchDbState::default())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_pty::init())
        .plugin(log_builder.build())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(
            tauri_plugin_window_state::Builder::new()
                .with_state_flags(
                    StateFlags::SIZE
                        | StateFlags::POSITION
                        | StateFlags::MAXIMIZED
                        | StateFlags::FULLSCREEN,
                )
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            features::vault::service::open_vault,
            features::vault::service::open_vault_by_id,
            features::vault::service::open_folder,
            features::vault::service::promote_to_vault,
            features::vault::service::list_vaults,
            features::vault::service::remove_vault_from_registry,
            features::vault::service::remember_last_vault,
            features::vault::service::get_last_vault_id,
            features::watcher::service::watch_vault,
            features::watcher::service::unwatch_vault,
            features::search::service::index_build,
            features::search::service::index_cancel,
            features::search::service::index_rebuild,
            features::search::service::index_search,
            features::search::service::index_suggest,
            features::search::service::index_suggest_planned,
            features::search::service::index_list_note_paths_by_prefix,
            features::search::service::index_upsert_note,
            features::search::service::index_remove_note,
            features::search::service::index_remove_notes,
            features::search::service::index_remove_notes_by_prefix,
            features::search::service::index_rename_note,
            features::search::service::index_rename_folder,
            features::search::service::index_note_links_snapshot,
            features::search::service::index_extract_local_note_links,
            features::search::service::rewrite_note_links,
            features::search::service::resolve_note_link,
            features::notes::service::list_notes,
            features::notes::service::list_folders,
            features::notes::service::read_note,
            features::notes::service::write_note,
            features::notes::service::create_note,
            features::notes::service::create_folder,
            features::notes::service::write_image_asset,
            features::notes::service::rename_note,
            features::notes::service::delete_note,
            features::notes::service::rename_folder,
            features::notes::service::move_items,
            features::notes::service::delete_folder,
            features::notes::service::list_folder_contents,
            features::notes::service::get_folder_stats,
            features::notes::service::read_vault_file,
            features::settings::service::get_setting,
            features::settings::service::set_setting,
            features::vault_settings::service::get_vault_setting,
            features::vault_settings::service::set_vault_setting,
            features::git::service::git_has_repo,
            features::git::service::git_init_repo,
            features::git::service::git_status,
            features::git::service::git_stage_and_commit,
            features::git::service::git_log,
            features::git::service::git_diff,
            features::git::service::git_show_file_at_commit,
            features::git::service::git_restore_file,
            features::git::service::git_create_tag,
            features::git::service::git_push,
            features::git::service::git_fetch,
            features::git::service::git_pull,
            features::git::service::git_add_remote,
            features::git::service::git_push_with_upstream,
            features::vault::service::resolve_file_to_vault,
            get_pending_file_open
        ])
        .register_uri_scheme_protocol("otterly-asset", |ctx, req| {
            shared::storage::handle_asset_request(ctx.app_handle(), req)
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            #[cfg(target_os = "macos")]
            {
                if let tauri::RunEvent::Opened { urls } = &event {
                    use tauri::Emitter;
                    for url in urls {
                        if url.scheme() == "file" {
                            if let Ok(path) = url.to_file_path() {
                                let path_str = path.to_string_lossy().into_owned();
                                log::info!("File open event: {}", path_str);
                                {
                                    use tauri::Manager;
                                    let state = app.state::<PendingFileOpen>();
                                    *state.0.lock().unwrap() = Some(path_str.clone());
                                }
                                let _ = app.emit("file-open", &path_str);
                            }
                        }
                    }
                }
            }
            let _ = (&app, &event);
        });
}
