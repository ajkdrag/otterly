// Vault find: walk a vault, match a query line by line, and replace matches in
// one file's text. No tauri in here, so the tests drive it with a temp dir.
//
//   let find = CompiledFind::from_request(&request)?;
//   find_in_vault(&vault_root, &find, &cancel, |event| channel.send(event));
//
//   let query = FindQuery::compile(&spec)?;
//   let replaced = replace_in_text(&text, &query, "bar", &[0, 2]);
//
// Matching follows ripgrep's line semantics: `\s` and `[^x]` never cross a
// line, `^` and `$` anchor lines. Empty matches (`^`, `a*`) are ignored.

use crate::shared::{constants, storage};
use globset::{GlobBuilder, GlobSet, GlobSetBuilder};
use ignore::{WalkBuilder, WalkState};
use mime_guess::mime;
use regex::{Captures, Regex, RegexBuilder};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::fmt;
use std::fs::File;
use std::io::Read;
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{self, Receiver, RecvTimeoutError, Sender};
use std::time::{Duration, Instant};

pub const MAX_MATCHES: usize = 10_000;
const FLUSH_INTERVAL: Duration = Duration::from_millis(50);
const MAX_FILE_BYTES: u64 = 20 * 1024 * 1024;
const BINARY_SNIFF_BYTES: u64 = 8 * 1024;
const PREVIEW_BEFORE_CHARS: usize = 60;
const PREVIEW_MAX_CHARS: usize = 200;
const BOM: char = '\u{feff}';

#[derive(Debug, Clone, Deserialize)]
pub struct FindSpec {
    pub text: String,
    pub regex: bool,
    pub case_sensitive: bool,
    pub whole_word: bool,
}

#[derive(Debug, Clone, Deserialize)]
pub struct VaultFindRequest {
    #[serde(flatten)]
    pub spec: FindSpec,
    pub include: String,
    pub exclude: String,
}

// line is 1-based. column and length are UTF-16 units in the line, which is
// what the editor uses. The BOM is not part of line 1.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct VaultFindMatch {
    pub line: usize,
    pub column: usize,
    pub length: usize,
    pub before: String,
    pub text: String,
    pub after: String,
    // Capture groups 1..n for the replacement preview, in regex mode only
    // (empty otherwise). Group 0 is `text`. Each group is clipped like `text`.
    pub groups: Vec<Option<String>>,
}

#[derive(Debug, Clone, Serialize)]
pub struct VaultFindFile {
    pub path: String,
    pub content_hash: String,
    pub matches: Vec<VaultFindMatch>,
}

#[derive(Debug, Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum VaultFindEvent {
    Files {
        files: Vec<VaultFindFile>,
        // Names of capture groups 1..n, aligned with VaultFindMatch::groups.
        group_names: Vec<Option<String>>,
    },
    Done {
        match_count: usize,
        truncated: bool,
        elapsed_ms: u64,
    },
}

#[derive(Debug, PartialEq)]
pub enum FindError {
    InvalidQuery(String),
    InvalidGlob(String),
}

// The prefix is the IPC contract: the frontend splits on the first ':'.
impl fmt::Display for FindError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            FindError::InvalidQuery(message) => write!(f, "invalid_query:{message}"),
            FindError::InvalidGlob(message) => write!(f, "invalid_glob:{message}"),
        }
    }
}

pub struct FindQuery {
    regex: Regex,
    expand_captures: bool,
}

impl FindQuery {
    pub fn compile(spec: &FindSpec) -> Result<FindQuery, FindError> {
        if spec.text.is_empty() {
            return Err(FindError::InvalidQuery("empty query".to_string()));
        }
        // We match one line at a time, so a pattern with a newline never matches.
        if spec.text.contains('\n') {
            return Err(FindError::InvalidQuery(
                "multiline patterns are not supported".to_string(),
            ));
        }
        let pattern = if spec.regex {
            spec.text.clone()
        } else {
            regex::escape(&spec.text)
        };
        let pattern = if spec.whole_word {
            // Check the bare pattern first: wrapping "a)|(b" would turn an
            // invalid pattern into a valid one.
            if spec.regex {
                Regex::new(&pattern).map_err(|error| FindError::InvalidQuery(error.to_string()))?;
            }
            format!(r"\b(?:{pattern})\b")
        } else {
            pattern
        };
        // multi_line + crlf matter for the whole-file prefilter only: `^` and
        // `$` must accept the same positions there as in a single line.
        let regex = RegexBuilder::new(&pattern)
            .case_insensitive(!spec.case_sensitive)
            .multi_line(true)
            .crlf(true)
            .build()
            .map_err(|error| FindError::InvalidQuery(error.to_string()))?;
        Ok(FindQuery {
            regex,
            expand_captures: spec.regex,
        })
    }

    // Names of capture groups 1..n. Only regex mode has groups.
    pub fn group_names(&self) -> Vec<Option<String>> {
        if !self.expand_captures {
            return Vec::new();
        }
        self.regex
            .capture_names()
            .skip(1)
            .map(|name| name.map(str::to_string))
            .collect()
    }

    // The frontend expands the replacement template itself, so a preview
    // needs the groups and nothing else. Clipping each group to the preview
    // length keeps the first PREVIEW_MAX_CHARS of any expansion exact.
    fn preview_groups(&self, captures: &Captures) -> Vec<Option<String>> {
        if !self.expand_captures {
            return Vec::new();
        }
        captures
            .iter()
            .skip(1)
            .map(|group| {
                group.map(|found| head_chars(found.as_str(), PREVIEW_MAX_CHARS).to_string())
            })
            .collect()
    }

    // Regex mode expands $1, ${1}, $name, ${name}, $$ and $0. Literal mode
    // inserts the replacement as is.
    fn push_replacement(&self, site: &MatchSite, replacement: &str, out: &mut String) {
        if self.expand_captures {
            site.captures.expand(replacement, out);
        } else {
            out.push_str(replacement);
        }
    }
}

// Include and exclude are comma separated globs with VS Code semantics:
//   "*.md", "daily", "notes/*.md"   match at any depth ("**/" is prepended)
//   "./daily", "/daily"             are relative to the vault root
//   a pattern naming a folder matches everything under it
// Matching is case insensitive. An empty include means every file.
pub struct PathFilter {
    include: Option<GlobSet>,
    exclude: Option<GlobSet>,
}

impl PathFilter {
    pub fn compile(include: &str, exclude: &str) -> Result<PathFilter, FindError> {
        Ok(PathFilter {
            include: compile_glob_list(include)?,
            exclude: compile_glob_list(exclude)?,
        })
    }

    fn excludes(&self, rel_path: &str) -> bool {
        self.exclude
            .as_ref()
            .is_some_and(|set| set.is_match(rel_path))
    }

    fn includes_file(&self, rel_path: &str) -> bool {
        self.include
            .as_ref()
            .is_none_or(|set| set.is_match(rel_path))
            && !self.excludes(rel_path)
    }
}

fn compile_glob_list(list: &str) -> Result<Option<GlobSet>, FindError> {
    let mut builder = GlobSetBuilder::new();
    let mut is_empty = true;
    for raw in split_glob_list(list) {
        let pattern = raw.trim().trim_end_matches('/');
        if pattern.is_empty() {
            continue;
        }
        let rooted = pattern
            .strip_prefix("./")
            .or_else(|| pattern.strip_prefix('/'));
        let base = match rooted {
            Some(rest) => rest.to_string(),
            None if pattern == "**" || pattern.starts_with("**/") => pattern.to_string(),
            None => format!("**/{pattern}"),
        };
        for glob in [base.clone(), format!("{base}/**")] {
            let glob = GlobBuilder::new(&glob)
                .case_insensitive(true)
                .literal_separator(true)
                .build()
                .map_err(|error| FindError::InvalidGlob(error.to_string()))?;
            builder.add(glob);
        }
        is_empty = false;
    }
    if is_empty {
        return Ok(None);
    }
    let set = builder
        .build()
        .map_err(|error| FindError::InvalidGlob(error.to_string()))?;
    Ok(Some(set))
}

// Splits on commas outside braces, so "*.{md,txt}, daily" is two patterns.
fn split_glob_list(list: &str) -> Vec<&str> {
    let mut parts = Vec::new();
    let mut brace_depth = 0;
    let mut part_start = 0;
    for (idx, ch) in list.char_indices() {
        match ch {
            '{' => brace_depth += 1,
            '}' if brace_depth > 0 => brace_depth -= 1,
            ',' if brace_depth == 0 => {
                parts.push(&list[part_start..idx]);
                part_start = idx + 1;
            }
            _ => {}
        }
    }
    parts.push(&list[part_start..]);
    parts
}

// Everything one vault find needs, validated up front so the command can
// return invalid_query / invalid_glob before it starts any thread.
pub struct CompiledFind {
    pub query: FindQuery,
    pub paths: PathFilter,
}

impl CompiledFind {
    pub fn from_request(request: &VaultFindRequest) -> Result<CompiledFind, FindError> {
        Ok(CompiledFind {
            query: FindQuery::compile(&request.spec)?,
            paths: PathFilter::compile(&request.include, &request.exclude)?,
        })
    }
}

// Walks the vault on ignore's worker threads and batches results on this
// thread. Emits "files" at most every 50 ms and one "done" at the end. A
// cancelled run still emits "done"; the frontend drops events of old runs.
// Hitting MAX_MATCHES sets `cancel` to stop the walkers.
pub fn find_in_vault(
    vault_root: &Path,
    find: &CompiledFind,
    cancel: &AtomicBool,
    mut emit: impl FnMut(VaultFindEvent),
) {
    let started = Instant::now();
    let group_names = find.query.group_names();
    let (file_tx, file_rx) = mpsc::channel();

    let (match_count, truncated) = std::thread::scope(|scope| {
        scope.spawn(move || walk_vault(vault_root, find, cancel, file_tx));
        collect_files(file_rx, cancel, &group_names, &mut emit)
    });

    emit(VaultFindEvent::Done {
        match_count,
        truncated,
        elapsed_ms: started.elapsed().as_millis() as u64,
    });
}

fn collect_files(
    file_rx: Receiver<VaultFindFile>,
    cancel: &AtomicBool,
    group_names: &[Option<String>],
    emit: &mut impl FnMut(VaultFindEvent),
) -> (usize, bool) {
    let mut batch = Vec::new();
    let mut match_count = 0;
    let mut truncated = false;
    let mut last_flush = Instant::now();
    loop {
        match file_rx.recv_timeout(FLUSH_INTERVAL) {
            Ok(mut file) => {
                let room = MAX_MATCHES - match_count;
                if file.matches.len() > room {
                    file.matches.truncate(room);
                    truncated = true;
                }
                match_count += file.matches.len();
                if !file.matches.is_empty() {
                    batch.push(file);
                }
                if truncated {
                    cancel.store(true, Ordering::Relaxed);
                    break;
                }
            }
            Err(RecvTimeoutError::Timeout) => {
                if cancel.load(Ordering::Relaxed) {
                    break;
                }
            }
            Err(RecvTimeoutError::Disconnected) => break,
        }
        if !batch.is_empty() && last_flush.elapsed() >= FLUSH_INTERVAL {
            emit(VaultFindEvent::Files {
                files: std::mem::take(&mut batch),
                group_names: group_names.to_vec(),
            });
            last_flush = Instant::now();
        }
    }
    if !batch.is_empty() {
        emit(VaultFindEvent::Files {
            files: batch,
            group_names: group_names.to_vec(),
        });
    }
    (match_count, truncated)
}

// Same files the tree shows: hidden files yes, .gitignore no, our own folders
// and temp files no. Symlinks are skipped, like the notes list does.
fn walk_vault(
    vault_root: &Path,
    find: &CompiledFind,
    cancel: &AtomicBool,
    file_tx: Sender<VaultFindFile>,
) {
    WalkBuilder::new(vault_root)
        .standard_filters(false)
        .build_parallel()
        .run(|| {
            let file_tx = file_tx.clone();
            Box::new(move |entry| {
                if cancel.load(Ordering::Relaxed) {
                    return WalkState::Quit;
                }
                // Unreadable folders are skipped quietly, like the tree does.
                let Ok(entry) = entry else {
                    return WalkState::Continue;
                };
                if entry.depth() == 0 {
                    return WalkState::Continue;
                }
                let name = entry.file_name().to_string_lossy();
                if constants::is_excluded_folder(&name) {
                    return WalkState::Skip;
                }
                let Some(file_type) = entry.file_type() else {
                    return WalkState::Continue;
                };
                let rel_path = storage::normalize_relative_path(
                    entry
                        .path()
                        .strip_prefix(vault_root)
                        .unwrap_or(entry.path()),
                );
                if file_type.is_dir() {
                    return if find.paths.excludes(&rel_path) {
                        WalkState::Skip
                    } else {
                        WalkState::Continue
                    };
                }
                if !file_type.is_file()
                    || constants::is_ignored_file(&name)
                    || !find.paths.includes_file(&rel_path)
                {
                    return WalkState::Continue;
                }
                let Ok(Some(text)) = read_searchable_text(entry.path()) else {
                    return WalkState::Continue;
                };
                let matches = find_in_text(&text, &find.query);
                if matches.is_empty() {
                    return WalkState::Continue;
                }
                let file = VaultFindFile {
                    path: rel_path,
                    content_hash: content_hash(&text),
                    matches,
                };
                if file_tx.send(file).is_err() {
                    return WalkState::Quit;
                }
                WalkState::Continue
            })
        });
}

pub fn content_hash(text: &str) -> String {
    blake3::hash(text.as_bytes()).to_hex().to_string()
}

// Ok(None) means "not a text file we search": a known binary extension, NUL
// in the first 8 KB (git's heuristic), over 20 MB, or not UTF-8.
pub fn read_searchable_text(path: &Path) -> std::io::Result<Option<String>> {
    if has_binary_extension(path) {
        return Ok(None);
    }
    let mut file = File::open(path)?;
    let size = file.metadata()?.len();
    if size > MAX_FILE_BYTES {
        return Ok(None);
    }
    let mut bytes = Vec::with_capacity(size as usize);
    (&mut file)
        .take(BINARY_SNIFF_BYTES)
        .read_to_end(&mut bytes)?;
    if bytes.contains(&0) {
        return Ok(None);
    }
    file.read_to_end(&mut bytes)?;
    Ok(String::from_utf8(bytes).ok())
}

// Saves reading big media files. Unknown extensions fall through to the NUL
// check.
fn has_binary_extension(path: &Path) -> bool {
    let Some(guess) = mime_guess::from_path(path).first() else {
        return false;
    };
    match guess.type_() {
        mime::IMAGE => guess.subtype() != mime::SVG,
        // mime_guess calls TypeScript's .ts and .mts MPEG transport streams.
        // Real video still fails the NUL check.
        mime::VIDEO => guess.subtype() != "vnd.dlna.mpeg-tts",
        mime::AUDIO | mime::FONT => true,
        mime::APPLICATION => matches!(
            guess.subtype().as_str(),
            "pdf" | "zip" | "gzip" | "x-gzip" | "x-tar" | "x-7z-compressed" | "octet-stream"
        ),
        _ => false,
    }
}

struct MatchSite<'t> {
    line_number: usize,
    // Byte offset of `line` in the BOM-stripped text.
    line_start: usize,
    // The line without its "\n" or "\r\n".
    line: &'t str,
    start: usize,
    end: usize,
    captures: Captures<'t>,
}

// Calls on_match for every non-empty match in file order, until it returns
// false. Like ripgrep, one regex pass over the whole text rules out the many
// files with no match. Then each line is matched on its own. Do not search the
// whole text again per candidate: `[^x]` and `\s` match "\n", so a candidate
// can run far past its own line, and retrying after every line that fails
// rescans the tail each time (quadratic).
// @Robustness: Lines end at "\n" only. The editor also breaks lines at a lone
// "\r" (old Mac files), so line numbers drift in such a file.
fn for_each_match(body: &str, regex: &Regex, mut on_match: impl FnMut(&MatchSite) -> bool) {
    if !regex.is_match(body) {
        return;
    }
    let mut line_start = 0;
    for (line_idx, raw_line) in body.split('\n').enumerate() {
        let line = raw_line.strip_suffix('\r').unwrap_or(raw_line);
        for captures in regex.captures_iter(line) {
            // Group 0 is the whole match and always present.
            let whole = captures.get(0).expect("group 0 always participates");
            if whole.is_empty() {
                continue;
            }
            let site = MatchSite {
                line_number: line_idx + 1,
                line_start,
                line,
                start: whole.start(),
                end: whole.end(),
                captures,
            };
            if !on_match(&site) {
                return;
            }
        }
        line_start += raw_line.len() + 1;
    }
}

fn strip_bom(text: &str) -> (&str, &str) {
    match text.strip_prefix(BOM) {
        Some(body) => (&text[..BOM.len_utf8()], body),
        None => ("", text),
    }
}

// Returns at most MAX_MATCHES + 1 matches, so the caller can tell that a file
// went over the cap.
pub fn find_in_text(text: &str, query: &FindQuery) -> Vec<VaultFindMatch> {
    let (_, body) = strip_bom(text);
    let mut matches = Vec::new();
    // Columns are counted forward from the previous match on the same line,
    // so a long line with many matches stays linear.
    let mut column_line_start = usize::MAX;
    let mut column_byte = 0;
    let mut column_units = 0;
    for_each_match(body, &query.regex, |site| {
        if site.line_start != column_line_start {
            column_line_start = site.line_start;
            column_byte = 0;
            column_units = 0;
        }
        column_units += utf16_len(&site.line[column_byte..site.start]);
        column_byte = site.start;

        matches.push(build_match(
            site,
            column_units,
            query.preview_groups(&site.captures),
        ));
        matches.len() <= MAX_MATCHES
    });
    matches
}

fn build_match(site: &MatchSite, column: usize, groups: Vec<Option<String>>) -> VaultFindMatch {
    let matched = &site.line[site.start..site.end];
    let before_full = &site.line[..site.start];
    let before_tail = tail_chars(before_full, PREVIEW_BEFORE_CHARS);
    let before = if before_tail.len() < before_full.len() {
        format!("…{}", before_tail.trim_start())
    } else {
        before_tail.trim_start().to_string()
    };
    let text = head_chars(matched, PREVIEW_MAX_CHARS);
    let room = PREVIEW_MAX_CHARS.saturating_sub(before.chars().count() + text.chars().count());
    let after = head_chars(&site.line[site.end..], room).trim_end();
    VaultFindMatch {
        line: site.line_number,
        column,
        length: utf16_len(matched),
        before,
        text: text.to_string(),
        after: after.to_string(),
        groups,
    }
}

fn utf16_len(text: &str) -> usize {
    text.chars().map(char::len_utf16).sum()
}

fn head_chars(text: &str, max_chars: usize) -> &str {
    match text.char_indices().nth(max_chars) {
        Some((idx, _)) => &text[..idx],
        None => text,
    }
}

fn tail_chars(text: &str, max_chars: usize) -> &str {
    if max_chars == 0 {
        return "";
    }
    match text.char_indices().rev().nth(max_chars - 1) {
        Some((idx, _)) => &text[idx..],
        None => text,
    }
}

pub struct ReplacedText {
    pub text: String,
    pub count: usize,
    // A fresh scan of the new text.
    pub remaining: Vec<VaultFindMatch>,
}

// match_indexes are ordinals into find_in_text's list for the same text, so
// the caller must check the content hash first. Everything outside the
// replaced ranges is copied byte for byte, so line endings and the BOM
// survive.
pub fn replace_in_text(
    text: &str,
    query: &FindQuery,
    replacement: &str,
    match_indexes: &[usize],
) -> ReplacedText {
    let selected: HashSet<usize> = match_indexes.iter().copied().collect();
    let (bom, body) = strip_bom(text);
    let mut out = String::with_capacity(text.len());
    out.push_str(bom);
    let mut copied_up_to = 0;
    let mut ordinal = 0;
    let mut count = 0;
    for_each_match(body, &query.regex, |site| {
        let is_selected = selected.contains(&ordinal);
        ordinal += 1;
        if !is_selected {
            return true;
        }
        out.push_str(&body[copied_up_to..site.line_start + site.start]);
        query.push_replacement(site, replacement, &mut out);
        copied_up_to = site.line_start + site.end;
        count += 1;
        true
    });
    out.push_str(&body[copied_up_to..]);
    let remaining = find_in_text(&out, query);
    ReplacedText {
        text: out,
        count,
        remaining,
    }
}
