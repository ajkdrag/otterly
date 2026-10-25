use crate::features::vault::service::open_vault_window;
use objc2::ffi::class_addMethod;
use objc2::rc::Retained;
use objc2::runtime::{AnyClass, AnyObject, Imp, NSObject, Sel};
use objc2::{define_class, msg_send, sel, AnyThread, MainThreadMarker};
use objc2_app_kit::{NSApplication, NSMenu, NSMenuItem};
use objc2_foundation::NSString;
use std::sync::OnceLock;
use tauri::AppHandle;

// Right-clicking the Dock icon offers "New Window". Tauri (2.10), tao and
// muda have no Dock menu API. AppKit asks the app delegate for
// applicationDockMenu: every time the menu opens, and tao's delegate class
// does not implement it, so we add the method to that class at runtime.
//
// The AppKit callbacks carry no user data pointer, so what they need lives in
// this static. It is a deliberate exception to "no global statics".
static DOCK_MENU: OnceLock<DockMenu> = OnceLock::new();

struct DockMenu {
    app: AppHandle,
    // NSMenuItem.target is weak. The static keeps the target alive, otherwise
    // clicks on the item do nothing.
    target: Retained<DockMenuTarget>,
}

pub fn install_dock_menu(app: &AppHandle) {
    let Some(mtm) = MainThreadMarker::new() else {
        log::error!("The Dock menu can only be installed on the main thread");
        return;
    };
    let dock_menu = DockMenu {
        app: app.clone(),
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

// Returns an autoreleased menu, like any Objective-C getter. macOS puts the
// app's windows above our item by itself.
extern "C" fn application_dock_menu(
    _delegate: &AnyObject,
    _cmd: Sel,
    _sender: *mut AnyObject,
) -> *mut NSMenu {
    let (Some(dock_menu), Some(mtm)) = (DOCK_MENU.get(), MainThreadMarker::new()) else {
        return std::ptr::null_mut();
    };
    let menu = NSMenu::new(mtm);
    // SAFETY: newWindow: is a method DockMenuTarget defines below.
    let item = unsafe {
        let item = NSMenuItem::initWithTitle_action_keyEquivalent(
            mtm.alloc(),
            &NSString::from_str("New Window"),
            Some(sel!(newWindow:)),
            &NSString::new(),
        );
        item.setTarget(Some(&dock_menu.target));
        item
    };
    menu.addItem(&item);
    Retained::autorelease_return(menu)
}

define_class!(
    // SAFETY: NSObject has no subclassing requirements, and DockMenuTarget
    // does not implement Drop. It has no ivars, so it is Send and Sync and can
    // live in the static.
    #[unsafe(super(NSObject))]
    struct DockMenuTarget;

    impl DockMenuTarget {
        #[unsafe(method(newWindow:))]
        fn new_window(&self, _item: Option<&NSMenuItem>) {
            let Some(dock_menu) = DOCK_MENU.get() else {
                return;
            };
            if let Err(error) = open_vault_window(&dock_menu.app, None) {
                log::error!("Could not open a new window from the Dock: {error}");
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
