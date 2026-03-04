use comrak::nodes::{AstNode, NodeCode, NodeLink, NodeValue, NodeWikiLink, Sourcepos};
use comrak::{Arena, Options, parse_document};
use serde::Serialize;
use std::collections::{HashMap, HashSet};

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct ExternalLink {
    pub url: String,
    pub text: String,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct LocalLinksSnapshot {
    pub outlink_paths: Vec<String>,
    pub external_links: Vec<ExternalLink>,
}

#[derive(Default)]
struct ParsedLinks {
    markdown_targets: Vec<String>,
    wiki_targets: Vec<String>,
    external_links: Vec<ExternalLink>,
}

fn markdown_options() -> Options<'static> {
    let mut options = Options::default();
    options.extension.autolink = true;
    options.extension.table = true;
    options.extension.tasklist = true;
    options.extension.strikethrough = true;
    options.extension.wikilinks_title_after_pipe = true;
    options
}

fn hex_nibble(byte: u8) -> Option<u8> {
    match byte {
        b'0'..=b'9' => Some(byte - b'0'),
        b'a'..=b'f' => Some(byte - b'a' + 10),
        b'A'..=b'F' => Some(byte - b'A' + 10),
        _ => None,
    }
}

fn decode_percent_sequences(value: &str) -> String {
    let bytes = value.as_bytes();
    let mut out: Vec<u8> = Vec::with_capacity(bytes.len());
    let mut i = 0usize;

    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let (Some(high), Some(low)) = (hex_nibble(bytes[i + 1]), hex_nibble(bytes[i + 2])) {
                out.push((high << 4) | low);
                i += 3;
                continue;
            }
        }
        out.push(bytes[i]);
        i += 1;
    }

    String::from_utf8_lossy(&out).into_owned()
}

fn is_external_url(value: &str) -> bool {
    let lower = value.to_ascii_lowercase();
    lower.starts_with("http://") || lower.starts_with("https://")
}

pub(crate) fn resolve_relative_path(source_dir: &str, target: &str) -> Option<String> {
    let source_parts: Vec<&str> = if source_dir.is_empty() {
        Vec::new()
    } else {
        source_dir.split('/').collect()
    };

    let mut segments = source_parts;

    for part in target.split('/') {
        match part {
            "." | "" => {}
            ".." => {
                if segments.pop().is_none() {
                    return None;
                }
            }
            _ => segments.push(part),
        }
    }

    let joined = segments.join("/");
    if joined.is_empty() {
        return None;
    }
    Some(joined)
}

fn source_dir_from_path(source_path: &str) -> &str {
    match source_path.rfind('/') {
        Some(i) => &source_path[..i],
        None => "",
    }
}

fn parse_internal_markdown_target(raw_href: &str) -> Option<String> {
    let trimmed = raw_href.trim();
    if trimmed.is_empty() || is_external_url(trimmed) {
        return None;
    }

    let mut href = decode_percent_sequences(trimmed);
    if let Some(hash) = href.find('#') {
        href.truncate(hash);
    }
    if let Some(query) = href.find('?') {
        href.truncate(query);
    }

    let href = href.trim();
    if href.is_empty() || !href.to_ascii_lowercase().ends_with(".md") {
        return None;
    }
    Some(href.to_string())
}

fn markdown_destination_needs_angle_brackets(value: &str) -> bool {
    value.chars().any(char::is_whitespace)
}

fn parse_wiki_link_target(raw_target: &str) -> Option<String> {
    let trimmed = raw_target.trim();
    if trimmed.is_empty() {
        return None;
    }

    let before_fragment = trimmed
        .split_once('#')
        .map(|(target, _)| target)
        .unwrap_or(trimmed)
        .trim();
    if before_fragment.is_empty() {
        return None;
    }

    let decoded = decode_percent_sequences(before_fragment);
    if decoded.is_empty() || is_external_url(&decoded) {
        return None;
    }
    Some(decoded)
}

fn ensure_md_extension(value: &str) -> String {
    if value.to_ascii_lowercase().ends_with(".md") {
        return value.to_string();
    }
    format!("{value}.md")
}

fn is_note_relative_target(raw_target: &str) -> bool {
    raw_target.starts_with("./") || raw_target.starts_with("../")
}

pub(crate) fn resolve_wiki_target(source_path: &str, raw_target: &str) -> Option<String> {
    let base_dir = if is_note_relative_target(raw_target) {
        source_dir_from_path(source_path)
    } else {
        ""
    };

    let cleaned = raw_target.trim_start_matches('/');
    if cleaned.is_empty() {
        return None;
    }

    let candidate = ensure_md_extension(cleaned);
    resolve_relative_path(base_dir, &candidate)
}

fn collect_plain_text<'a>(node: &'a AstNode<'a>) -> String {
    let mut out = String::new();
    for descendant in node.descendants().skip(1) {
        match &descendant.data.borrow().value {
            NodeValue::Text(text) => out.push_str(text.as_ref()),
            NodeValue::Code(NodeCode { literal, .. }) => out.push_str(literal),
            NodeValue::SoftBreak | NodeValue::LineBreak => out.push(' '),
            _ => {}
        }
    }
    out.trim().to_string()
}

fn ends_with_unescaped_bang(value: &str) -> bool {
    let bytes = value.as_bytes();
    if bytes.last() != Some(&b'!') {
        return false;
    }

    let mut slash_count = 0usize;
    let mut index = bytes.len().saturating_sub(1);
    while index > 0 && bytes[index - 1] == b'\\' {
        slash_count += 1;
        index -= 1;
    }
    slash_count % 2 == 0
}

fn is_embedded_wikilink(node: &AstNode<'_>) -> bool {
    let Some(prev) = node.previous_sibling() else {
        return false;
    };
    let borrowed = prev.data.borrow();
    if let NodeValue::Text(text) = &borrowed.value {
        return ends_with_unescaped_bang(text.as_ref());
    }
    false
}

fn parse_link_node(link: &NodeLink, source_path: &str) -> Option<String> {
    let parsed = parse_internal_markdown_target(&link.url)?;
    resolve_wiki_target(source_path, &parsed)
}

fn parse_wikilink_node(link: &NodeWikiLink, source_path: &str) -> Option<String> {
    let raw_target = parse_wiki_link_target(&link.url)?;
    resolve_wiki_target(source_path, &raw_target)
}

fn parse_all_links(markdown: &str, source_path: &str) -> ParsedLinks {
    let arena = Arena::new();
    let options = markdown_options();
    let root = parse_document(&arena, markdown, &options);
    let mut parsed = ParsedLinks::default();

    for node in root.descendants() {
        match &node.data.borrow().value {
            NodeValue::Link(link) => {
                if is_external_url(&link.url) {
                    let text = collect_plain_text(node);
                    let label = if text.is_empty() {
                        link.url.clone()
                    } else {
                        text
                    };
                    parsed.external_links.push(ExternalLink {
                        url: link.url.clone(),
                        text: label,
                    });
                    continue;
                }

                if let Some(target) = parse_link_node(link, source_path) {
                    parsed.markdown_targets.push(target);
                }
            }
            NodeValue::WikiLink(link) => {
                if is_embedded_wikilink(node) {
                    continue;
                }
                if let Some(target) = parse_wikilink_node(link, source_path) {
                    parsed.wiki_targets.push(target);
                }
            }
            _ => {}
        }
    }

    parsed
}

fn dedupe_preserve_order(values: Vec<String>) -> Vec<String> {
    let mut seen = HashSet::new();
    let mut out = Vec::new();
    for value in values {
        if seen.insert(value.clone()) {
            out.push(value);
        }
    }
    out
}

fn dedupe_external_links(values: Vec<ExternalLink>) -> Vec<ExternalLink> {
    let mut seen = HashSet::new();
    let mut out = Vec::new();
    for value in values {
        if seen.insert(value.url.clone()) {
            out.push(value);
        }
    }
    out
}

#[allow(dead_code)]
pub(crate) fn gfm_link_targets(markdown: &str, source_path: &str) -> Vec<String> {
    parse_all_links(markdown, source_path).markdown_targets
}

#[allow(dead_code)]
pub(crate) fn wiki_link_targets(markdown: &str, source_path: &str) -> Vec<String> {
    parse_all_links(markdown, source_path).wiki_targets
}

pub(crate) fn internal_link_targets(markdown: &str, source_path: &str) -> Vec<String> {
    let parsed = parse_all_links(markdown, source_path);
    let mut out = parsed.markdown_targets;
    out.extend(parsed.wiki_targets);
    out
}

pub(crate) fn extract_local_links_snapshot(markdown: &str, source_path: &str) -> LocalLinksSnapshot {
    let parsed = parse_all_links(markdown, source_path);
    let mut combined = parsed.markdown_targets;
    combined.extend(parsed.wiki_targets);
    let outlink_paths = dedupe_preserve_order(
        combined
            .into_iter()
            .filter(|path| path != source_path)
            .collect(),
    );

    LocalLinksSnapshot {
        outlink_paths,
        external_links: dedupe_external_links(parsed.external_links),
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct RewriteResult {
    pub markdown: String,
    pub changed: bool,
}

fn compute_line_starts(text: &str) -> Vec<usize> {
    let mut starts = vec![0usize];
    for (i, byte) in text.bytes().enumerate() {
        if byte == b'\n' {
            starts.push(i + 1);
        }
    }
    starts
}

fn sourcepos_to_byte_range(line_starts: &[usize], pos: Sourcepos) -> Option<(usize, usize)> {
    if pos.start.line == 0 || pos.end.line == 0 {
        return None;
    }
    let start_offset = *line_starts.get(pos.start.line - 1)?;
    let end_offset = *line_starts.get(pos.end.line - 1)?;
    Some((start_offset + pos.start.column - 1, end_offset + pos.end.column))
}

pub(crate) fn compute_relative_path(from_dir: &str, to_path: &str) -> String {
    let from_segments: Vec<&str> = if from_dir.is_empty() {
        Vec::new()
    } else {
        from_dir.split('/').collect()
    };
    let to_segments: Vec<&str> = to_path.split('/').collect();

    let mut common = 0;
    while common < from_segments.len()
        && common < to_segments.len()
        && from_segments[common] == to_segments[common]
    {
        common += 1;
    }

    let ups = from_segments.len() - common;
    let remaining = &to_segments[common..];

    if ups == 0 && remaining.len() == 1 {
        return remaining[0].to_string();
    }
    if ups == 0 {
        return format!("./{}", remaining.join("/"));
    }

    let mut parts: Vec<&str> = vec![".."; ups];
    parts.extend(remaining);
    parts.join("/")
}

fn strip_md_ext(value: &str) -> &str {
    if value.to_ascii_lowercase().ends_with(".md") {
        &value[..value.len() - 3]
    } else {
        value
    }
}

fn compute_note_relative_path(from_dir: &str, to_path: &str) -> String {
    let result = compute_relative_path(from_dir, to_path);
    if !result.starts_with("./") && !result.starts_with("../") && !result.contains('/') {
        return format!("./{result}");
    }
    result
}

pub(crate) fn format_wiki_target(
    source_path: &str,
    resolved_note_path: &str,
    note_relative: bool,
) -> String {
    let stripped = strip_md_ext(resolved_note_path);
    if !note_relative {
        return stripped.to_string();
    }
    let source_dir = source_dir_from_path(source_path);
    if source_dir.is_empty() {
        return stripped.to_string();
    }
    compute_note_relative_path(source_dir, stripped)
}

pub(crate) fn format_markdown_link_href(source_path: &str, resolved_note_path: &str) -> String {
    let source_dir = source_dir_from_path(source_path);
    if source_dir.is_empty() {
        return resolved_note_path.to_string();
    }
    compute_relative_path(source_dir, resolved_note_path)
}

enum CollectedLink {
    Markdown { url: String, sourcepos: Sourcepos },
    Wiki { url: String, sourcepos: Sourcepos },
}

pub(crate) fn rewrite_links(
    markdown: &str,
    old_source_path: &str,
    new_source_path: &str,
    target_map: &HashMap<String, String>,
) -> RewriteResult {
    let arena = Arena::new();
    let options = markdown_options();
    let root = parse_document(&arena, markdown, &options);
    let line_starts = compute_line_starts(markdown);
    let source_moved = old_source_path != new_source_path;
    let mut replacements: Vec<(usize, usize, String)> = Vec::new();

    for node in root.descendants() {
        let collected = {
            let data = node.data.borrow();
            let sp = data.sourcepos;
            match &data.value {
                NodeValue::Link(link) if !is_external_url(&link.url) => {
                    Some(CollectedLink::Markdown {
                        url: link.url.clone(),
                        sourcepos: sp,
                    })
                }
                NodeValue::WikiLink(link) => Some(CollectedLink::Wiki {
                    url: link.url.clone(),
                    sourcepos: sp,
                }),
                _ => None,
            }
        };

        let collected = match collected {
            Some(c) => c,
            None => continue,
        };

        match collected {
            CollectedLink::Wiki { .. } if is_embedded_wikilink(node) => continue,
            CollectedLink::Markdown { url, sourcepos } => {
                let parsed = match parse_internal_markdown_target(&url) {
                    Some(p) => p,
                    None => continue,
                };
                let is_relative = is_note_relative_target(&parsed);
                let resolved = match resolve_wiki_target(old_source_path, &parsed) {
                    Some(r) => r,
                    None => continue,
                };

                let new_target = if let Some(mapped) = target_map.get(&resolved) {
                    mapped.clone()
                } else if source_moved && is_relative {
                    resolved
                } else if source_moved && !is_relative {
                    continue;
                } else {
                    continue;
                };

                let new_href = if is_relative {
                    format_markdown_link_href(new_source_path, &new_target)
                } else {
                    new_target.clone()
                };
                let (byte_start, byte_end) =
                    match sourcepos_to_byte_range(&line_starts, sourcepos) {
                        Some(range) => range,
                        None => continue,
                    };
                if byte_end > markdown.len() {
                    continue;
                }
                let span = &markdown[byte_start..byte_end];
                if !span.starts_with('[') || !span.ends_with(')') {
                    continue;
                }
                let split = match span.rfind("](") {
                    Some(pos) => pos,
                    None => continue,
                };
                let label = &span[1..split];
                let raw_destination = &span[split + 2..span.len() - 1];
                let trimmed_destination = raw_destination.trim();
                let had_angle_wrapping = trimmed_destination.starts_with('<')
                    && trimmed_destination.ends_with('>')
                    && trimmed_destination.len() >= 2;

                let replacement_destination = if had_angle_wrapping
                    || markdown_destination_needs_angle_brackets(&new_href)
                {
                    format!("<{new_href}>")
                } else {
                    new_href.clone()
                };
                let replacement = format!("[{label}]({replacement_destination})");
                if replacement != span {
                    replacements.push((byte_start, byte_end, replacement));
                }
            }
            CollectedLink::Wiki { url, sourcepos } => {
                let raw_target = match parse_wiki_link_target(&url) {
                    Some(t) => t,
                    None => continue,
                };
                let is_relative = is_note_relative_target(&raw_target);
                let resolved = match resolve_wiki_target(old_source_path, &raw_target) {
                    Some(r) => r,
                    None => continue,
                };

                let new_target = if let Some(mapped) = target_map.get(&resolved) {
                    mapped.clone()
                } else if source_moved && is_relative {
                    resolved
                } else {
                    continue;
                };

                let new_wiki = format_wiki_target(new_source_path, &new_target, is_relative);
                let (byte_start, byte_end) =
                    match sourcepos_to_byte_range(&line_starts, sourcepos) {
                        Some(range) => range,
                        None => continue,
                    };
                if byte_end > markdown.len() {
                    continue;
                }
                let span = &markdown[byte_start..byte_end];
                if !span.starts_with("[[") || !span.ends_with("]]") || span.len() < 5 {
                    continue;
                }
                let inner = &span[2..span.len() - 2];
                let replacement = if let Some(pipe_pos) = inner.find('|') {
                    let label = &inner[pipe_pos + 1..];
                    format!("[[{new_wiki}|{label}]]")
                } else {
                    format!("[[{new_wiki}]]")
                };
                if replacement != span {
                    replacements.push((byte_start, byte_end, replacement));
                }
            }
        }
    }

    if replacements.is_empty() {
        return RewriteResult {
            markdown: markdown.to_string(),
            changed: false,
        };
    }

    replacements.sort_by(|a, b| b.0.cmp(&a.0));
    let mut result = markdown.to_string();
    for (start, end, replacement) in replacements {
        result.replace_range(start..end, &replacement);
    }

    RewriteResult {
        markdown: result,
        changed: true,
    }
}
