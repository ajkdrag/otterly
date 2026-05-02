use std::collections::HashMap;
use serde::{Deserialize, Serialize};

/// BPE (Byte Pair Encoding) analysis result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BpeAnalysis {
    /// Total number of BPE tokens
    pub token_count: usize,
    /// The BPE vocabulary size after training
    pub vocab_size: usize,
    /// Number of merge operations performed
    pub num_merges: usize,
    /// Compression ratio: original bytes / token count
    pub compression_ratio: f64,
    /// Average token length in characters
    pub avg_token_length: f64,
    /// Top merge rules applied (pair -> merged, count)
    pub top_merges: Vec<BpeMergeInfo>,
    /// Token frequency distribution (top 30)
    pub top_tokens: Vec<BpeTokenFreq>,
    /// The final tokens (first 200 for display)
    pub sample_tokens: Vec<String>,
    /// Original text length in bytes
    pub original_byte_length: usize,
    /// Original text length in chars
    pub original_char_length: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BpeMergeInfo {
    pub pair: String,
    pub merged: String,
    pub frequency: usize,
    pub rank: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BpeTokenFreq {
    pub token: String,
    pub count: usize,
}

/// Run BPE tokenization analysis on the given text
pub fn analyze_bpe(text: &str, max_merges: usize) -> BpeAnalysis {
    let original_byte_length = text.len();
    let original_char_length = text.chars().count();

    if text.trim().is_empty() {
        return BpeAnalysis {
            token_count: 0,
            vocab_size: 0,
            num_merges: 0,
            compression_ratio: 0.0,
            avg_token_length: 0.0,
            top_merges: vec![],
            top_tokens: vec![],
            sample_tokens: vec![],
            original_byte_length,
            original_char_length,
        };
    }

    // Step 1: Pre-tokenize into words (split by whitespace and punctuation boundaries)
    let pre_tokens = pre_tokenize(text);

    // Step 2: Initialize each word as a sequence of characters
    let mut word_splits: Vec<(Vec<String>, usize)> = pre_tokens
        .into_iter()
        .map(|(word, count)| {
            let chars: Vec<String> = word.chars().map(|c| c.to_string()).collect();
            (chars, count)
        })
        .collect();

    // Collect initial vocabulary (all unique characters)
    let mut vocab: std::collections::HashSet<String> = std::collections::HashSet::new();
    for (splits, _) in &word_splits {
        for s in splits {
            vocab.insert(s.clone());
        }
    }

    // Step 3: Iteratively find and merge the most frequent pair
    let mut merge_history: Vec<BpeMergeInfo> = Vec::new();

    for rank in 0..max_merges {
        // Count all adjacent pairs
        let mut pair_counts: HashMap<(String, String), usize> = HashMap::new();
        for (splits, count) in &word_splits {
            if splits.len() < 2 {
                continue;
            }
            for i in 0..splits.len() - 1 {
                let pair = (splits[i].clone(), splits[i + 1].clone());
                *pair_counts.entry(pair).or_insert(0) += count;
            }
        }

        if pair_counts.is_empty() {
            break;
        }

        // Find the most frequent pair
        let best_pair = pair_counts
            .iter()
            .max_by_key(|(_, count)| *count)
            .map(|(pair, count)| (pair.clone(), *count));

        let Some(((left, right), freq)) = best_pair else {
            break;
        };

        if freq < 2 {
            break;
        }

        let merged = format!("{}{}", left, right);
        vocab.insert(merged.clone());

        merge_history.push(BpeMergeInfo {
            pair: format!("{} + {}", left, right),
            merged: merged.clone(),
            frequency: freq,
            rank: rank + 1,
        });

        // Apply the merge to all words
        for (splits, _) in &mut word_splits {
            let mut new_splits = Vec::with_capacity(splits.len());
            let mut i = 0;
            while i < splits.len() {
                if i + 1 < splits.len() && splits[i] == left && splits[i + 1] == right {
                    new_splits.push(merged.clone());
                    i += 2;
                } else {
                    new_splits.push(splits[i].clone());
                    i += 1;
                }
            }
            *splits = new_splits;
        }
    }

    // Step 4: Collect final tokens
    let mut all_tokens: Vec<String> = Vec::new();
    let mut token_freq: HashMap<String, usize> = HashMap::new();
    for (splits, count) in &word_splits {
        for s in splits {
            *token_freq.entry(s.clone()).or_insert(0) += count;
            for _ in 0..*count {
                all_tokens.push(s.clone());
            }
        }
    }

    let token_count = all_tokens.len();
    let vocab_size = vocab.len();
    let num_merges = merge_history.len();

    let compression_ratio = if token_count > 0 {
        original_char_length as f64 / token_count as f64
    } else {
        0.0
    };

    let total_token_chars: usize = all_tokens.iter().map(|t| t.chars().count()).sum();
    let avg_token_length = if token_count > 0 {
        total_token_chars as f64 / token_count as f64
    } else {
        0.0
    };

    // Top tokens by frequency
    let mut top_tokens: Vec<BpeTokenFreq> = token_freq
        .into_iter()
        .map(|(token, count)| BpeTokenFreq { token, count })
        .collect();
    top_tokens.sort_by(|a, b| b.count.cmp(&a.count));
    top_tokens.truncate(30);

    // Top merges (already sorted by rank)
    let top_merges: Vec<BpeMergeInfo> = merge_history.into_iter().take(20).collect();

    // Sample tokens for display
    let sample_tokens: Vec<String> = all_tokens.into_iter().take(200).collect();

    BpeAnalysis {
        token_count,
        vocab_size,
        num_merges,
        compression_ratio,
        avg_token_length,
        top_merges,
        top_tokens,
        sample_tokens,
        original_byte_length,
        original_char_length,
    }
}

/// Pre-tokenize text into words with their frequencies
fn pre_tokenize(text: &str) -> Vec<(String, usize)> {
    let mut word_counts: HashMap<String, usize> = HashMap::new();

    let mut current_word = String::new();
    for ch in text.chars() {
        if ch.is_alphanumeric() || ch == '_' || ch == '\'' {
            current_word.push(ch);
        } else {
            if !current_word.is_empty() {
                *word_counts.entry(current_word.clone()).or_insert(0) += 1;
                current_word.clear();
            }
            // Non-whitespace punctuation becomes its own token
            if !ch.is_whitespace() {
                let s = ch.to_string();
                *word_counts.entry(s).or_insert(0) += 1;
            }
        }
    }
    if !current_word.is_empty() {
        *word_counts.entry(current_word).or_insert(0) += 1;
    }

    word_counts.into_iter().collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_bpe_basic() {
        let text = "the cat sat on the mat the cat sat";
        let result = analyze_bpe(text, 50);
        assert!(result.token_count > 0);
        assert!(result.vocab_size > 0);
        assert!(result.compression_ratio > 0.0);
    }

    #[test]
    fn test_bpe_empty() {
        let result = analyze_bpe("", 50);
        assert_eq!(result.token_count, 0);
    }

    #[test]
    fn test_bpe_chinese() {
        let text = "你好世界你好中国你好";
        let result = analyze_bpe(text, 50);
        assert!(result.token_count > 0);
    }
}
