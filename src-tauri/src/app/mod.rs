use crate::features;
use crate::shared;
use tauri_plugin_window_state::StateFlags;

include!(concat!(env!("OUT_DIR"), "/icon_stamp.rs"));

pub fn run() {
    let _ = ICON_STAMP;
    log::info!("LeapGrowNotes starting");

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

    if std::env::var("LEAPGROWNOTES_LOG_FORMAT").as_deref() == Ok("json") {
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
        .manage(features::watcher::service::WatcherState::default())
        .manage(features::search::service::SearchDbState::default())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
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
            features::search::service::index_suggest_files,
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
            features::notes::service::read_note_meta,
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
            features::settings::service::get_setting,
            features::settings::service::set_setting,
            features::vault_session::service::load_latest_vault_session,
            features::vault_session::service::save_latest_vault_session,
            features::vault_settings::service::get_vault_setting,
            features::vault_settings::service::set_vault_setting,
            features::nlp::commands::nlp_analyze_note,
            features::stats::commands::stats_start_session,
            features::stats::commands::stats_end_session,
            features::stats::commands::stats_file_opened,
            features::stats::commands::stats_file_read_complete,
            features::stats::commands::stats_get_history,
            features::git::service::git_has_repo,
            features::git::service::git_init_repo,
            features::git::service::git_status,
            features::git::service::git_stage_and_commit,
            features::git::service::git_log,
            features::git::service::git_diff,
            features::git::service::git_show_file_at_commit,
            features::git::service::git_restore_file,
            features::git::service::git_create_tag
        ])
        .register_uri_scheme_protocol("leapgrownotes-asset", |ctx, req| {
            shared::storage::handle_asset_request(ctx.app_handle(), req)
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
