// Finds #tags in a note. One parser for the index: the index stores what
// this returns, and the context rail asks it about unsaved editor text. The
// editor's `tags` plugin has its own parser for chips. Both follow rules R1 to
// R6 in docs/markdown_editor_behavior_spec.md, section 26, and both run the
// cases in tests/fixtures/tag_cases.json.
//
// @Incomplete: Tags are flat. `#a/b` is its own tag, there is no nested tree.
//
// Per inline container (paragraph, heading, table cell) we build two strings
// with the same char count. For "see `config.yml` #release":
//
//   plain: "see config.yml #release"   what the reader sees, used for excerpts
//   scan:  "see ~~~~~~~~~~ #release"   code, links, HTML, escapes and entities hidden
//
// Tags are found in `scan`. The hidden char is not whitespace, so
// `<span>#x</span>` or `[a](b)#x` give no tag: in the source that `#` does
// not follow whitespace either.

use crate::features::search::link_parser;
use comrak::nodes::{AstNode, NodeValue, Sourcepos};
use comrak::{parse_document, Arena, Options};
use std::collections::HashMap;
use unicode_categories::UnicodeCategories;
use unicode_normalization::UnicodeNormalization;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NoteTag {
    pub tag: String,
    pub excerpt: Option<String>,
}

// Drawn as `~` above.
const HIDDEN: char = '\0';
const EXCERPT_CHARS: usize = 160;

// R6. `#Work` and `#work` are the same tag, and so are `café` typed
// precomposed and typed as `e` plus U+0301. The db groups and looks up by
// this key.
pub(crate) fn tag_key(tag: &str) -> String {
    tag.nfc().collect::<String>().to_lowercase()
}

// Tags are deduped by `tag_key`. The first spelling wins, frontmatter first,
// then body order.
//
// Frontmatter has no text of its own, so its tags borrow an excerpt: the first
// body line that uses the tag, or else the first line of the note. Vaults that
// only tag in frontmatter still get a preview in the tag pane.
//
// @Speed: The index parses each note twice, once for links and once here.
// Merge them into one parse if indexing a big vault gets slow.
pub(crate) fn extract_note_tags(markdown: &str) -> Vec<NoteTag> {
    let arena = Arena::new();
    let root = parse_document(&arena, markdown, &tag_options());
    let source = NoteSource::new(markdown);
    let mut tag_index_by_key: HashMap<String, usize> = HashMap::new();
    let mut tags: Vec<NoteTag> = Vec::new();
    let mut first_container_excerpt: Option<String> = None;

    for node in root.descendants() {
        let value = &node.data.borrow().value;
        if let NodeValue::FrontMatter(raw) = value {
            for tag in frontmatter_tags(raw) {
                let key = tag_key(&tag);
                if !tag_index_by_key.contains_key(&key) {
                    tag_index_by_key.insert(key, tags.len());
                    tags.push(NoteTag { tag, excerpt: None });
                }
            }
            continue;
        }
        // Code blocks and HTML blocks have no inline children, so they never
        // get here.
        if !value.contains_inlines() {
            continue;
        }

        let mut plain: Vec<char> = Vec::new();
        let mut scan: Vec<char> = Vec::new();
        collect_inline_text(node, &source, &mut plain, &mut scan);
        if first_container_excerpt.is_none() && !plain.is_empty() {
            first_container_excerpt = Some(excerpt_around(&plain, 0));
        }
        for (tag, tag_start) in scan_inline_tags(&scan) {
            let key = tag_key(&tag);
            match tag_index_by_key.get(&key) {
                None => {
                    tag_index_by_key.insert(key, tags.len());
                    let excerpt = Some(excerpt_around(&plain, tag_start));
                    tags.push(NoteTag { tag, excerpt });
                }
                // Frontmatter named it first. Keep its spelling, add the excerpt.
                Some(&idx) if tags[idx].excerpt.is_none() => {
                    tags[idx].excerpt = Some(excerpt_around(&plain, tag_start));
                }
                Some(_) => {}
            }
        }
    }

    for tag in tags.iter_mut().filter(|tag| tag.excerpt.is_none()) {
        tag.excerpt = first_container_excerpt.clone();
    }
    tags
}

// Same options as link parsing, so wikilinks and autolinks are recognized
// the same way, plus frontmatter and escapes as their own nodes.
fn tag_options() -> Options<'static> {
    let mut options = link_parser::markdown_options();
    options.extension.front_matter_delimiter = Some("---".to_string());
    options.parse.escaped_char_spans = true;
    options
}

fn collect_inline_text<'a>(
    node: &'a AstNode<'a>,
    source: &NoteSource,
    plain: &mut Vec<char>,
    scan: &mut Vec<char>,
) {
    for child in node.children() {
        let data = child.data.borrow();
        match &data.value {
            NodeValue::Text(text) => {
                // Only text with a `#` can hold a tag, so only that pays for
                // the source comparison.
                let text_source = if text.contains('#') {
                    source.slice(data.sourcepos)
                } else {
                    None
                };
                match text_source {
                    Some(text_source) if text_source != text => {
                        push_text_hiding_entities(text, text_source, plain, scan)
                    }
                    _ => {
                        plain.extend(text.chars());
                        scan.extend(text.chars());
                    }
                }
            }
            NodeValue::SoftBreak | NodeValue::LineBreak => {
                plain.push('\n');
                scan.push('\n');
            }
            NodeValue::Code(code) => push_hidden(&code.literal, plain, scan),
            NodeValue::HtmlInline(_) => {
                plain.push(' ');
                scan.push(HIDDEN);
            }
            // A bare URL ends at a Unicode space, like in the editor. comrak
            // only stops at ASCII whitespace, so it would swallow `\u{a0}#x`.
            NodeValue::Link(_) if source.is_bare_url(data.sourcepos) => {
                push_bare_url(&nested_plain_text(child), plain, scan)
            }
            // Do not descend: `[#x](url)`, `[[note#h]]` and `https://a.com/#f`
            // are not tags. `\#x` is Escaped("#") followed by Text("x").
            NodeValue::Link(_)
            | NodeValue::Image(_)
            | NodeValue::WikiLink(_)
            | NodeValue::Escaped => push_hidden(&nested_plain_text(child), plain, scan),
            _ => collect_inline_text(child, source, plain, scan),
        }
    }
}

// comrak decodes `&#35;`, `&#x23;` and `&num;` into plain Text and merges it
// with the text around it, so the Text alone cannot tell us `&#35;x` is not a
// tag. We walk the decoded text and its source together. A char that came
// from an entity goes to `plain` as itself and to `scan` as HIDDEN. That also
// keeps `a &nbsp;#x` from being a tag: the `#` does not follow real
// whitespace in the source.
//
// Any other difference means something else rewrote the text, and we push the
// rest as decoded text, like before entities were handled.
//
// @Robustness: A named entity that decodes to two chars (`&NotEqualTilde;`)
// hides only the first, and an `&name;` that comrak left as text throws the
// walk off by a few chars. Both end up in the fallback or hide a char that is
// not whitespace anyway. I have not seen either in a real note.
fn push_text_hiding_entities(
    text: &str,
    text_source: &str,
    plain: &mut Vec<char>,
    scan: &mut Vec<char>,
) {
    let mut decoded = text.chars();
    let mut rest = text_source;
    while let Some(ch) = decoded.next() {
        if let Some(entity_len) = entity_len(rest) {
            rest = &rest[entity_len..];
            plain.push(ch);
            scan.push(HIDDEN);
        } else if let Some(after) = rest.strip_prefix(ch) {
            rest = after;
            plain.push(ch);
            scan.push(ch);
        } else {
            for ch in std::iter::once(ch).chain(decoded) {
                plain.push(ch);
                scan.push(ch);
            }
            return;
        }
    }
}

// Byte length of the `&name;`, `&#35;` or `&#x23;` that starts `source`.
fn entity_len(source: &str) -> Option<usize> {
    let body = source.strip_prefix('&')?;
    let name_len = body.find(|ch: char| ch != '#' && !ch.is_ascii_alphanumeric())?;
    (name_len > 0 && body[name_len..].starts_with(';')).then_some(name_len + 2)
}

// The note text with a line table, so a node's sourcepos maps back to its
// source bytes. Built once per note.
struct NoteSource<'a> {
    markdown: &'a str,
    line_starts: Vec<usize>,
}

impl<'a> NoteSource<'a> {
    fn new(markdown: &'a str) -> Self {
        let line_starts = std::iter::once(0)
            .chain(markdown.match_indices('\n').map(|(idx, _)| idx + 1))
            .collect();
        NoteSource {
            markdown,
            line_starts,
        }
    }

    // Links written with `[` or `<` have their own syntax. What is left is an
    // autolink: `http://`, `www.` or an email address.
    fn is_bare_url(&self, pos: Sourcepos) -> bool {
        self.slice(pos)
            .is_some_and(|text| !text.starts_with(['[', '<']))
    }

    // comrak lines and columns are 1-based, columns count bytes, and the end
    // is inclusive. Nodes comrak made up have 0:0, which gives None.
    fn slice(&self, pos: Sourcepos) -> Option<&'a str> {
        let line_start = |line: usize| self.line_starts.get(line.checked_sub(1)?).copied();
        let start = line_start(pos.start.line)? + pos.start.column.checked_sub(1)?;
        let end = line_start(pos.end.line)? + pos.end.column;
        self.markdown.get(start..end)
    }
}

// The URL part is hidden, whatever comrak glued on after a Unicode space is
// ordinary text again.
fn push_bare_url(text: &str, plain: &mut Vec<char>, scan: &mut Vec<char>) {
    let url_len = text.find(ends_bare_url).unwrap_or(text.len());
    push_hidden(&text[..url_len], plain, scan);
    for ch in text[url_len..].chars() {
        plain.push(ch);
        scan.push(ch);
    }
}

// Lezer ends a URL at JS `\s`. Next to comrak's ASCII whitespace that adds
// every Unicode space except U+0085, which neither of them stops at. (U+FEFF
// is in `\s` too, but R2 does not count it as whitespace, so a `#` after it
// is no tag either way.)
fn ends_bare_url(ch: char) -> bool {
    ch.is_whitespace() && ch != '\u{85}'
}

fn push_hidden(text: &str, plain: &mut Vec<char>, scan: &mut Vec<char>) {
    for ch in text.chars() {
        plain.push(ch);
        scan.push(HIDDEN);
    }
}

fn nested_plain_text<'a>(node: &'a AstNode<'a>) -> String {
    let mut out = String::new();
    for descendant in node.descendants().skip(1) {
        match &descendant.data.borrow().value {
            NodeValue::Text(text) => out.push_str(text),
            NodeValue::Code(code) => out.push_str(&code.literal),
            NodeValue::SoftBreak | NodeValue::LineBreak => out.push(' '),
            _ => {}
        }
    }
    out
}

// Returns each valid tag with the char index of its `#` in `scan`.
fn scan_inline_tags(scan: &[char]) -> Vec<(String, usize)> {
    let mut found = Vec::new();
    let mut idx = 0;
    while idx < scan.len() {
        if scan[idx] != '#' || !starts_tag(scan, idx) {
            idx += 1;
            continue;
        }
        let body_start = idx + 1;
        let mut body_end = body_start;
        while body_end < scan.len() && is_tag_char(scan[body_end]) {
            body_end += 1;
        }
        let body: String = scan[body_start..body_end].iter().collect();
        if let Some(tag) = validate_tag_body(&body) {
            found.push((tag, idx));
        }
        idx = body_end;
    }
    found
}

// R2. A `#` starts a tag at the start of the text, after whitespace, or
// after a run of `*`, `_`, `~` that is itself at the start or after
// whitespace. comrak has already turned matched delimiters into Strong or
// Emph, so `**#bold**` reaches us as `#bold`. The run only matters for
// delimiters comrak left as text (`**#open`), but the editor sees the raw
// `*` in every case, and stating the rule on the source keeps both parsers
// on the same answer. HIDDEN stops the walk, so `` `c`*#x* `` and `\*#x` stay
// plain text.
fn starts_tag(scan: &[char], idx: usize) -> bool {
    let mut run_start = idx;
    while run_start > 0 && matches!(scan[run_start - 1], '*' | '_' | '~') {
        run_start -= 1;
    }
    run_start == 0 || scan[run_start - 1].is_whitespace()
}

// R3. Combining marks count because whole scripts spell words with them: the
// Devanagari virama in `क्या` and the Thai tone mark in `ไม่` are not
// alphabetic, and without them the tag would stop after one letter.
//
// @Robustness: unicode_categories and the WebView's ICU can disagree on marks
// added in recent Unicode versions, so a tag with one of those may end in a
// different place in the editor. Not worth a table of our own.
fn is_tag_char(ch: char) -> bool {
    ch.is_alphanumeric() || ch.is_mark() || matches!(ch, '_' | '-' | '/')
}

// R4 and R5. Trailing `_` and `/` go: `a/b/` is `a/b`. A trailing `_` is
// often the closer of `_..._` emphasis. comrak resolves that before we scan
// and the editor's Lezer parser after it reads the tag, so dropping it always
// is the only rule both sides can compute. Then rejects `/a`, `a//b`, bodies
// with no letter or number (`#_`, `#---`), and numbers only (`#123` is an
// issue number or a year, and `#١٢٣` too). `#1st` and `#v2` are fine.
fn validate_tag_body(body: &str) -> Option<String> {
    let body = body.trim_end_matches(['_', '/']);
    if !body.chars().all(is_tag_char) || !body.chars().any(char::is_alphanumeric) {
        return None;
    }
    if body.split('/').any(str::is_empty) {
        return None;
    }
    if body.chars().all(char::is_numeric) {
        return None;
    }
    Some(body.to_string())
}

fn excerpt_around(plain: &[char], tag_start: usize) -> String {
    // Show about a third of the window before the tag. Near the end of the
    // paragraph, slide the window back so it stays full.
    let mut start = tag_start.saturating_sub(EXCERPT_CHARS / 3);
    let end = (start + EXCERPT_CHARS).min(plain.len());
    start = start.min(end.saturating_sub(EXCERPT_CHARS));

    let window: String = plain[start..end].iter().collect();
    let collapsed = window.split_whitespace().collect::<Vec<_>>().join(" ");
    let prefix = if start > 0 { "…" } else { "" };
    let suffix = if end < plain.len() { "…" } else { "" };
    format!("{prefix}{collapsed}{suffix}")
}

// We do not pull in a YAML crate for one key. This reads a top level `tags:`
// written as `[a, b]` (also across lines), `a, b`, `a b`, or a block list of
// `- a` lines. Quotes and a leading `#` are stripped.
//
// @Incomplete: `tag:` (singular) and nested keys are not handled.
fn frontmatter_tags(raw: &str) -> Vec<String> {
    let mut values: Vec<String> = Vec::new();
    let mut in_block_list = false;
    let mut lines = raw.lines();

    while let Some(line) = lines.next() {
        if in_block_list {
            let item = line.trim();
            // `- a`, but not the closing `---`.
            if let Some(value) = item.strip_prefix("- ") {
                values.push(strip_yaml_comment(value).to_string());
                continue;
            }
            if item.is_empty() {
                continue;
            }
            in_block_list = false;
        }

        let Some(rest) = line.strip_prefix("tags:") else {
            continue;
        };
        if !rest.is_empty() && !rest.starts_with(char::is_whitespace) {
            continue;
        }
        let rest = strip_yaml_comment(rest).trim();
        if rest.is_empty() {
            in_block_list = true;
        } else if let Some(after_bracket) = rest.strip_prefix('[') {
            if let Some(inner) = read_flow_list(after_bracket, &mut lines) {
                values.extend(inner.split(',').map(str::to_string));
            }
        } else {
            values.extend(
                rest.split(|ch: char| ch == ',' || ch.is_whitespace())
                    .map(str::to_string),
            );
        }
    }

    values
        .into_iter()
        .filter_map(|value| {
            let value = value.trim();
            let value = strip_matching_quotes(value).trim();
            validate_tag_body(value.strip_prefix('#').unwrap_or(value))
        })
        .collect()
}

// Returns the text between `[` and `]`, pulling in the following lines while
// the list is still open. Lines are joined with a space, so an item broken
// over two lines becomes one invalid value instead of two tags. If the
// frontmatter ends first, the YAML is broken and we return None: no tags is
// better than a guess.
fn read_flow_list(after_bracket: &str, next_lines: &mut std::str::Lines) -> Option<String> {
    let mut flow = String::new();
    let mut piece = after_bracket;
    loop {
        if let Some(end) = piece.find(']') {
            flow.push_str(&piece[..end]);
            return Some(flow);
        }
        flow.push_str(piece);
        flow.push(' ');
        piece = strip_yaml_comment(next_lines.next()?);
    }
}

// YAML starts a comment at a `#` that follows whitespace, so `a # note` loses
// `# note` but a quoted `"#b"` keeps its `#`. The start of the value counts as
// following whitespace: it comes right after `tags:` or `- `.
fn strip_yaml_comment(value: &str) -> &str {
    let mut after_whitespace = true;
    for (idx, ch) in value.char_indices() {
        if ch == '#' && after_whitespace {
            return &value[..idx];
        }
        after_whitespace = ch.is_whitespace();
    }
    value
}

fn strip_matching_quotes(value: &str) -> &str {
    for quote in ['"', '\''] {
        if let Some(inner) = value
            .strip_prefix(quote)
            .and_then(|rest| rest.strip_suffix(quote))
        {
            return inner;
        }
    }
    value
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde::Deserialize;

    fn tags(markdown: &str) -> Vec<String> {
        extract_note_tags(markdown)
            .into_iter()
            .map(|note_tag| note_tag.tag)
            .collect()
    }

    // The editor's tests read the same file. `editor` and `note` are theirs.
    #[derive(Deserialize)]
    struct TagCases {
        cases: Vec<TagCase>,
    }

    #[derive(Deserialize)]
    struct TagCase {
        name: String,
        markdown: String,
        index: Vec<String>,
    }

    #[test]
    fn shared_tag_cases() {
        let fixture: TagCases = serde_json::from_str(include_str!(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../tests/fixtures/tag_cases.json"
        )))
        .expect("tag_cases.json parses");

        let failures: Vec<String> = fixture
            .cases
            .iter()
            .filter_map(|case| {
                let found = tags(&case.markdown);
                (found != case.index)
                    .then(|| format!("{}: expected {:?}, got {:?}", case.name, case.index, found))
            })
            .collect();
        assert!(failures.is_empty(), "{}", failures.join("\n"));
    }

    #[test]
    fn crlf_frontmatter_and_body() {
        assert_eq!(
            tags("---\r\ntags:\r\n  - a\r\n  - b\r\n---\r\n#c\r\n"),
            vec!["a", "b", "c"]
        );
    }

    #[test]
    fn tag_key_folds_case_and_normalizes() {
        assert_eq!(tag_key("Cafe\u{301}"), tag_key("café"));
    }

    #[test]
    fn frontmatter_tags_come_first_and_borrow_an_excerpt() {
        let note = "---\ntags: [b, c]\n---\nIntro text\n\nBody #a and #B\n";
        let tag = |tag: &str, excerpt: &str| NoteTag {
            tag: tag.to_string(),
            excerpt: Some(excerpt.to_string()),
        };
        assert_eq!(
            extract_note_tags(note),
            vec![
                // Used in the body: that line is the excerpt, frontmatter spelling stays.
                tag("b", "Body #a and #B"),
                // Not used in the body: the first line of the note.
                tag("c", "Intro text"),
                tag("a", "Body #a and #B"),
            ]
        );
    }

    #[test]
    fn frontmatter_tag_in_a_note_with_no_text_has_no_excerpt() {
        assert_eq!(
            extract_note_tags("---\ntags: [a]\n---\n"),
            vec![NoteTag {
                tag: "a".to_string(),
                excerpt: None,
            }]
        );
    }

    #[test]
    fn excerpt_is_cut_on_char_boundaries_and_marks_cuts() {
        let before = "é".repeat(200);
        let after = "日".repeat(200);
        let found = extract_note_tags(&format!("{before} #mid {after}"));
        let excerpt = found[0].excerpt.clone().expect("body tag has an excerpt");
        assert!(excerpt.starts_with('…'));
        assert!(excerpt.ends_with('…'));
        assert!(excerpt.contains("#mid"));
        assert!(excerpt.chars().count() <= EXCERPT_CHARS + 2);
    }

    #[test]
    fn excerpt_collapses_whitespace_and_shows_link_text() {
        let found = extract_note_tags("See [the   doc](a.md)\nand `code` #x");
        assert_eq!(found[0].excerpt.as_deref(), Some("See the doc and code #x"));
    }

    #[test]
    fn excerpt_shows_entities_decoded() {
        let found = extract_note_tags("Tom &amp; Jerry &#35;1 #show");
        assert_eq!(found[0].excerpt.as_deref(), Some("Tom & Jerry #1 #show"));
    }
}
