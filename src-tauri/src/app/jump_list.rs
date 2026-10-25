use windows::core::{w, Interface, HSTRING};
use windows::Win32::Foundation::E_FAIL;
use windows::Win32::Storage::EnhancedStorage::PKEY_Title;
use windows::Win32::System::Com::StructuredStorage::PROPVARIANT;
use windows::Win32::System::Com::{
    CoCreateInstance, CoInitializeEx, CLSCTX_INPROC_SERVER, COINIT_APARTMENTTHREADED,
};
use windows::Win32::UI::Shell::Common::{IObjectArray, IObjectCollection};
use windows::Win32::UI::Shell::PropertiesSystem::IPropertyStore;
use windows::Win32::UI::Shell::{
    DestinationList, EnumerableObjectCollection, ICustomDestinationList, IShellLinkW, ShellLink,
};

// Right-clicking the taskbar button offers "New Window", like the Dock menu on
// macOS. Tauri has no jump list API. The task just starts otterly.exe again,
// and the single-instance plugin turns that into a new window on the vault
// picker in the running process.
//
// Windows keeps the list after the app quits, so setting it on every launch
// is enough, and it also fixes the path after a portable copy moves.
pub fn install_jump_list() {
    if let Err(error) = build_jump_list() {
        log::error!("Could not set the taskbar jump list: {}", error);
    }
}

fn build_jump_list() -> windows::core::Result<()> {
    let exe = std::env::current_exe()
        .map_err(|error| windows::core::Error::new(E_FAIL, error.to_string()))?;
    let exe = HSTRING::from(exe.as_path());
    // SAFETY: plain COM calls on the main thread. WebView2 already put this
    // thread in an STA, so CoInitializeEx only returns S_FALSE or
    // RPC_E_CHANGED_MODE, and we ignore both.
    unsafe {
        let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);

        let list: ICustomDestinationList =
            CoCreateInstance(&DestinationList, None, CLSCTX_INPROC_SERVER)?;
        let mut min_slots = 0u32;
        // BeginList returns the items the user removed. Tasks cannot be
        // removed, so we have nothing to filter.
        let _removed: IObjectArray = list.BeginList(&mut min_slots)?;

        let link: IShellLinkW = CoCreateInstance(&ShellLink, None, CLSCTX_INPROC_SERVER)?;
        link.SetPath(&exe)?;
        link.SetIconLocation(&exe, 0)?;
        link.SetDescription(w!("Open another Otterly window on the vault picker"))?;
        // The jump list shows PKEY_Title, not the description.
        // @Robustness: From<&str> makes a VT_BSTR, Microsoft's samples use
        // VT_LPWSTR. Not checked on a real taskbar yet.
        let store: IPropertyStore = link.cast()?;
        store.SetValue(&PKEY_Title, &PROPVARIANT::from("New Window"))?;
        store.Commit()?;

        let tasks: IObjectCollection =
            CoCreateInstance(&EnumerableObjectCollection, None, CLSCTX_INPROC_SERVER)?;
        tasks.AddObject(&link)?;
        let tasks: IObjectArray = tasks.cast()?;
        list.AddUserTasks(&tasks)?;
        list.CommitList()?;
    }
    Ok(())
}
