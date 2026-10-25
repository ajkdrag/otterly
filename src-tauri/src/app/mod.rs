#[cfg(target_os = "macos")]
mod dock_menu;

use crate::features;
use crate::features::document::service::{
    files_from_args, forget_document_window, open_document_windows,
};
use crate::features::search::service::cancel_window_vault_find;
use crate::features::vault::service::{forget_vault_window, open_vault_window, show_vault_window};
use crate::features::watcher::service::stop_window_watcher;
use crate::shared;
use std::path::Path;
use tauri::{AppHandle, Manager, RunEvent, WindowEvent};
use tauri_plugin_window_state::StateFlags;

#[cfg(target_os = "macos")]
const NEW_WINDOW_MENU_ID: &str = "new_window";

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

    let builder = tauri::Builder::default();
    // A second launch (a file double click on Windows and Linux, or starting
    // Otterly again) hands its args to the running process and exits. A file
    // opens as a document window, and a plain launch opens a new vault window,
    // which is how New Window works on Windows and Linux. It has to be the
    // first plugin.
    #[cfg(desktop)]
    let builder = builder.plugin(tauri_plugin_single_instance::init(|app, args, cwd| {
        let files = files_from_args(&args, Path::new(&cwd));
        if !files.is_empty() {
            open_document_windows(app, files);
        } else if let Err(error) = open_vault_window(app, None) {
            log::error!("Could not open a new window: {}", error);
        }
    }));

    // The File menu only exists on macOS. On Windows and Linux Builder::menu
    // would put a menu bar on every window.
    #[cfg(target_os = "macos")]
    let builder = builder.menu(build_app_menu).on_menu_event(|app, event| {
        if event.id() == NEW_WINDOW_MENU_ID {
            if let Err(error) = open_vault_window(app, None) {
                log::error!("Could not open a new window: {}", error);
            }
        }
    });

    builder
        .manage(features::watcher::service::WatcherState::default())
        .manage(features::document::service::DocumentState::default())
        .manage(features::search::service::SearchDbState::default())
        .manage(features::theme::service::ThemeFileWatcherState::default())
        .manage(features::vault_settings::service::VaultSettingsLock::default())
        .manage(features::settings::service::SettingsLock::default())
        .manage(features::vault::service::VaultWindowState::default())
        .manage(features::search::service::VaultFindState::default())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_clipboard_manager::init())
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
        .setup(|app| {
            #[cfg(target_os = "macos")]
            dock_menu::install_dock_menu(app.handle());

            let args: Vec<String> = std::env::args().collect();
            let cwd = std::env::current_dir().unwrap_or_default();
            let files = files_from_args(&args, &cwd);
            // macOS delivers opened files as events after setup, so it decides
            // about the vault window on Ready instead.
            if !files.is_empty() {
                open_document_windows(app.handle(), files);
            } else if !cfg!(target_os = "macos") {
                show_vault_window(app.handle());
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            // Each of these is a no-op for a window that never had one.
            if let WindowEvent::Destroyed = event {
                let app = window.app_handle();
                forget_document_window(app, window.label());
                forget_vault_window(app, window.label());
                stop_window_watcher(app, window.label());
                cancel_window_vault_find(app, window.label());
            }
        })
        .invoke_handler(tauri::generate_handler![
            features::vault::service::open_vault,
            features::vault::service::open_vault_by_id,
            features::vault::service::list_vaults,
            features::vault::service::remove_vault_from_registry,
            features::vault::service::remember_last_vault,
            features::vault::service::get_window_vault_id,
            features::vault::service::focus_window_with_vault,
            features::vault::service::open_new_vault_window,
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
            features::search::service::index_list_tags,
            features::search::service::index_search_tagged_notes,
            features::search::service::index_suggest_tags,
            features::search::service::extract_note_tags,
            features::search::service::index_extract_local_note_links,
            features::search::service::rewrite_note_links,
            features::search::service::resolve_note_link,
            features::search::service::vault_find_start,
            features::search::service::vault_find_cancel,
            features::search::service::vault_replace,
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
            features::theme::service::read_theme_file,
            features::theme::service::create_theme_file,
            features::theme::service::write_theme_schema,
            features::theme::service::open_theme_file,
            features::theme::service::reveal_theme_file,
            features::theme::service::watch_theme_file,
            features::theme::service::claim_theme_file_log,
            features::vim::service::read_vimrc,
            features::vim::service::open_vimrc,
            features::vim::service::set_press_and_hold,
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
            features::git::service::git_create_tag
        ])
        .register_uri_scheme_protocol("otterly-asset", |ctx, req| {
            shared::storage::handle_asset_request(ctx.app_handle(), req)
        })
        .build(tauri::generate_context!())
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
        RunEvent::Ready if app.webview_windows().is_empty() => show_vault_window(app),
        // Clicking the dock icon with every window closed.
        RunEvent::Reopen {
            has_visible_windows: false,
            ..
        } => show_vault_window(app),
        _ => {}
    }
}

// Tauri's default macOS menu with New Window at the top of the File menu.
// Cmd+N is Create Note, so New Window takes Shift+Cmd+N.
#[cfg(target_os = "macos")]
fn build_app_menu(app: &AppHandle) -> tauri::Result<tauri::menu::Menu<tauri::Wry>> {
    use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};

    let menu = Menu::default(app)?;
    let new_window = MenuItem::with_id(
        app,
        NEW_WINDOW_MENU_ID,
        "New Window",
        true,
        Some("CmdOrCtrl+Shift+N"),
    )?;
    let separator = PredefinedMenuItem::separator(app)?;
    // The default File submenu has no id, so we find it by its title.
    for item in menu.items()? {
        let Some(submenu) = item.as_submenu() else {
            continue;
        };
        if submenu.text()? == "File" {
            submenu.prepend_items(&[&new_window, &separator])?;
            return Ok(menu);
        }
    }
    log::error!("The default menu has no File menu, so there is no New Window item");
    Ok(menu)
}
