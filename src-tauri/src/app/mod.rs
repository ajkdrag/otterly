use crate::features;
use crate::features::document::service::{
    files_from_args, forget_document_window, open_document_windows,
};
use crate::features::profile::service::{
    profile_from_launch, profile_identifier, ProfileState, PROFILE_ENV_VAR,
};
#[cfg(target_os = "macos")]
use crate::features::profile::service::{request_profile_dialog, with_profile_data_store};
use crate::shared;
use std::path::Path;
use tauri::{AppHandle, Manager, RunEvent, WebviewWindowBuilder, WindowEvent};
use tauri_plugin_window_state::StateFlags;

include!(concat!(env!("OUT_DIR"), "/icon_stamp.rs"));

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

    let mut context = tauri::generate_context!();
    let base_identifier = context.config().identifier.clone();
    let args: Vec<String> = std::env::args().collect();
    let env_profile = std::env::var(PROFILE_ENV_VAR).ok();
    // The logger does not exist yet, so setup logs a bad profile id.
    let (profile_id, profile_error) = match profile_from_launch(&args, env_profile.as_deref()) {
        Ok(profile_id) => (profile_id, None),
        Err(error) => (None, Some(error)),
    };
    // A profile runs under its own identifier. Tauri derives the config dir
    // (settings, vault list), logs, window state, the webview data dir and the
    // single-instance lock from it, so profiles share none of those. This has
    // to happen before the builder and its plugins see the config.
    if let Some(profile_id) = &profile_id {
        context.config_mut().identifier = profile_identifier(&base_identifier, profile_id);
    }

    let builder = tauri::Builder::default();
    // Each profile has its own identifier, so this lock is per profile. A
    // second launch of the same profile (a file double click on Windows and
    // Linux, or open_profile spawning us on any platform) hands its args to the
    // running process and exits. LaunchServices dedupes Finder launches on
    // macOS, but not a direct exec. It has to be the first plugin.
    #[cfg(desktop)]
    let builder = builder.plugin(tauri_plugin_single_instance::init(|app, args, cwd| {
        open_files_or_main_window(app, files_from_args(&args, Path::new(&cwd)));
    }));

    builder
        .manage(features::watcher::service::WatcherState::default())
        .manage(features::document::service::DocumentState::default())
        .manage(features::search::service::SearchDbState::default())
        .manage(ProfileState::new(profile_id, base_identifier))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(log_builder.build())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
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
        .setup(move |app| {
            if let Some(error) = &profile_error {
                log::error!("{error}. Starting the default profile instead.");
            }
            log::info!("Profile {}", app.state::<ProfileState>().id);
            #[cfg(target_os = "macos")]
            features::profile::dock_menu::install_dock_menu(app.handle(), open_profiles_dialog);

            let cwd = std::env::current_dir().unwrap_or_default();
            let files = files_from_args(&args, &cwd);
            // macOS delivers opened files as events after setup, so it decides
            // about the main window on Ready instead.
            if !files.is_empty() || !cfg!(target_os = "macos") {
                open_files_or_main_window(app.handle(), files);
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::Destroyed = event {
                forget_document_window(window.app_handle(), window.label());
            }
        })
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
            features::notes::service::apply_markdown_cleanup,
            features::notes::service::get_latest_markdown_cleanup_backup,
            features::notes::service::restore_latest_markdown_cleanup,
            features::notes::service::create_note,
            features::notes::service::create_folder,
            features::notes::service::write_image_asset,
            features::notes::service::rename_note,
            features::notes::service::delete_note,
            features::notes::service::rename_folder,
            features::notes::service::move_items,
            features::notes::service::delete_folder,
            features::notes::service::list_folder_contents,
            features::document::service::read_document,
            features::document::service::write_document,
            features::document::service::reveal_document,
            features::notes::service::get_folder_stats,
            features::shell::service::reveal_in_file_manager,
            features::shell::service::open_in_default_app,
            features::updater::service::is_portable_install,
            features::settings::service::get_setting,
            features::settings::service::set_setting,
            features::vault_session::service::load_latest_vault_session,
            features::vault_session::service::save_latest_vault_session,
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
            features::profile::service::get_current_profile,
            features::profile::service::list_profiles,
            features::profile::service::open_profile,
            features::profile::service::take_profile_dialog_request
        ])
        .register_uri_scheme_protocol("otterly-asset", |ctx, req| {
            shared::storage::handle_asset_request(ctx.app_handle(), req)
        })
        .build(context)
        .expect("error while building tauri application")
        .run(handle_run_event);
}

#[allow(unused_variables)]
fn handle_run_event(app: &AppHandle, event: RunEvent) {
    #[cfg(target_os = "macos")]
    match event {
        RunEvent::Opened { urls } => {
            let files = urls
                .into_iter()
                .filter_map(|url| url.to_file_path().ok())
                .collect();
            open_document_windows(app, files);
        }
        // Launching by opening a file delivers Opened before Ready, so a plain
        // launch is the one that reaches Ready with no windows.
        RunEvent::Ready if app.webview_windows().is_empty() => show_main_window(app),
        // Clicking the dock icon with every window closed.
        RunEvent::Reopen {
            has_visible_windows: false,
            ..
        } => show_main_window(app),
        _ => {}
    }
}

// The Dock's "New Profile…". The main window shows the profiles dialog, and
// gets created first when it was closed.
#[cfg(target_os = "macos")]
fn open_profiles_dialog(app: &AppHandle) {
    request_profile_dialog(app);
    show_main_window(app);
}

fn open_files_or_main_window(app: &AppHandle, files: Vec<std::path::PathBuf>) {
    if files.is_empty() {
        show_main_window(app);
    } else {
        open_document_windows(app, files);
    }
}

// The vault window. tauri.conf.json declares it with create: false, so a
// launch that only opens a file does not show an empty vault picker too.
fn show_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.set_focus();
        return;
    }
    let Some(config) = app.config().app.windows.iter().find(|w| w.label == "main") else {
        log::error!("tauri.conf.json has no main window");
        return;
    };
    let built = WebviewWindowBuilder::from_config(app, config).and_then(|builder| {
        #[cfg(target_os = "macos")]
        let builder = with_profile_data_store(builder, app);
        builder.build()
    });
    if let Err(error) = built {
        log::error!("Could not create the main window: {}", error);
    }
}
