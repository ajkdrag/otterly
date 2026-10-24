use crate::features::profile::service::{launch_profile, list_profile_ids, ProfileState};
use objc2::ffi::class_addMethod;
use objc2::rc::Retained;
use objc2::runtime::{AnyClass, AnyObject, Imp, NSObject, Sel};
use objc2::{define_class, msg_send, sel, AnyThread, MainThreadMarker};
use objc2_app_kit::{NSApplication, NSControlStateValueOn, NSMenu, NSMenuItem};
use objc2_foundation::NSString;
use std::sync::OnceLock;
use tauri::{AppHandle, Manager};

// Right-clicking the Dock icon lists the profiles and offers "New Profile…".
// Tauri (2.10), tao and muda have no Dock menu API. AppKit asks the app
// delegate for applicationDockMenu: every time the menu opens, and tao's
// delegate class does not implement it, so we add the method to that class at
// runtime.
//
// The AppKit callbacks carry no user data pointer, so what they need lives in
// this static. It is a deliberate exception to "no global statics".
static DOCK_MENU: OnceLock<DockMenu> = OnceLock::new();

struct DockMenu {
    app: AppHandle,
    on_new_profile: fn(&AppHandle),
    // NSMenuItem.target is weak. The static keeps the target alive, otherwise
    // clicks on the items do nothing.
    target: Retained<DockMenuTarget>,
}

pub fn install_dock_menu(app: &AppHandle, on_new_profile: fn(&AppHandle)) {
    let Some(mtm) = MainThreadMarker::new() else {
        log::error!("The Dock menu can only be installed on the main thread");
        return;
    };
    let dock_menu = DockMenu {
        app: app.clone(),
        on_new_profile,
        target: DockMenuTarget::new(),
    };
    if DOCK_MENU.set(dock_menu).is_err() {
        return;
    }

    let ns_app = NSApplication::sharedApplication(mtm);
    let Some(delegate) = ns_app.delegate() else {
        log::error!("The app has no delegate, so there is no Dock menu");
        return;
    };
    let delegate_object: &AnyObject = (*delegate).as_ref();
    let delegate_class = delegate_object.class() as *const AnyClass as *mut AnyClass;
    // SAFETY: application_dock_menu matches the "@@:@" encoding, which is
    // -(NSMenu *)applicationDockMenu:(NSApplication *)sender. Transmuting a fn
    // pointer to Imp is how objc2 itself registers methods.
    let added = unsafe {
        let imp: Imp = std::mem::transmute(
            application_dock_menu as extern "C" fn(&AnyObject, Sel, *mut AnyObject) -> *mut NSMenu,
        );
        class_addMethod(
            delegate_class,
            sel!(applicationDockMenu:),
            imp,
            c"@@:@".as_ptr(),
        )
    };
    if !added.as_bool() {
        log::error!("The app delegate already has applicationDockMenu:, so no Dock menu");
        return;
    }
    // @Robustness: AppKit may check which optional delegate methods exist only
    // when the delegate is set, so we set the same delegate again to make it
    // look again. I have not verified that AppKit caches this at all.
    ns_app.setDelegate(Some(&*delegate));
}

// Returns an autoreleased menu, like any Objective-C getter. A fresh menu each
// time keeps the profile list current without any bookkeeping.
extern "C" fn application_dock_menu(
    _delegate: &AnyObject,
    _cmd: Sel,
    _sender: *mut AnyObject,
) -> *mut NSMenu {
    let (Some(dock_menu), Some(mtm)) = (DOCK_MENU.get(), MainThreadMarker::new()) else {
        return std::ptr::null_mut();
    };
    Retained::autorelease_return(build_dock_menu(dock_menu, mtm))
}

// macOS puts the process's windows above these items by itself.
fn build_dock_menu(dock_menu: &DockMenu, mtm: MainThreadMarker) -> Retained<NSMenu> {
    let menu = NSMenu::new(mtm);
    // Otherwise AppKit decides which items are enabled and ignores setEnabled.
    menu.setAutoenablesItems(false);

    let current_id = &dock_menu.app.state::<ProfileState>().id;
    let profile_ids = list_profile_ids(&dock_menu.app).unwrap_or_else(|error| {
        log::error!("Could not list profiles for the Dock menu: {error}");
        vec![current_id.clone()]
    });
    for profile_id in profile_ids {
        let item = menu_item(mtm, &profile_id, sel!(openProfile:), &dock_menu.target);
        let represented_id = NSString::from_str(&profile_id);
        // SAFETY: an NSString is a valid represented object.
        unsafe { item.setRepresentedObject(Some(&represented_id)) };
        if profile_id == *current_id {
            item.setState(NSControlStateValueOn);
            item.setEnabled(false);
        }
        menu.addItem(&item);
    }

    menu.addItem(&NSMenuItem::separatorItem(mtm));
    menu.addItem(&menu_item(
        mtm,
        "New Profile…",
        sel!(newProfile:),
        &dock_menu.target,
    ));
    menu
}

fn menu_item(
    mtm: MainThreadMarker,
    title: &str,
    action: Sel,
    target: &DockMenuTarget,
) -> Retained<NSMenuItem> {
    // SAFETY: both actions are methods DockMenuTarget defines below.
    unsafe {
        let item = NSMenuItem::initWithTitle_action_keyEquivalent(
            mtm.alloc(),
            &NSString::from_str(title),
            Some(action),
            &NSString::new(),
        );
        item.setTarget(Some(target));
        item
    }
}

define_class!(
    // SAFETY: NSObject has no subclassing requirements, and DockMenuTarget
    // does not implement Drop. It has no ivars, so it is Send and Sync and can
    // live in the static.
    #[unsafe(super(NSObject))]
    struct DockMenuTarget;

    impl DockMenuTarget {
        #[unsafe(method(openProfile:))]
        fn open_profile(&self, item: Option<&NSMenuItem>) {
            let Some(dock_menu) = DOCK_MENU.get() else {
                return;
            };
            let profile_id = item
                .and_then(|item| item.representedObject())
                .and_then(|object| object.downcast::<NSString>().ok());
            let Some(profile_id) = profile_id else {
                return;
            };
            if let Err(error) = launch_profile(&dock_menu.app, &profile_id.to_string()) {
                log::error!("Could not open profile {profile_id} from the Dock: {error}");
            }
        }

        #[unsafe(method(newProfile:))]
        fn new_profile(&self, _item: Option<&NSMenuItem>) {
            if let Some(dock_menu) = DOCK_MENU.get() {
                (dock_menu.on_new_profile)(&dock_menu.app);
            }
        }
    }
);

impl DockMenuTarget {
    fn new() -> Retained<Self> {
        let this = Self::alloc().set_ivars(());
        // SAFETY: NSObject's init takes no arguments.
        unsafe { msg_send![super(this), init] }
    }
}
