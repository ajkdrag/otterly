use crate::features::vault_session::service::parse_vault_session;

#[test]
fn parse_vault_session_accepts_object_payload() {
    let bytes = br#"{
  "tabs": [],
  "active_tab_path": null
}"#;

    let parsed = parse_vault_session(bytes).expect("expected parse to succeed");

    assert!(parsed.is_object());
    assert!(parsed.get("tabs").is_some());
}

#[test]
fn parse_vault_session_rejects_invalid_json() {
    let bytes = br#"{ invalid json }"#;

    let result = parse_vault_session(bytes);

    assert!(result.is_err());
}

#[test]
fn parse_vault_session_rejects_non_object_roots() {
    let bytes = br#"[]"#;

    let result = parse_vault_session(bytes);

    assert!(result.is_err());
}
