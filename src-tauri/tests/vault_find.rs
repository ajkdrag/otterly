use crate::features::search::service::{replace_vault_file, ReplaceSkipReason, VaultReplaceFile};
use crate::features::search::vault_find::{
    content_hash, find_in_text, find_in_vault, replace_in_text, CompiledFind, FindError, FindQuery,
    FindSpec, PathFilter, VaultFindEvent, VaultFindFile, VaultFindRequest, MAX_MATCHES,
};
use std::fs;
use std::path::Path;
use std::sync::atomic::AtomicBool;
use std::time::{Duration, Instant};
use tempfile::TempDir;

fn literal(text: &str) -> FindSpec {
    FindSpec {
        text: text.to_string(),
        regex: false,
        case_sensitive: false,
        whole_word: false,
    }
}

fn regex(text: &str) -> FindSpec {
    FindSpec {
        regex: true,
        ..literal(text)
    }
}

fn query(spec: FindSpec) -> FindQuery {
    FindQuery::compile(&spec).expect("query should compile")
}

fn matched_texts(text: &str, spec: FindSpec) -> Vec<String> {
    find_in_text(text, &query(spec))
        .into_iter()
        .map(|m| m.text)
        .collect()
}

fn positions(text: &str, spec: FindSpec) -> Vec<(usize, usize, usize)> {
    find_in_text(text, &query(spec))
        .into_iter()
        .map(|m| (m.line, m.column, m.length))
        .collect()
}

fn write_file(root: &Path, rel: &str, content: &[u8]) {
    let path = root.join(rel);
    fs::create_dir_all(path.parent().unwrap()).unwrap();
    fs::write(path, content).unwrap();
}

struct FindRun {
    files: Vec<VaultFindFile>,
    match_count: usize,
    truncated: bool,
}

fn run_find(root: &Path, text: &str, include: &str, exclude: &str) -> FindRun {
    let request = VaultFindRequest {
        spec: literal(text),
        include: include.to_string(),
        exclude: exclude.to_string(),
    };
    let find = CompiledFind::from_request(&request).expect("request should compile");
    let mut run = FindRun {
        files: Vec::new(),
        match_count: 0,
        truncated: false,
    };
    let cancel = AtomicBool::new(false);
    find_in_vault(root, &find, &cancel, |event| match event {
        VaultFindEvent::Files { files, .. } => run.files.extend(files),
        VaultFindEvent::Done {
            match_count,
            truncated,
            ..
        } => {
            run.match_count = match_count;
            run.truncated = truncated;
        }
    });
    run.files.sort_by(|a, b| a.path.cmp(&b.path));
    run
}

fn found_paths(run: &FindRun) -> Vec<&str> {
    run.files.iter().map(|f| f.path.as_str()).collect()
}

#[test]
fn literal_mode_escapes_regex_syntax_and_ignores_case_by_default() {
    let text = "a.b axb A.B";
    assert_eq!(matched_texts(text, literal("a.b")), ["a.b", "A.B"]);
    assert_eq!(matched_texts(text, regex("a.b")), ["a.b", "axb", "A.B"]);
}

#[test]
fn case_sensitive_and_whole_word_narrow_the_matches() {
    let text = "Cat cat concat cats";
    let case_sensitive = FindSpec {
        case_sensitive: true,
        ..literal("cat")
    };
    assert_eq!(
        positions(text, case_sensitive),
        [(1, 4, 3), (1, 11, 3), (1, 15, 3)]
    );
    let whole_word = FindSpec {
        whole_word: true,
        ..literal("cat")
    };
    assert_eq!(matched_texts(text, whole_word), ["Cat", "cat"]);
    let whole_word_alternation = FindSpec {
        whole_word: true,
        ..regex("cat|cats")
    };
    assert_eq!(
        matched_texts(text, whole_word_alternation),
        ["Cat", "cat", "cats"]
    );
}

// The find bar builds the same Unicode word boundary (find.ts word_boundary).
#[test]
fn whole_word_uses_unicode_word_boundaries() {
    let whole_word = |text: &str| FindSpec {
        whole_word: true,
        ..literal(text)
    };
    assert_eq!(
        matched_texts("café cafés Café", whole_word("café")),
        ["café", "Café"]
    );
    assert_eq!(
        matched_texts("привет приветствие", whole_word("привет")),
        ["привет"]
    );
}

// The find bar accepts the same escapes (find.ts allow_punctuation_escapes).
// Lookaround is the other direction: JS has it, so only the vault find says no.
#[test]
fn regex_mode_accepts_escaped_punctuation_but_not_lookaround() {
    assert_eq!(
        matched_texts("#todo a-b a_b", regex(r"\#\w+|a\-b|a\_b")),
        ["#todo", "a-b", "a_b"]
    );
    assert!(matches!(
        FindQuery::compile(&regex(r"foo(?=bar)")),
        Err(FindError::InvalidQuery(_))
    ));
}

#[test]
fn invalid_and_multiline_queries_are_rejected() {
    assert!(matches!(
        FindQuery::compile(&regex("(unclosed")),
        Err(FindError::InvalidQuery(_))
    ));
    let whole_word_injection = FindSpec {
        whole_word: true,
        ..regex("a)|(b")
    };
    assert!(matches!(
        FindQuery::compile(&whole_word_injection),
        Err(FindError::InvalidQuery(_))
    ));
    assert!(matches!(
        FindQuery::compile(&literal("two\nlines")),
        Err(FindError::InvalidQuery(_))
    ));
    assert!(matches!(
        PathFilter::compile("{unclosed", ""),
        Err(FindError::InvalidGlob(_))
    ));
}

#[test]
fn patterns_never_cross_lines_and_anchors_are_per_line() {
    let text = "foo\nbar\nfoo bar";
    assert_eq!(positions(text, regex(r"foo\s+bar")), [(3, 0, 7)]);
    assert_eq!(
        positions(text, regex("[^x]+")),
        [(1, 0, 3), (2, 0, 3), (3, 0, 7)]
    );
    assert_eq!(positions(text, regex("^bar")), [(2, 0, 3)]);
    assert_eq!(positions(text, regex("foo$")), [(1, 0, 3)]);
}

#[test]
fn a_pattern_that_can_cross_lines_scans_a_big_file_in_linear_time() {
    // `[^|]+\|` can match "\n", so the whole-file prefilter says yes, yet only
    // the last line has a "|". Retrying from the whole file after every line
    // that fails made this quadratic.
    let mut text = "plain note line\n".repeat(20_000);
    text.push_str("a|b\n");

    let started = Instant::now();
    let found = positions(&text, regex(r"[^|]+\|"));

    assert_eq!(found, [(20_001, 0, 2)]);
    assert!(started.elapsed() < Duration::from_secs(5));
}

#[test]
fn crlf_and_bom_do_not_shift_columns_or_leak_into_matches() {
    let text = "\u{feff}foo x\r\nbar foo\r\n";
    assert_eq!(positions(text, regex("^foo")), [(1, 0, 3)]);
    assert_eq!(positions(text, regex("foo$")), [(2, 4, 3)]);
    assert_eq!(matched_texts(text, regex("x.*")), ["x"]);
}

#[test]
fn columns_and_lengths_count_utf16_units() {
    let text = "😀 é foo 😀foo";
    assert_eq!(positions(text, literal("foo")), [(1, 5, 3), (1, 11, 3)]);
    assert_eq!(positions(text, literal("😀")), [(1, 0, 2), (1, 9, 2)]);
}

#[test]
fn empty_matches_are_ignored() {
    assert!(positions("abc\n\nxyz", regex("^")).is_empty());
    assert_eq!(matched_texts("baab", regex("a*")), ["aa"]);
    let replaced = replace_in_text("baab", &query(regex("a*")), "-", &[0]);
    assert_eq!(replaced.text, "b-b");
}

#[test]
fn previews_clip_long_lines_around_the_match() {
    let line = format!("{}needle{}", "x".repeat(100), "y".repeat(300));
    let found = find_in_text(&line, &query(literal("needle")));
    let only = &found[0];
    assert_eq!(only.before, format!("…{}", "x".repeat(60)));
    assert_eq!(only.text, "needle");
    assert!(only.groups.is_empty());
    assert_eq!(
        only.before.chars().count() + only.text.chars().count() + only.after.chars().count(),
        200
    );
}

#[test]
fn regex_matches_carry_their_capture_groups_for_the_replacement_preview() {
    let pattern = query(regex(r"(?<y>\d{4})-(\d{2})(x)?"));
    let found = find_in_text("2026-10-24", &pattern);
    assert_eq!(
        found[0].groups,
        [Some("2026".to_string()), Some("10".to_string()), None]
    );
    assert_eq!(pattern.group_names(), [Some("y".to_string()), None, None]);

    let literal_found = find_in_text("2026-10", &query(literal("2026")));
    assert!(literal_found[0].groups.is_empty());
}

#[test]
fn replace_keeps_crlf_and_bom_and_only_touches_selected_ordinals() {
    let text = "\u{feff}foo one\r\nfoo two\r\nfoo three\r\n";
    let replaced = replace_in_text(text, &query(literal("foo")), "bar", &[0, 2]);
    assert_eq!(replaced.count, 2);
    assert_eq!(replaced.text, "\u{feff}bar one\r\nfoo two\r\nbar three\r\n");
    let remaining: Vec<_> = replaced.remaining.iter().map(|m| m.line).collect();
    assert_eq!(remaining, [2]);
}

#[test]
fn literal_replace_inserts_dollar_signs_as_is() {
    let replaced = replace_in_text("price", &query(literal("price")), "$1 $$", &[0]);
    assert_eq!(replaced.text, "$1 $$");
}

#[test]
fn regex_replace_expands_captures() {
    let replaced = replace_in_text(
        "[[old]] and [[other]]",
        &query(regex(r"\[\[(\w+)\]\]")),
        "[[$1-new]]",
        &[0, 1],
    );
    assert_eq!(replaced.text, "[[old-new]] and [[other-new]]");
}

#[test]
fn include_globs_match_at_any_depth_and_bare_names_match_folders() {
    let tmp = TempDir::new().unwrap();
    let root = tmp.path();
    write_file(root, "top.md", b"needle");
    write_file(root, "notes/deep/a.md", b"needle");
    write_file(root, "notes/deep/a.txt", b"needle");
    write_file(root, "daily/2026.txt", b"needle");
    write_file(root, "other/daily.md", b"needle");

    let only_md = run_find(root, "needle", "*.md", "");
    assert_eq!(
        found_paths(&only_md),
        ["notes/deep/a.md", "other/daily.md", "top.md"]
    );

    let daily = run_find(root, "needle", "DAILY", "");
    assert_eq!(found_paths(&daily), ["daily/2026.txt"]);

    let rooted = run_find(root, "needle", "./notes", "");
    assert_eq!(
        found_paths(&rooted),
        ["notes/deep/a.md", "notes/deep/a.txt"]
    );

    let braces = run_find(root, "needle", "deep/*.{md,txt}, top.md", "");
    assert_eq!(
        found_paths(&braces),
        ["notes/deep/a.md", "notes/deep/a.txt", "top.md"]
    );
}

#[test]
fn exclude_globs_prune_folders_and_skip_files() {
    let tmp = TempDir::new().unwrap();
    let root = tmp.path();
    write_file(root, "keep.md", b"needle");
    write_file(root, "archive/old.md", b"needle");
    write_file(root, "nested/archive/old.md", b"needle");
    write_file(root, "nested/skip.txt", b"needle");

    let run = run_find(root, "needle", "", "archive, *.txt");
    assert_eq!(found_paths(&run), ["keep.md"]);
}

#[test]
fn app_folders_temp_files_binaries_and_invalid_utf8_are_skipped() {
    let tmp = TempDir::new().unwrap();
    let root = tmp.path();
    write_file(root, "note.md", b"needle");
    write_file(root, ".hidden/visible.md", b"needle");
    write_file(root, ".otterly/cache.md", b"needle");
    write_file(root, ".git/HEAD", b"needle");
    write_file(root, "1791147521383.0.tmp", b"needle");
    write_file(root, "image.png", b"needle");
    write_file(root, "nul.bin", b"needle\0needle");
    write_file(root, "latin1.txt", b"needle \xe9");
    write_file(root, "code.ts", b"const needle = 1;");

    let run = run_find(root, "needle", "", "");
    assert_eq!(
        found_paths(&run),
        [".hidden/visible.md", "code.ts", "note.md"]
    );
}

#[test]
fn an_include_of_everything_still_skips_app_folders() {
    let tmp = TempDir::new().unwrap();
    let root = tmp.path();
    write_file(root, "note.md", b"needle");
    write_file(root, ".otterly/cache.md", b"needle");
    write_file(root, ".git/HEAD", b"needle");
    write_file(root, "sub/.git/config", b"needle");

    let run = run_find(root, "needle", "**", "");
    assert_eq!(found_paths(&run), ["note.md"]);
}

#[cfg(unix)]
#[test]
fn symlinks_are_not_followed() {
    let tmp = TempDir::new().unwrap();
    let outside = TempDir::new().unwrap();
    let root = tmp.path();
    write_file(root, "real/note.md", b"needle");
    write_file(outside.path(), "secret.md", b"needle");
    std::os::unix::fs::symlink(outside.path(), root.join("linked_folder")).unwrap();
    std::os::unix::fs::symlink(root.join("real"), root.join("linked_inside")).unwrap();
    std::os::unix::fs::symlink(root.join("real/note.md"), root.join("linked_file.md")).unwrap();

    let run = run_find(root, "needle", "", "");
    assert_eq!(found_paths(&run), ["real/note.md"]);
}

#[test]
fn hitting_the_match_cap_truncates_the_results() {
    let tmp = TempDir::new().unwrap();
    let root = tmp.path();
    let line = "x ".repeat(MAX_MATCHES / 2);
    write_file(root, "a.md", line.as_bytes());
    write_file(root, "b.md", line.as_bytes());
    write_file(root, "c.md", line.as_bytes());

    let run = run_find(root, "x", "", "");
    let total: usize = run.files.iter().map(|f| f.matches.len()).sum();
    assert!(run.truncated);
    assert_eq!(run.match_count, MAX_MATCHES);
    assert_eq!(total, MAX_MATCHES);
}

// Thousands of notes, so the results cross many 50 ms batches and come from
// all of ignore's worker threads. Every hit must arrive exactly once.
#[test]
fn a_vault_of_several_thousand_notes_streams_every_hit() {
    let tmp = TempDir::new().unwrap();
    let root = tmp.path();
    let filler = "A line of plain note text that does not match.\n".repeat(40);
    let note_count = 5_000;
    for idx in 0..note_count {
        let body = if idx % 10 == 0 {
            format!("{filler}the needle is here, and a Needle again\n")
        } else {
            filler.clone()
        };
        write_file(
            root,
            &format!("folder_{}/note_{idx}.md", idx % 50),
            body.as_bytes(),
        );
    }

    let started = Instant::now();
    let run = run_find(root, "needle", "", "");

    assert!(started.elapsed() < Duration::from_secs(20));
    assert_eq!(run.files.len(), note_count / 10);
    assert_eq!(run.match_count, note_count / 10 * 2);
    assert!(!run.truncated);
    assert!(run.files.iter().all(|file| file.matches.len() == 2));
    assert!(run
        .files
        .windows(2)
        .all(|pair| pair[0].path != pair[1].path));
}

#[test]
fn results_carry_the_hash_that_replace_checks() {
    let tmp = TempDir::new().unwrap();
    let root = tmp.path();
    write_file(root, "note.md", b"foo\r\nfoo\r\n");
    let run = run_find(root, "foo", "", "");
    let found = &run.files[0];
    assert_eq!(found.content_hash, content_hash("foo\r\nfoo\r\n"));

    let replace = VaultReplaceFile {
        path: "note.md".to_string(),
        content_hash: found.content_hash.clone(),
        match_indexes: vec![1],
    };
    let replaced = replace_vault_file(root, &replace, &query(literal("foo")), "bar", &[])
        .expect("replace should succeed");
    assert_eq!(replaced.count, 1);
    assert_eq!(
        fs::read_to_string(root.join("note.md")).unwrap(),
        "foo\r\nbar\r\n"
    );
    let remaining = replaced.remaining.expect("one match should remain");
    assert_eq!(remaining.matches.len(), 1);
    assert_eq!(remaining.content_hash, content_hash("foo\r\nbar\r\n"));
}

#[test]
fn replace_refuses_a_file_that_changed_since_the_search() {
    let tmp = TempDir::new().unwrap();
    let root = tmp.path();
    write_file(root, "note.md", b"foo edited");
    let replace = VaultReplaceFile {
        path: "note.md".to_string(),
        content_hash: content_hash("foo"),
        match_indexes: vec![0],
    };
    let result = replace_vault_file(root, &replace, &query(literal("foo")), "bar", &[]);
    assert_eq!(result.err(), Some(ReplaceSkipReason::Changed));
    assert_eq!(
        fs::read_to_string(root.join("note.md")).unwrap(),
        "foo edited"
    );

    let missing = VaultReplaceFile {
        path: "gone.md".to_string(),
        ..replace
    };
    let result = replace_vault_file(root, &missing, &query(literal("foo")), "bar", &[]);
    assert_eq!(result.err(), Some(ReplaceSkipReason::Missing));
}

#[test]
fn replace_skips_a_file_that_a_document_window_has_open() {
    let tmp = TempDir::new().unwrap();
    let root = tmp.path();
    write_file(root, "open.md", b"foo");
    write_file(root, "closed.md", b"foo");
    let open_documents = [root.join("open.md").canonicalize().unwrap()];
    let target = |path: &str| VaultReplaceFile {
        path: path.to_string(),
        content_hash: content_hash("foo"),
        match_indexes: vec![0],
    };

    let open = replace_vault_file(
        root,
        &target("open.md"),
        &query(literal("foo")),
        "bar",
        &open_documents,
    );
    assert_eq!(open.err(), Some(ReplaceSkipReason::OpenInWindow));
    assert_eq!(fs::read_to_string(root.join("open.md")).unwrap(), "foo");

    let closed = replace_vault_file(
        root,
        &target("closed.md"),
        &query(literal("foo")),
        "bar",
        &open_documents,
    );
    assert!(closed.is_ok());
    assert_eq!(fs::read_to_string(root.join("closed.md")).unwrap(), "bar");
}
