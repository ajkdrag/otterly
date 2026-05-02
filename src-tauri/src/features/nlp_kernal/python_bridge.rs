use std::path::Path;
use std::sync::Once;

use pyo3::prelude::*;
use pyo3::types::{PyDict, PyList};
use serde::{Deserialize, Serialize};

static INIT_PYTHON: Once = Once::new();

fn ensure_python_path(nlp_kernal_dir: &Path) {
    INIT_PYTHON.call_once(|| {
        Python::with_gil(|py| {
            let sys = py.import("sys").expect("failed to import sys");
            let binding = sys
                .getattr("path")
                .expect("failed to get sys.path");
            let path: &Bound<'_, PyList> = binding
                .downcast()
                .expect("sys.path is not a list");
            let parent = nlp_kernal_dir
                .parent()
                .unwrap_or(nlp_kernal_dir);
            let dir_str = parent.to_string_lossy().to_string();
            let _ = path.insert(0, dir_str);
        });
    });
}

fn nlp_kernal_path() -> std::path::PathBuf {
    let exe = std::env::current_exe().unwrap_or_default();
    let base = exe
        .parent()
        .and_then(|p| p.parent())
        .and_then(|p| p.parent())
        .unwrap_or_else(|| Path::new("."));

    let candidates = [
        base.join("nlp_kernal"),
        base.join("../nlp_kernal"),
        base.join("../../nlp_kernal"),
        std::env::current_dir()
            .unwrap_or_default()
            .join("nlp_kernal"),
        std::env::current_dir()
            .unwrap_or_default()
            .parent()
            .unwrap_or_else(|| Path::new("."))
            .join("nlp_kernal"),
    ];

    for c in &candidates {
        if c.join("__init__.py").exists() {
            return c.clone();
        }
    }

    candidates.last().unwrap().clone()
}

pub fn init() {
    let path = nlp_kernal_path();
    ensure_python_path(&path);
}

#[allow(dead_code)]
pub fn is_available() -> bool {
    Python::with_gil(|py| {
        py.import("nlp_kernal").is_ok()
    })
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PyNlpCapabilities {
    pub tokenize: bool,
    pub extract_keywords: bool,
    pub jieba: bool,
    pub sentiment: bool,
    pub ner_rule: bool,
    pub ner_ml: bool,
    pub classifier: bool,
}

pub fn get_capabilities() -> Result<PyNlpCapabilities, String> {
    init();
    Python::with_gil(|py| {
        let module = py.import("nlp_kernal").map_err(|e| format!("import error: {e}"))?;
        let result = module
            .call_method0("get_capabilities")
            .map_err(|e| format!("call error: {e}"))?;
        let dict: &Bound<'_, PyDict> = result.downcast().map_err(|e| format!("type error: {e}"))?;

        let get_bool = |key: &str| -> bool {
            dict.get_item(key)
                .ok()
                .flatten()
                .and_then(|v| v.extract::<bool>().ok())
                .unwrap_or(false)
        };

        Ok(PyNlpCapabilities {
            tokenize: get_bool("tokenize"),
            extract_keywords: get_bool("extract_keywords"),
            jieba: get_bool("jieba"),
            sentiment: get_bool("sentiment"),
            ner_rule: get_bool("ner_rule"),
            ner_ml: get_bool("ner_ml"),
            classifier: get_bool("classifier"),
        })
    })
}

pub fn py_tokenize(text: &str) -> Result<Vec<String>, String> {
    init();
    Python::with_gil(|py| {
        let module = py.import("nlp_kernal").map_err(|e| format!("import error: {e}"))?;
        let result = module
            .call_method1("tokenize", (text,))
            .map_err(|e| format!("call error: {e}"))?;
        result
            .extract::<Vec<String>>()
            .map_err(|e| format!("extract error: {e}"))
    })
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PyKeyword {
    pub word: String,
    pub count: usize,
}

pub fn py_extract_keywords(text: &str, top_n: usize) -> Result<Vec<PyKeyword>, String> {
    init();
    Python::with_gil(|py| {
        let module = py.import("nlp_kernal").map_err(|e| format!("import error: {e}"))?;
        let result = module
            .call_method1("extract_keywords", (text, top_n))
            .map_err(|e| format!("call error: {e}"))?;
        let list: &Bound<'_, PyList> = result.downcast().map_err(|e| format!("type error: {e}"))?;

        let mut keywords = Vec::new();
        for item in list.iter() {
            let dict: &Bound<'_, PyDict> = item.downcast().map_err(|e| format!("type error: {e}"))?;
            let word: String = dict
                .get_item("word")
                .ok()
                .flatten()
                .and_then(|v| v.extract().ok())
                .unwrap_or_default();
            let count: usize = dict
                .get_item("count")
                .ok()
                .flatten()
                .and_then(|v| v.extract().ok())
                .unwrap_or(0);
            keywords.push(PyKeyword { word, count });
        }
        Ok(keywords)
    })
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PySentiment {
    pub label: String,
    pub score: f64,
}

pub fn py_analyze_sentiment(text: &str) -> Result<PySentiment, String> {
    init();
    Python::with_gil(|py| {
        let module = py.import("nlp_kernal").map_err(|e| format!("import error: {e}"))?;
        let result = module
            .call_method1("analyze_sentiment", (text,))
            .map_err(|e| format!("call error: {e}"))?;
        let dict: &Bound<'_, PyDict> = result.downcast().map_err(|e| format!("type error: {e}"))?;

        Ok(PySentiment {
            label: dict
                .get_item("label")
                .ok()
                .flatten()
                .and_then(|v| v.extract().ok())
                .unwrap_or_else(|| "unknown".to_string()),
            score: dict
                .get_item("score")
                .ok()
                .flatten()
                .and_then(|v| v.extract().ok())
                .unwrap_or(0.0),
        })
    })
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PyEntity {
    pub entity_type: String,
    pub value: String,
    pub start: usize,
    pub end: usize,
}

pub fn py_extract_entities(text: &str) -> Result<Vec<PyEntity>, String> {
    init();
    Python::with_gil(|py| {
        let module = py.import("nlp_kernal").map_err(|e| format!("import error: {e}"))?;
        let result = module
            .call_method1("extract_entities", (text,))
            .map_err(|e| format!("call error: {e}"))?;
        let list: &Bound<'_, PyList> = result.downcast().map_err(|e| format!("type error: {e}"))?;

        let mut entities = Vec::new();
        for item in list.iter() {
            let dict: &Bound<'_, PyDict> = item.downcast().map_err(|e| format!("type error: {e}"))?;
            entities.push(PyEntity {
                entity_type: dict.get_item("type").ok().flatten().and_then(|v| v.extract().ok()).unwrap_or_default(),
                value: dict.get_item("value").ok().flatten().and_then(|v| v.extract().ok()).unwrap_or_default(),
                start: dict.get_item("start").ok().flatten().and_then(|v| v.extract().ok()).unwrap_or(0),
                end: dict.get_item("end").ok().flatten().and_then(|v| v.extract().ok()).unwrap_or(0),
            });
        }
        Ok(entities)
    })
}

pub fn py_extract_entities_ml(text: &str) -> Result<Vec<PyEntity>, String> {
    init();
    Python::with_gil(|py| {
        let module = py.import("nlp_kernal").map_err(|e| format!("import error: {e}"))?;
        let result = module
            .call_method1("extract_entities_ml", (text,))
            .map_err(|e| format!("call error: {e}"))?;
        let list: &Bound<'_, PyList> = result.downcast().map_err(|e| format!("type error: {e}"))?;

        let mut entities = Vec::new();
        for item in list.iter() {
            let dict: &Bound<'_, PyDict> = item.downcast().map_err(|e| format!("type error: {e}"))?;
            entities.push(PyEntity {
                entity_type: dict.get_item("type").ok().flatten().and_then(|v| v.extract().ok()).unwrap_or_default(),
                value: dict.get_item("value").ok().flatten().and_then(|v| v.extract().ok()).unwrap_or_default(),
                start: dict.get_item("start").ok().flatten().and_then(|v| v.extract().ok()).unwrap_or(0),
                end: dict.get_item("end").ok().flatten().and_then(|v| v.extract().ok()).unwrap_or(0),
            });
        }
        Ok(entities)
    })
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PyClassifyResult {
    pub label: String,
    pub label_code: String,
    pub score: f64,
    pub method: String,
    pub is_confident: bool,
}

pub fn py_classify_text(text: &str) -> Result<PyClassifyResult, String> {
    init();
    Python::with_gil(|py| {
        let module = py.import("nlp_kernal").map_err(|e| format!("import error: {e}"))?;
        let result = module
            .call_method1("classify_text", (text,))
            .map_err(|e| format!("call error: {e}"))?;
        let dict: &Bound<'_, PyDict> = result.downcast().map_err(|e| format!("type error: {e}"))?;

        Ok(PyClassifyResult {
            label: dict.get_item("label").ok().flatten().and_then(|v| v.extract().ok()).unwrap_or_else(|| "unknown".to_string()),
            label_code: dict.get_item("label_code").ok().flatten().and_then(|v| v.extract().ok()).unwrap_or_default(),
            score: dict.get_item("score").ok().flatten().and_then(|v| v.extract().ok()).unwrap_or(0.0),
            method: dict.get_item("method").ok().flatten().and_then(|v| v.extract().ok()).unwrap_or_else(|| "unknown".to_string()),
            is_confident: dict.get_item("is_confident").ok().flatten().and_then(|v| v.extract().ok()).unwrap_or(false),
        })
    })
}
