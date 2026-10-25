use crate::features::vim::service::{create_starter_vimrc, read_vimrc_text};

#[test]
fn missing_vimrc_reads_as_none() {
    let dir = tempfile::tempdir().unwrap();

    assert_eq!(read_vimrc_text(&dir.path().join("vimrc")).unwrap(), None);
}

#[test]
fn vimrc_that_is_not_utf8_fails_to_read() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("vimrc");
    std::fs::write(&path, [b'i', b'm', b'a', b'p', b' ', 0xff, 0xfe]).unwrap();

    assert!(read_vimrc_text(&path).is_err());
}

#[test]
fn starter_vimrc_is_created_once_and_never_overwritten() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("vimrc");

    create_starter_vimrc(&path).unwrap();
    let starter = read_vimrc_text(&path).unwrap().unwrap();
    assert!(starter.contains("imap jk <Esc>"));

    std::fs::write(&path, "nmap j gj\n").unwrap();
    create_starter_vimrc(&path).unwrap();
    assert_eq!(read_vimrc_text(&path).unwrap().unwrap(), "nmap j gj\n");
}
