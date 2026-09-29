// git2 is built without its HTTPS and SSH transports (see Cargo.toml). This
// walks the local repo flow the app uses to make sure nothing needs them.
use crate::features::git::service::{
    git_create_tag, git_diff, git_has_repo, git_init_repo, git_log, git_restore_file,
    git_show_file_at_commit, git_stage_and_commit, git_status,
};
use std::fs;

#[test]
fn local_repo_flow_works_without_network_transports() {
    let dir = tempfile::tempdir().unwrap();
    let vault = dir.path().to_string_lossy().to_string();
    let note = dir.path().join("note.md");

    assert!(!git_has_repo(vault.clone()).unwrap());
    git_init_repo(vault.clone()).unwrap();
    assert!(git_has_repo(vault.clone()).unwrap());

    fs::write(&note, "one\n").unwrap();
    assert!(!git_status(vault.clone()).unwrap().files.is_empty());
    let first = git_stage_and_commit(vault.clone(), "first".into(), None).unwrap();

    fs::write(&note, "two\n").unwrap();
    let second = git_stage_and_commit(vault.clone(), "second".into(), None).unwrap();
    git_create_tag(vault.clone(), "checkpoint".into(), "checkpoint".into()).unwrap();

    let log = git_log(vault.clone(), Some("note.md".into()), 10).unwrap();
    assert_eq!(log.len(), 2);

    let diff = git_diff(vault.clone(), first.clone(), second, None).unwrap();
    assert_eq!((diff.additions, diff.deletions), (1, 1));

    let old = git_show_file_at_commit(vault.clone(), "note.md".into(), first.clone()).unwrap();
    assert_eq!(old, "one\n");
    git_restore_file(vault, "note.md".into(), first).unwrap();
    assert_eq!(fs::read_to_string(&note).unwrap(), "one\n");
}
