use crate::features::search::link_parser::{
    compute_relative_path, format_markdown_link_href, format_wiki_target, resolve_wiki_target,
    rewrite_links,
};
use std::collections::HashMap;

// --- compute_relative_path ---

#[test]
fn compute_relative_path_sibling() {
    assert_eq!(compute_relative_path("docs", "docs/target"), "target");
}

#[test]
fn compute_relative_path_nested() {
    assert_eq!(
        compute_relative_path("docs", "docs/sub/target"),
        "./sub/target"
    );
}

#[test]
fn compute_relative_path_up() {
    assert_eq!(
        compute_relative_path("docs/sub", "docs/target"),
        "../target"
    );
}

#[test]
fn compute_relative_path_different_tree() {
    assert_eq!(
        compute_relative_path("docs/sub", "other/target"),
        "../../other/target"
    );
}

#[test]
fn compute_relative_path_from_root() {
    assert_eq!(compute_relative_path("", "docs/target"), "./docs/target");
}

#[test]
fn compute_relative_path_deeply_nested() {
    assert_eq!(
        compute_relative_path("a/b/c", "x/y/z/target"),
        "../../../x/y/z/target"
    );
}

// --- resolve_wiki_target ---

#[test]
fn resolve_bare_name_from_vault_root() {
    assert_eq!(
        resolve_wiki_target("docs/source.md", "note"),
        Some("note.md".to_string())
    );
}

#[test]
fn resolve_bare_name_from_deeply_nested_source() {
    assert_eq!(
        resolve_wiki_target("a/b/c/source.md", "note"),
        Some("note.md".to_string())
    );
}

#[test]
fn resolve_slash_path_from_vault_root() {
    assert_eq!(
        resolve_wiki_target("docs/source.md", "folder/note"),
        Some("folder/note.md".to_string())
    );
}

#[test]
fn resolve_deep_slash_path_from_vault_root() {
    assert_eq!(
        resolve_wiki_target("x/source.md", "a/b/c/note"),
        Some("a/b/c/note.md".to_string())
    );
}

#[test]
fn resolve_dot_slash_note_relative() {
    assert_eq!(
        resolve_wiki_target("docs/source.md", "./sibling"),
        Some("docs/sibling.md".to_string())
    );
}

#[test]
fn resolve_dot_slash_nested_subfolder() {
    assert_eq!(
        resolve_wiki_target("docs/source.md", "./sub/child"),
        Some("docs/sub/child.md".to_string())
    );
}

#[test]
fn resolve_dotdot_note_relative() {
    assert_eq!(
        resolve_wiki_target("docs/sub/source.md", "../note"),
        Some("docs/note.md".to_string())
    );
}

#[test]
fn resolve_dotdot_multiple_levels() {
    assert_eq!(
        resolve_wiki_target("a/b/c/source.md", "../../note"),
        Some("a/note.md".to_string())
    );
}

#[test]
fn resolve_absolute_from_vault_root() {
    assert_eq!(
        resolve_wiki_target("x/y/source.md", "/abc/note"),
        Some("abc/note.md".to_string())
    );
}

#[test]
fn resolve_vault_escape_returns_none() {
    assert_eq!(resolve_wiki_target("source.md", "../escape"), None);
}

#[test]
fn resolve_deep_vault_escape_returns_none() {
    assert_eq!(
        resolve_wiki_target("a/b/source.md", "../../../../escape"),
        None
    );
}

#[test]
fn resolve_target_with_md_extension_already() {
    assert_eq!(
        resolve_wiki_target("source.md", "note.md"),
        Some("note.md".to_string())
    );
}

#[test]
fn resolve_empty_target_returns_none() {
    assert_eq!(resolve_wiki_target("source.md", ""), None);
}

#[test]
fn resolve_only_slash_returns_none() {
    assert_eq!(resolve_wiki_target("source.md", "/"), None);
}

#[test]
fn resolve_target_with_spaces() {
    assert_eq!(
        resolve_wiki_target("source.md", "my notes/todo list"),
        Some("my notes/todo list.md".to_string())
    );
}

#[test]
fn resolve_root_source_with_dot_slash() {
    assert_eq!(
        resolve_wiki_target("source.md", "./local"),
        Some("local.md".to_string())
    );
}

#[test]
fn resolve_dot_slash_from_root_escapes() {
    assert_eq!(resolve_wiki_target("source.md", "../outside"), None);
}

// --- format_wiki_target ---

#[test]
fn format_wiki_target_vault_relative() {
    assert_eq!(
        format_wiki_target("docs/source.md", "docs/target.md", false),
        "docs/target"
    );
}

#[test]
fn format_wiki_target_vault_relative_simple() {
    assert_eq!(
        format_wiki_target("source.md", "note.md", false),
        "note"
    );
}

#[test]
fn format_wiki_target_note_relative_sibling() {
    assert_eq!(
        format_wiki_target("docs/source.md", "docs/target.md", true),
        "./target"
    );
}

#[test]
fn format_wiki_target_note_relative_parent() {
    assert_eq!(
        format_wiki_target("docs/sub/source.md", "docs/target.md", true),
        "../target"
    );
}

#[test]
fn format_wiki_target_note_relative_from_root() {
    assert_eq!(
        format_wiki_target("source.md", "docs/target.md", true),
        "docs/target"
    );
}

#[test]
fn format_wiki_target_note_relative_sibling_at_root() {
    assert_eq!(
        format_wiki_target("source.md", "target.md", true),
        "target"
    );
}

#[test]
fn format_wiki_target_note_relative_deep_traversal() {
    assert_eq!(
        format_wiki_target("a/b/source.md", "x/y/target.md", true),
        "../../x/y/target"
    );
}

// --- format_markdown_link_href ---

#[test]
fn format_md_href_sibling() {
    assert_eq!(
        format_markdown_link_href("docs/source.md", "docs/target.md"),
        "target.md"
    );
}

#[test]
fn format_md_href_cross_folder() {
    assert_eq!(
        format_markdown_link_href("docs/source.md", "other/target.md"),
        "../other/target.md"
    );
}

#[test]
fn format_md_href_from_root() {
    assert_eq!(
        format_markdown_link_href("source.md", "docs/target.md"),
        "docs/target.md"
    );
}

#[test]
fn format_md_href_same_file() {
    assert_eq!(
        format_markdown_link_href("docs/source.md", "docs/source.md"),
        "source.md"
    );
}

// --- rewrite_links: wiki links ---

#[test]
fn rewrite_wiki_link_vault_relative() {
    let mut map = HashMap::new();
    map.insert("docs/old.md".into(), "docs/new.md".into());
    let result = rewrite_links("[[docs/old]]", "x/source.md", "x/source.md", &map);
    assert!(result.changed);
    assert_eq!(result.markdown, "[[docs/new]]");
}

#[test]
fn rewrite_wiki_link_preserves_label() {
    let mut map = HashMap::new();
    map.insert("docs/old.md".into(), "docs/new.md".into());
    let result =
        rewrite_links("[[docs/old|Custom Label]]", "x/source.md", "x/source.md", &map);
    assert!(result.changed);
    assert_eq!(result.markdown, "[[docs/new|Custom Label]]");
}

#[test]
fn rewrite_wiki_link_note_relative_preserves_format() {
    let mut map = HashMap::new();
    map.insert("docs/old.md".into(), "docs/new.md".into());
    let result = rewrite_links("[[./old]]", "docs/source.md", "docs/source.md", &map);
    assert!(result.changed);
    assert_eq!(result.markdown, "[[./new]]");
}

#[test]
fn rewrite_wiki_link_parent_relative_preserves_format() {
    let mut map = HashMap::new();
    map.insert("docs/old.md".into(), "archive/old.md".into());
    let result = rewrite_links("[[../old]]", "docs/sub/source.md", "docs/sub/source.md", &map);
    assert!(result.changed);
    assert_eq!(result.markdown, "[[../../archive/old]]");
}

#[test]
fn vault_relative_wiki_unchanged_on_source_move() {
    let map = HashMap::new();
    let result = rewrite_links(
        "[[sibling]]",
        "docs/source.md",
        "archive/source.md",
        &map,
    );
    assert!(!result.changed);
}

#[test]
fn note_relative_wiki_rewritten_on_source_move() {
    let map = HashMap::new();
    let result = rewrite_links(
        "[[./sibling]]",
        "docs/source.md",
        "archive/source.md",
        &map,
    );
    assert!(result.changed);
    assert_eq!(result.markdown, "[[../docs/sibling]]");
}

#[test]
fn note_relative_dotdot_wiki_rewritten_on_source_move() {
    let map = HashMap::new();
    let result = rewrite_links(
        "[[../parent_sibling]]",
        "a/b/source.md",
        "x/y/source.md",
        &map,
    );
    assert!(result.changed);
    assert_eq!(result.markdown, "[[../../a/parent_sibling]]");
}

#[test]
fn user_example_gpar_rename() {
    let mut map = HashMap::new();
    map.insert("Gpar/noteB.md".into(), "noteB.md".into());
    map.insert("Gpar/par1/noteA.md".into(), "par1/noteA.md".into());

    let result = rewrite_links(
        "[[../noteB]] and [[Gpar/noteB]]",
        "Gpar/par1/noteA.md",
        "par1/noteA.md",
        &map,
    );
    assert!(result.changed);
    assert_eq!(result.markdown, "[[../noteB]] and [[noteB]]");
}

#[test]
fn batch_rename_multiple_targets() {
    let mut map = HashMap::new();
    map.insert("docs/a.md".into(), "archive/a.md".into());
    map.insert("docs/b.md".into(), "archive/b.md".into());
    let result = rewrite_links(
        "[[docs/a]] then [[docs/b]]",
        "source.md",
        "source.md",
        &map,
    );
    assert!(result.changed);
    assert_eq!(result.markdown, "[[archive/a]] then [[archive/b]]");
}

#[test]
fn mixed_wiki_and_markdown_links_rewrite() {
    let mut map = HashMap::new();
    map.insert("old.md".into(), "new.md".into());
    let result = rewrite_links(
        "[[old]] and [label](old.md)",
        "source.md",
        "source.md",
        &map,
    );
    assert!(result.changed);
    assert_eq!(result.markdown, "[[new]] and [label](new.md)");
}

// --- rewrite_links: markdown links ---

#[test]
fn rewrite_markdown_link_vault_relative_target() {
    let mut map = HashMap::new();
    map.insert("docs/old.md".into(), "docs/new.md".into());
    let result = rewrite_links(
        "[label](docs/old.md)",
        "source.md",
        "source.md",
        &map,
    );
    assert!(result.changed);
    assert_eq!(result.markdown, "[label](docs/new.md)");
}

#[test]
fn rewrite_markdown_link_vault_relative_from_deep_source() {
    let mut map = HashMap::new();
    map.insert("note.md".into(), "note2.md".into());
    let result = rewrite_links(
        "[note](note.md)",
        "a/b/c/deep.md",
        "a/b/c/deep.md",
        &map,
    );
    assert!(result.changed);
    assert_eq!(result.markdown, "[note](note2.md)");
}

#[test]
fn rewrite_markdown_link_note_relative_target() {
    let mut map = HashMap::new();
    map.insert("docs/old.md".into(), "notes/new.md".into());
    let result = rewrite_links(
        "[Old](../old.md)",
        "docs/sub/source.md",
        "docs/sub/source.md",
        &map,
    );
    assert!(result.changed);
    assert_eq!(result.markdown, "[Old](../../notes/new.md)");
}

#[test]
fn rewrite_markdown_link_preserves_angle_wrapping_for_spaced_target() {
    let mut map = HashMap::new();
    map.insert(
        "Folder10/a cappella surgical gown.md".into(),
        "Folder0/a cappella surgical gown.md".into(),
    );
    let result = rewrite_links(
        "[ref](<Folder10/a cappella surgical gown.md>)",
        "Folder3/a cappella magnetic recorder.md",
        "Folder3/a cappella magnetic recorder.md",
        &map,
    );
    assert!(result.changed);
    assert_eq!(
        result.markdown,
        "[ref](<Folder0/a cappella surgical gown.md>)"
    );
}

#[test]
fn vault_relative_markdown_link_unchanged_on_source_move() {
    let map = HashMap::new();
    let result = rewrite_links(
        "[label](sibling.md)",
        "docs/source.md",
        "archive/source.md",
        &map,
    );
    assert!(!result.changed);
}

#[test]
fn note_relative_markdown_link_rewritten_on_source_move() {
    let map = HashMap::new();
    let result = rewrite_links(
        "[label](./sibling.md)",
        "docs/source.md",
        "archive/source.md",
        &map,
    );
    assert!(result.changed);
    assert_eq!(result.markdown, "[label](../docs/sibling.md)");
}

// --- rewrite_links: skip scenarios ---

#[test]
fn skip_code_block() {
    let mut map = HashMap::new();
    map.insert("old.md".into(), "new.md".into());
    let md = "```\n[[old]]\n```";
    let result = rewrite_links(md, "docs/source.md", "docs/source.md", &map);
    assert!(!result.changed);
}

#[test]
fn skip_inline_code() {
    let mut map = HashMap::new();
    map.insert("old.md".into(), "new.md".into());
    let result = rewrite_links("`[[old]]`", "docs/source.md", "docs/source.md", &map);
    assert!(!result.changed);
}

#[test]
fn skip_image_embed() {
    let mut map = HashMap::new();
    map.insert("old.md".into(), "new.md".into());
    let result = rewrite_links("![[old]]", "docs/source.md", "docs/source.md", &map);
    assert!(!result.changed);
}

#[test]
fn skip_external_url() {
    let mut map = HashMap::new();
    map.insert("docs/old.md".into(), "docs/new.md".into());
    let result = rewrite_links(
        "[label](https://example.com/old.md)",
        "docs/source.md",
        "docs/source.md",
        &map,
    );
    assert!(!result.changed);
}

#[test]
fn skip_fenced_code_with_language() {
    let mut map = HashMap::new();
    map.insert("old.md".into(), "new.md".into());
    let md = "```markdown\n[[old]]\n```";
    let result = rewrite_links(md, "source.md", "source.md", &map);
    assert!(!result.changed);
}

#[test]
fn no_change_when_nothing_matches() {
    let map = HashMap::new();
    let result = rewrite_links(
        "[[unrelated]] and [text](other.md)",
        "docs/source.md",
        "docs/source.md",
        &map,
    );
    assert!(!result.changed);
}

#[test]
fn no_change_when_map_is_empty_and_source_didnt_move() {
    let map = HashMap::new();
    let result = rewrite_links(
        "[[note]] and [[./local]] and [text](./link.md)",
        "docs/source.md",
        "docs/source.md",
        &map,
    );
    assert!(!result.changed);
}

// --- rewrite_links: multiple links in document ---

#[test]
fn rewrite_multiple_links_across_paragraphs() {
    let mut map = HashMap::new();
    map.insert("old.md".into(), "new.md".into());
    let md = "First [[old]]\n\nSecond [[old]]";
    let result = rewrite_links(md, "source.md", "source.md", &map);
    assert!(result.changed);
    assert_eq!(result.markdown, "First [[new]]\n\nSecond [[new]]");
}

#[test]
fn rewrite_links_in_list_items() {
    let mut map = HashMap::new();
    map.insert("old.md".into(), "new.md".into());
    let md = "- item [[old]]\n- item [[old]]";
    let result = rewrite_links(md, "source.md", "source.md", &map);
    assert!(result.changed);
    assert_eq!(result.markdown, "- item [[new]]\n- item [[new]]");
}

// --- rewrite_links: complex rename scenario ---

#[test]
fn folder_move_with_mixed_link_formats() {
    let mut map = HashMap::new();
    map.insert("project/docs/readme.md".into(), "archive/docs/readme.md".into());
    map.insert("project/src/main.md".into(), "archive/src/main.md".into());

    let md = "See [[project/docs/readme]] and [[./main]]";
    let result = rewrite_links(
        md,
        "project/src/index.md",
        "archive/src/index.md",
        &map,
    );
    assert!(result.changed);
    assert_eq!(
        result.markdown,
        "See [[archive/docs/readme]] and [[./main]]"
    );
}

#[test]
fn note_relative_outlink_simplified_when_source_moves_to_root() {
    let mut map = HashMap::new();
    map.insert("a/b/noteA.md".into(), "noteA.md".into());

    let result = rewrite_links(
        "[[../../Testing]]",
        "a/b/noteA.md",
        "noteA.md",
        &map,
    );
    assert!(result.changed);
    assert_eq!(result.markdown, "[[Testing]]");
}

#[test]
fn note_relative_outlink_with_md_ext_simplified_when_source_moves_to_root() {
    let mut map = HashMap::new();
    map.insert("a/b/noteA.md".into(), "noteA.md".into());

    let result = rewrite_links(
        "[[../../Testing.md]]",
        "a/b/noteA.md",
        "noteA.md",
        &map,
    );
    assert!(result.changed);
    assert_eq!(result.markdown, "[[Testing]]");
}

#[test]
fn commonmark_note_relative_outlink_rewritten_on_source_move() {
    let mut map = HashMap::new();
    map.insert("a/b/noteA.md".into(), "noteA.md".into());

    let result = rewrite_links(
        "[../../Testing](../../Testing.md)",
        "a/b/noteA.md",
        "noteA.md",
        &map,
    );
    assert!(result.changed, "expected rewrite but got no change");
    assert_eq!(result.markdown, "[../../Testing](Testing.md)");
}

#[test]
fn source_and_target_both_moved() {
    let mut map = HashMap::new();
    map.insert("a/target.md".into(), "b/target.md".into());
    map.insert("a/source.md".into(), "c/source.md".into());

    let result = rewrite_links(
        "[[a/target]] and [[./target]]",
        "a/source.md",
        "c/source.md",
        &map,
    );
    assert!(result.changed);
    assert_eq!(result.markdown, "[[b/target]] and [[../b/target]]");
}
