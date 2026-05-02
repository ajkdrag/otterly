use std::collections::HashMap;

use super::types::*;

const STOP_WORDS: &[&str] = &[
    "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for", "of", "with", "by",
    "from", "is", "are", "was", "were", "be", "been", "being", "have", "has", "had", "do",
    "does", "did", "will", "would", "could", "should", "may", "might", "shall", "can", "it",
    "its", "this", "that", "these", "those", "i", "you", "he", "she", "we", "they", "me",
    "him", "her", "us", "them", "my", "your", "his", "our", "their", "not", "no", "if",
    "then", "else", "when", "while", "as", "so", "than", "too", "very", "just", "about",
    "up", "out", "all", "also", "how", "each", "which", "what", "where", "who", "whom",
    "de", "la", "le", "les", "un", "une", "des", "du", "et", "en", "est", "que",
    "的", "了", "在", "是", "我", "有", "和", "就", "不", "人", "都", "一", "一个",
    "上", "也", "很", "到", "说", "要", "去", "你", "会", "着", "没有", "看", "好",
];

pub fn analyze(content: &str, file_size_bytes: u64, content_hash: String) -> NlpAnalysis {
    let lines: Vec<&str> = content.lines().collect();
    let line_count = lines.len();

    let (body_lines, code_blocks) = extract_code_blocks(&lines);
    let body_text = body_lines.join("\n");

    let char_count = content.chars().count();
    let char_count_no_spaces = content.chars().filter(|c| !c.is_whitespace()).count();

    let words = extract_words(&body_text);
    let word_count = words.len();
    let unique_words: std::collections::HashSet<&str> = words.iter().map(|s| s.as_str()).collect();
    let unique_word_count = unique_words.len();

    let sentences = count_sentences(&body_text);
    let sentence_count = sentences.max(1);

    let paragraph_count = count_paragraphs(content);

    let reading_time_minutes = word_count as f64 / 200.0;
    let avg_sentence_length = if sentence_count > 0 {
        word_count as f64 / sentence_count as f64
    } else {
        0.0
    };
    let vocabulary_richness = if word_count > 0 {
        unique_word_count as f64 / word_count as f64
    } else {
        0.0
    };

    let headings = count_headings(&lines);
    let links = count_links(content);
    let top_keywords = extract_keywords(&words, 15);

    NlpAnalysis {
        char_count,
        char_count_no_spaces,
        word_count,
        unique_word_count,
        sentence_count,
        paragraph_count,
        line_count,
        reading_time_minutes,
        avg_sentence_length,
        vocabulary_richness,
        headings,
        links,
        code_blocks,
        top_keywords,
        file_size_bytes,
        content_hash,
    }
}

fn extract_words(text: &str) -> Vec<String> {
    text.split(|c: char| c.is_whitespace() || c == '(' || c == ')' || c == '[' || c == ']')
        .filter(|w| !w.is_empty())
        .map(|w| w.trim_matches(|c: char| !c.is_alphanumeric()).to_lowercase())
        .filter(|w| !w.is_empty() && w.len() > 1)
        .collect()
}

fn count_sentences(text: &str) -> usize {
    let mut count = 0;
    let mut prev_was_end = false;
    for ch in text.chars() {
        if ch == '.' || ch == '!' || ch == '?' || ch == '。' || ch == '！' || ch == '？' {
            if !prev_was_end {
                count += 1;
            }
            prev_was_end = true;
        } else if !ch.is_whitespace() {
            prev_was_end = false;
        }
    }
    count
}

fn count_paragraphs(text: &str) -> usize {
    text.split("\n\n")
        .filter(|p| !p.trim().is_empty())
        .count()
        .max(1)
}

fn count_headings(lines: &[&str]) -> HeadingStats {
    let mut stats = HeadingStats {
        h1: 0, h2: 0, h3: 0, h4: 0, h5: 0, h6: 0, total: 0,
    };
    for line in lines {
        let trimmed = line.trim();
        if trimmed.starts_with("######") { stats.h6 += 1; }
        else if trimmed.starts_with("#####") { stats.h5 += 1; }
        else if trimmed.starts_with("####") { stats.h4 += 1; }
        else if trimmed.starts_with("###") { stats.h3 += 1; }
        else if trimmed.starts_with("##") { stats.h2 += 1; }
        else if trimmed.starts_with("# ") { stats.h1 += 1; }
    }
    stats.total = stats.h1 + stats.h2 + stats.h3 + stats.h4 + stats.h5 + stats.h6;
    stats
}

fn count_links(content: &str) -> LinkStats {
    let mut internal = 0;
    let mut external = 0;

    let mut i = 0;
    let chars: Vec<char> = content.chars().collect();
    while i < chars.len() {
        if i + 1 < chars.len() && chars[i] == '[' && chars[i + 1] == '[' {
            internal += 1;
            i += 2;
            while i < chars.len() && !(chars[i] == ']' && i + 1 < chars.len() && chars[i + 1] == ']') {
                i += 1;
            }
        }
        i += 1;
    }

    for cap in content.split("](") {
        if cap.starts_with("http://") || cap.starts_with("https://") {
            external += 1;
        }
    }

    LinkStats {
        internal_links: internal,
        external_links: external,
        total: internal + external,
    }
}

fn extract_code_blocks(lines: &[&str]) -> (Vec<String>, CodeBlockStats) {
    let mut body_lines = Vec::new();
    let mut in_code = false;
    let mut block_count = 0;
    let mut total_code_lines = 0;
    let mut languages = Vec::new();

    for line in lines {
        if line.trim_start().starts_with("```") {
            if !in_code {
                in_code = true;
                block_count += 1;
                let lang = line.trim_start().trim_start_matches('`').trim();
                if !lang.is_empty() && !languages.contains(&lang.to_string()) {
                    languages.push(lang.to_string());
                }
            } else {
                in_code = false;
            }
        } else if in_code {
            total_code_lines += 1;
        } else {
            body_lines.push(line.to_string());
        }
    }

    (body_lines, CodeBlockStats {
        block_count,
        total_lines: total_code_lines,
        languages,
    })
}

fn extract_keywords(words: &[String], top_n: usize) -> Vec<KeywordEntry> {
    let stop: std::collections::HashSet<&str> = STOP_WORDS.iter().copied().collect();
    let mut freq: HashMap<&str, usize> = HashMap::new();
    for w in words {
        if !stop.contains(w.as_str()) && w.len() > 2 {
            *freq.entry(w.as_str()).or_insert(0) += 1;
        }
    }

    let mut entries: Vec<_> = freq.into_iter()
        .filter(|(_, count)| *count > 1)
        .collect();
    entries.sort_by(|a, b| b.1.cmp(&a.1));
    entries.truncate(top_n);

    entries.into_iter()
        .map(|(word, count)| KeywordEntry { word: word.to_string(), count })
        .collect()
}
