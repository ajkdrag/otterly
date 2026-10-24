// Finds #tags in a note. One parser for the whole app: the index stores what
// this returns, and the context rail asks it about unsaved editor text.
//
// Per inline container (paragraph, heading, table cell) we build two strings
// with the same char count. For "see `config.yml` #release":
//
//   plain: "see config.yml #release"   what the reader sees, used for excerpts
//   scan:  "see ~~~~~~~~~~ #release"   code, links, HTML and escapes hidden
//
// Tags are found in `scan`. The hidden char is not whitespace, so
// `<span>#x</span>` or `[a](b)#x` give no tag: in the source that `#` does
// not follow whitespace either.

use crate::features::search::link_parser;
use comrak::nodes::{AstNode, NodeValue};
use comrak::{parse_document, Arena, Options};
use std::collections::HashSet;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NoteTag {
    pub tag: String,
    pub excerpt: Option<String>,
}

// Drawn as `~` above.
const HIDDEN: char = '\0';
const EXCERPT_CHARS: usize = 160;

// `#Work` and `#work` are the same tag. The db groups and looks up by this key.
pub(crate) fn tag_key(tag: &str) -> String {
    tag.to_lowercase()
}

// Tags are deduped by `tag_key`. The first spelling wins, frontmatter first,
// then body order.
pub(crate) fn extract_note_tags(markdown: &str) -> Vec<NoteTag> {
    let arena = Arena::new();
    let root = parse_document(&arena, markdown, &tag_options());
    let mut seen_keys: HashSet<String> = HashSet::new();
    let mut tags: Vec<NoteTag> = Vec::new();

    for node in root.descendants() {
        let value = &node.data.borrow().value;
        if let NodeValue::FrontMatter(raw) = value {
            for tag in frontmatter_tags(raw) {
                if seen_keys.insert(tag_key(&tag)) {
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
        collect_inline_text(node, &mut plain, &mut scan);
        for (tag, tag_start) in scan_inline_tags(&scan) {
            if seen_keys.insert(tag_key(&tag)) {
                let excerpt = excerpt_around(&plain, tag_start);
                tags.push(NoteTag {
                    tag,
                    excerpt: Some(excerpt),
                });
            }
        }
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

fn collect_inline_text<'a>(node: &'a AstNode<'a>, plain: &mut Vec<char>, scan: &mut Vec<char>) {
    for child in node.children() {
        match &child.data.borrow().value {
            NodeValue::Text(text) => {
                plain.extend(text.chars());
                scan.extend(text.chars());
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
            // Do not descend: `[#x](url)`, `[[note#h]]` and `https://a.com/#f`
            // are not tags. `\#x` is Escaped("#") followed by Text("x").
            NodeValue::Link(_)
            | NodeValue::Image(_)
            | NodeValue::WikiLink(_)
            | NodeValue::Escaped => push_hidden(&nested_plain_text(child), plain, scan),
            _ => collect_inline_text(child, plain, scan),
        }
    }
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
        let starts_tag = scan[idx] == '#' && (idx == 0 || scan[idx - 1].is_whitespace());
        if !starts_tag {
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

fn is_tag_char(ch: char) -> bool {
    ch.is_alphanumeric() || ch == '_' || ch == '-' || ch == '/'
}

// `a/b/` is `a/b`. Rejects `/a`, `a//b`, and all digits (`#123` is an issue
// number or a year, not a tag). `#1st` and `#v2` are fine.
fn validate_tag_body(body: &str) -> Option<String> {
    let body = body.trim_end_matches('/');
    if body.is_empty() || !body.chars().all(is_tag_char) {
        return None;
    }
    if body.split('/').any(str::is_empty) {
        return None;
    }
    if body.chars().all(|ch| ch.is_ascii_digit()) {
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
// written as `[a, b]`, `a, b`, `a b`, or a block list of `- a` lines. Quotes
// and a leading `#` are stripped.
//
// @Incomplete: `tag:` (singular), nested keys, multi-line flow lists, and
// trailing YAML comments are not handled.
fn frontmatter_tags(raw: &str) -> Vec<String> {
    let mut values: Vec<&str> = Vec::new();
    let mut in_block_list = false;

    for line in raw.lines() {
        if in_block_list {
            let item = line.trim();
            // `- a`, but not the closing `---`.
            if let Some(value) = item.strip_prefix("- ") {
                values.push(value);
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
        let rest = rest.trim();
        if rest.is_empty() {
            in_block_list = true;
        } else if let Some(inner) = rest.strip_prefix('[').and_then(|r| r.strip_suffix(']')) {
            values.extend(inner.split(','));
        } else {
            values.extend(rest.split(|ch: char| ch == ',' || ch.is_whitespace()));
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

    fn tags(markdown: &str) -> Vec<String> {
        extract_note_tags(markdown)
            .into_iter()
            .map(|note_tag| note_tag.tag)
            .collect()
    }

    fn none() -> Vec<String> {
        Vec::new()
    }

    #[test]
    fn code_is_not_scanned() {
        assert_eq!(tags("see `#x` here"), none());
        assert_eq!(tags("```\n#x\n```\n"), none());
        assert_eq!(tags("para\n\n    #x\n"), none());
        assert_eq!(tags("`code`#x"), none());
    }

    #[test]
    fn heading_marker_is_not_a_tag_but_heading_text_is_scanned() {
        assert_eq!(tags("# Heading"), none());
        assert_eq!(tags("#"), none());
        assert_eq!(tags("# "), none());
        assert_eq!(tags("## Plan #work"), vec!["work"]);
    }

    #[test]
    fn hash_must_start_the_text_or_follow_whitespace() {
        assert_eq!(tags("#start of line"), vec!["start"]);
        assert_eq!(tags("first line\n#second"), vec!["second"]);
        assert_eq!(tags("foo#bar and C# code"), none());
        assert_eq!(tags("(#y)"), none());
    }

    #[test]
    fn urls_links_and_wikilinks_are_not_scanned() {
        assert_eq!(tags("https://a.com/#frag and www.a.com/#f"), none());
        assert_eq!(tags("<https://a.com/#x> and example.com/#y"), none());
        assert_eq!(tags("[#x](url) [[note#h]] [[#h]] ![#alt](a.png)"), none());
        assert_eq!(tags("[[note#h|#alias]] then #real"), vec!["real"]);
    }

    #[test]
    fn escapes_and_html_are_not_scanned() {
        assert_eq!(tags("\\#x"), none());
        assert_eq!(tags("<span>#x</span>"), none());
        assert_eq!(tags("<div>\n#x\n</div>\n"), none());
    }

    #[test]
    fn body_validation() {
        assert_eq!(tags("#123 #2024"), none());
        assert_eq!(tags("#1st #v2"), vec!["1st", "v2"]);
        assert_eq!(tags("#a/b and #a/b/"), vec!["a/b"]);
        assert_eq!(tags("x #/a #a//b # #"), none());
        assert_eq!(tags("#日本語 #café"), vec!["日本語", "café"]);
        assert_eq!(tags("#done. #x, #a,b"), vec!["done", "x", "a"]);
    }

    #[test]
    fn tags_inside_emphasis_tables_quotes_and_tasks_count() {
        assert_eq!(tags("**#bold**"), vec!["bold"]);
        assert_eq!(tags("| h |\n| --- |\n| #cell |\n"), vec!["cell"]);
        assert_eq!(tags("> #quote"), vec!["quote"]);
        assert_eq!(tags("- [ ] #task"), vec!["task"]);
    }

    #[test]
    fn same_tag_with_different_case_is_one_tag_keeping_first_spelling() {
        assert_eq!(tags("#Work and #work"), vec!["Work"]);
    }

    #[test]
    fn frontmatter_forms() {
        assert_eq!(
            tags("---\ntags: [a, \"b\", '#c']\n---\n"),
            vec!["a", "b", "c"]
        );
        assert_eq!(tags("---\ntags: a, b\n---\n"), vec!["a", "b"]);
        assert_eq!(tags("---\ntags: a b\n---\n"), vec!["a", "b"]);
        assert_eq!(
            tags("---\ntitle: x\ntags:\n  - a\n  - \"#b\"\n- c\nother: 1\n---\n"),
            vec!["a", "b", "c"]
        );
        assert_eq!(tags("---\ntags: [123, ok, bad tag]\n---\n"), vec!["ok"]);
        assert_eq!(tags("---\ntag: a\nmeta:\n  tags: [b]\n---\n"), none());
    }

    #[test]
    fn frontmatter_tags_come_first_without_excerpt() {
        let found = extract_note_tags("---\ntags: [b]\n---\nBody #a and #B\n");
        assert_eq!(
            found,
            vec![
                NoteTag {
                    tag: "b".to_string(),
                    excerpt: None,
                },
                NoteTag {
                    tag: "a".to_string(),
                    excerpt: Some("Body #a and #B".to_string()),
                },
            ]
        );
    }

    #[test]
    fn dashes_later_in_the_doc_are_not_frontmatter() {
        assert_eq!(tags("text\n\n---\ntags: [a]\n---\n"), none());
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
}
