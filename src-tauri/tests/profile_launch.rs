use crate::features::profile::service::{
    is_valid_profile_id, profile_from_launch, profile_id_from_dir_name, profile_identifier,
    profile_ids_in_config_dir, session_file_name,
};

const BASE: &str = "com.otterly.app";

fn args(extra: &[&str]) -> Vec<String> {
    std::iter::once("otterly")
        .chain(extra.iter().copied())
        .map(String::from)
        .collect()
}

#[test]
fn no_flag_and_no_env_is_the_default_profile() {
    assert_eq!(profile_from_launch(&args(&[]), None), Ok(None));
}

#[test]
fn flag_picks_the_profile() {
    assert_eq!(
        profile_from_launch(&args(&["--profile=work"]), None),
        Ok(Some("work".to_string()))
    );
}

#[test]
fn env_picks_the_profile_without_a_flag() {
    assert_eq!(
        profile_from_launch(&args(&["notes.md"]), Some("home")),
        Ok(Some("home".to_string()))
    );
}

#[test]
fn flag_wins_over_env() {
    assert_eq!(
        profile_from_launch(&args(&["--profile=work"]), Some("home")),
        Ok(Some("work".to_string()))
    );
}

#[test]
fn explicit_default_is_the_default_profile() {
    assert_eq!(
        profile_from_launch(&args(&["--profile=default"]), None),
        Ok(None)
    );
    assert_eq!(profile_from_launch(&args(&[]), Some("default")), Ok(None));
    assert_eq!(
        profile_from_launch(&args(&["--profile=default"]), Some("home")),
        Ok(None)
    );
}

#[test]
fn space_separated_flag_is_not_a_profile() {
    assert_eq!(
        profile_from_launch(&args(&["--profile", "work"]), None),
        Ok(None)
    );
}

#[test]
fn invalid_ids_are_errors() {
    for bad in [
        "",
        "Work",
        "-work",
        "work stuff",
        "work_stuff",
        "a/b",
        "../x",
        "wörk",
    ] {
        let flag = format!("--profile={bad}");
        assert!(
            profile_from_launch(&args(&[&flag]), None).is_err(),
            "flag {flag:?}"
        );
        assert!(
            profile_from_launch(&args(&[]), Some(bad)).is_err(),
            "env {bad:?}"
        );
    }
}

#[test]
fn profile_ids_are_lowercase_digits_and_dashes_up_to_32() {
    for good in ["work", "w", "0", "work-stuff", "2024-q1", &"a".repeat(32)] {
        assert!(is_valid_profile_id(good), "{good:?}");
    }
    for bad in [
        "",
        "-work",
        "Work",
        "work.stuff",
        "work_stuff",
        &"a".repeat(33),
    ] {
        assert!(!is_valid_profile_id(bad), "{bad:?}");
    }
}

#[test]
fn identifier_and_dir_name_round_trip() {
    let identifier = profile_identifier(BASE, "work");

    assert_eq!(identifier, "com.otterly.app.profile-work");
    assert_eq!(
        profile_id_from_dir_name(BASE, &identifier),
        Some("work".to_string())
    );
}

#[test]
fn default_profile_keeps_the_base_identifier() {
    assert_eq!(profile_identifier(BASE, "default"), BASE);
}

#[test]
fn other_folders_are_not_profiles() {
    for dir_name in [
        "com.otterly.app",
        "com.otterly.app.profile-",
        "com.otterly.app.profile-default",
        "com.otterly.app.profile-Work",
        "com.otterly.apple.profile-work",
        "com.other.app.profile-work",
    ] {
        assert_eq!(
            profile_id_from_dir_name(BASE, dir_name),
            None,
            "{dir_name:?}"
        );
    }
}

#[test]
fn default_profile_keeps_the_existing_session_file() {
    assert_eq!(session_file_name("default"), "latest.json");
    assert_eq!(session_file_name("work"), "latest-work.json");
}

#[test]
fn lists_default_first_then_profile_folders_sorted() {
    let config_dir = tempfile::tempdir().unwrap();
    for name in [
        "com.otterly.app",
        "com.otterly.app.profile-work",
        "com.otterly.app.profile-home",
        // Not profiles: a bad id, an empty id, another app, and a stray file.
        "com.otterly.app.profile-Bad_Name",
        "com.otterly.app.profile-",
        "com.other.app.profile-other",
    ] {
        std::fs::create_dir(config_dir.path().join(name)).unwrap();
    }
    std::fs::write(config_dir.path().join("com.otterly.app.profile-file"), "x").unwrap();

    let ids = profile_ids_in_config_dir(config_dir.path(), BASE, "default").unwrap();

    assert_eq!(ids, ["default", "home", "work"]);
}

#[test]
fn listing_without_a_config_dir_has_only_default() {
    let config_dir = tempfile::tempdir().unwrap();
    let missing = config_dir.path().join("not-created");

    let ids = profile_ids_in_config_dir(&missing, BASE, "default").unwrap();

    assert_eq!(ids, ["default"]);
}

#[test]
fn listing_includes_the_running_profile_once() {
    let config_dir = tempfile::tempdir().unwrap();
    std::fs::create_dir(config_dir.path().join("com.otterly.app.profile-home")).unwrap();

    // Its folder is missing: nothing was written yet, or someone deleted it.
    let without_folder = profile_ids_in_config_dir(config_dir.path(), BASE, "work").unwrap();
    std::fs::create_dir(config_dir.path().join("com.otterly.app.profile-work")).unwrap();
    let with_folder = profile_ids_in_config_dir(config_dir.path(), BASE, "work").unwrap();

    assert_eq!(without_folder, ["default", "home", "work"]);
    assert_eq!(with_folder, ["default", "home", "work"]);
}
