# 🧠 LeapGrowNotes 本地 LLM/NLU 技术方案

> 在 Mac M2 芯片上本地运行语言模型，实现文本理解（NLU）与摘要生成
>
> **版本**: v2.0.0  
> **最后更新**: 2026-05-01  
> **目标平台**: Apple Silicon (M2/M2 Pro/M2 Max/M3/M4)  
> **核心场景**: 笔记文本理解 + 自动摘要

---

## 1. 需求概述

### 1.1 核心目标

| 能力 | 说明 | 优先级 |
|------|------|--------|
| 文本摘要 | 对单篇笔记生成 2-3 句摘要 | P0 |
| 关键词/主题提取 | 自动识别笔记的核心主题和关键概念 | P0 |
| 语义搜索 | 基于语义理解的笔记检索（非关键词匹配） | P1 |
| 问答 | 基于笔记内容回答用户问题 | P1 |
| 笔记分类建议 | 自动建议笔记的标签或分类 | P2 |

### 1.2 硬性约束

| 约束 | 要求 |
|------|------|
| 完全本地运行 | 不依赖云端 API，离线可用 |
| Apple Silicon 优化 | 充分利用 M2 的 Neural Engine / GPU |
| 内存占用 | 模型 + 推理 ≤ 4GB RAM（M2 基础款 8GB 可用） |
| 首次加载 | 模型冷启动 < 5 秒 |
| 推理延迟 | 单篇笔记摘要 < 3 秒（1000 字以内） |
| 安装体积 | 模型文件 ≤ 2GB |
| 中文支持 | 必须良好支持中文理解和生成 |

---

## 2. 模型选型

### 2.1 候选模型对比

| 模型 | 参数量 | 量化后大小 | 中文能力 | M2 推理速度 | 推荐度 |
|------|--------|-----------|---------|------------|--------|
| **Qwen2.5-1.5B-Instruct** | 1.5B | ~1.0GB (Q4_K_M) | ⭐⭐⭐⭐⭐ 原生中文 | ~40 tok/s | ⭐⭐⭐⭐⭐ |
| **Qwen2.5-3B-Instruct** | 3B | ~1.8GB (Q4_K_M) | ⭐⭐⭐⭐⭐ 原生中文 | ~25 tok/s | ⭐⭐⭐⭐ |
| Phi-3.5-mini-instruct | 3.8B | ~2.2GB (Q4_K_M) | ⭐⭐⭐ 中等 | ~20 tok/s | ⭐⭐⭐ |
| Gemma-2-2B-it | 2B | ~1.4GB (Q4_K_M) | ⭐⭐⭐ 中等 | ~30 tok/s | ⭐⭐⭐ |
| MiniCPM-2B | 2B | ~1.2GB (Q4_K_M) | ⭐⭐⭐⭐⭐ 原生中文 | ~35 tok/s | ⭐⭐⭐⭐ |
| Yi-1.5-6B-Chat | 6B | ~3.5GB (Q4_K_M) | ⭐⭐⭐⭐⭐ 原生中文 | ~12 tok/s | ⭐⭐⭐ |

### 2.2 推荐方案

**主选：Qwen2.5-1.5B-Instruct (Q4_K_M 量化)**

理由：
- 阿里通义千问系列，中文理解能力在同参数量级中最强
- 1.5B 参数量化后仅 ~1GB，M2 基础款轻松运行
- 支持 32K 上下文窗口，可处理长笔记
- 推理速度快（~40 tok/s on M2），摘要生成感知几乎实时
- 社区活跃，GGUF 格式现成可用

**备选：Qwen2.5-3B-Instruct (Q4_K_M)**

- 精度更高，适合 M2 Pro/Max 或内存 ≥ 16GB 的设备
- 摘要质量明显优于 1.5B
- 可作为"高质量模式"选项

### 2.3 Embedding 模型（语义搜索用）

| 模型 | 维度 | 大小 | 中文能力 |
|------|------|------|---------|
| **BGE-small-zh-v1.5** | 512 | ~90MB | ⭐⭐⭐⭐⭐ |
| GTE-small | 384 | ~60MB | ⭐⭐⭐⭐ |
| all-MiniLM-L6-v2 | 384 | ~80MB | ⭐⭐ |

**推荐：BGE-small-zh-v1.5** — 中文语义搜索首选，体积小、速度快。

---

## 3. 推理框架选型

### 3.1 候选框架对比

| 框架 | Apple Silicon 支持 | Rust 集成 | 量化支持 | 推荐度 |
|------|-------------------|-----------|---------|--------|
| **llama.cpp** | ⭐⭐⭐⭐⭐ Metal GPU 加速 | ✅ llama-cpp-rs | GGUF Q2-Q8 | ⭐⭐⭐⭐⭐ |
| **MLX** | ⭐⭐⭐⭐⭐ 原生 Apple 框架 | ⚠️ 需 Python 桥接 | MLX 格式 | ⭐⭐⭐⭐ |
| Candle | ⭐⭐⭐⭐ Metal 支持 | ✅ 纯 Rust | GGUF/safetensors | ⭐⭐⭐⭐ |
| Ollama | ⭐⭐⭐⭐⭐ Metal 加速 | ⚠️ REST API | GGUF | ⭐⭐⭐ |
| ONNX Runtime | ⭐⭐⭐⭐ CoreML 后端 | ✅ ort crate | ONNX 格式 | ⭐⭐⭐ |

### 3.2 推荐方案：llama.cpp + llama-cpp-rs

**理由**：

1. **最佳 Metal 支持**：llama.cpp 对 Apple Silicon Metal GPU 的优化最成熟，推理速度最快
2. **纯 Rust 集成**：`llama-cpp-rs` crate 提供安全的 Rust binding，可直接嵌入 Tauri 后端
3. **GGUF 生态成熟**：几乎所有主流模型都有现成的 GGUF 量化版本
4. **内存效率**：支持 mmap 加载，模型文件不需要完全加载到内存
5. **无需外部依赖**：不需要用户安装 Python/Ollama 等额外软件

### 3.3 备选方案：MLX（通过现有 Python 桥接）

如果 llama-cpp-rs 集成遇到困难，可复用项目现有的 PyO3 Python 桥接（`nlp_kernal`），通过 MLX 框架运行模型：

```python
# nlp_kernal/llm/mlx_engine.py
import mlx_lm

def summarize(text: str, model_path: str) -> str:
    model, tokenizer = mlx_lm.load(model_path)
    prompt = f"请为以下文本生成简短摘要：\n\n{text}\n\n摘要："
    return mlx_lm.generate(model, tokenizer, prompt, max_tokens=200)
```

优点：Apple 原生框架，MLX 专为 Apple Silicon 设计
缺点：增加 Python 依赖，启动稍慢

---

## 4. 系统架构

### 4.1 整体架构

```
┌────────────────────────────────────────────────┐
│                  前端 (Svelte)                   │
│  ┌──────────┐  ┌──────────┐  ┌──────────────┐  │
│  │ NLP 面板  │  │ 搜索增强  │  │  摘要/问答 UI │  │
│  └─────┬────┘  └─────┬────┘  └──────┬───────┘  │
│        │             │              │           │
│  ┌─────▼─────────────▼──────────────▼───────┐   │
│  │           Tauri IPC 命令层                │   │
│  └─────────────────┬────────────────────────┘   │
│                    │                            │
│  ┌─────────────────▼────────────────────────┐   │
│  │          LLM 服务层 (Rust)                │   │
│  │  ┌────────────┐  ┌────────────────────┐  │   │
│  │  │ ModelManager│  │ PromptEngine       │  │   │
│  │  │ (加载/卸载) │  │ (Prompt 模板管理)   │  │   │
│  │  └──────┬─────┘  └────────┬───────────┘  │   │
│  │         │                 │              │   │
│  │  ┌──────▼─────────────────▼───────────┐  │   │
│  │  │     llama-cpp-rs (推理引擎)         │  │   │
│  │  │     Metal GPU 加速                  │  │   │
│  │  └────────────────────────────────────┘  │   │
│  └──────────────────────────────────────────┘   │
│                    │                            │
│  ┌─────────────────▼────────────────────────┐   │
│  │          模型存储                         │   │
│  │  ~/Library/Application Support/           │   │
│  │    LeapGrowNotes/models/                  │   │
│  │    ├── qwen2.5-1.5b-instruct-q4_k_m.gguf│   │
│  │    └── bge-small-zh-v1.5.gguf            │   │
│  └──────────────────────────────────────────┘   │
└────────────────────────────────────────────────┘
```

### 4.2 后端模块设计

```
src-tauri/src/features/llm/
├── mod.rs                    # 模块注册
├── commands.rs               # Tauri 命令
│   ├── llm_summarize         # 生成摘要
│   ├── llm_extract_topics    # 提取主题/关键词
│   ├── llm_answer            # 基于笔记问答
│   ├── llm_suggest_tags      # 标签建议
│   ├── llm_model_status      # 模型加载状态
│   ├── llm_load_model        # 加载/切换模型
│   ├── llm_unload_model      # 卸载模型释放内存
│   └── llm_list_models       # 列出可用模型
├── engine.rs                 # 推理引擎封装
│   ├── LlmEngine            # llama-cpp-rs 封装
│   ├── load_model()          # 模型加载（mmap）
│   ├── generate()            # 文本生成
│   └── embed()               # Embedding 生成
├── prompt.rs                 # Prompt 模板
│   ├── SUMMARIZE_PROMPT      # 摘要 prompt
│   ├── TOPIC_PROMPT          # 主题提取 prompt
│   ├── QA_PROMPT             # 问答 prompt
│   └── TAG_PROMPT            # 标签建议 prompt
├── model_manager.rs          # 模型生命周期管理
│   ├── download_model()      # 从 HuggingFace 下载
│   ├── model_exists()        # 检查本地是否已有
│   └── get_model_path()      # 获取模型路径
└── types.rs                  # 类型定义
    ├── LlmConfig             # 模型配置
    ├── SummarizeResult       # 摘要结果
    ├── TopicResult           # 主题提取结果
    └── ModelStatus           # 模型状态
```

### 4.3 模型生命周期管理

```
应用启动
  │
  ├─ 检查模型是否已下载
  │   ├─ 已下载 → 就绪（不自动加载，按需加载）
  │   └─ 未下载 → 显示"下载模型"提示
  │
  ├─ 用户首次使用 NLU 功能
  │   ├─ 模型未加载 → 后台加载模型（~2-3秒）→ 显示加载进度
  │   └─ 模型已加载 → 直接推理
  │
  ├─ 空闲超时（可配置，默认 10 分钟）
  │   └─ 自动卸载模型 → 释放内存
  │
  └─ 应用关闭
      └─ 卸载模型
```

---

## 5. Prompt 工程

### 5.1 摘要生成

```
<|im_start|>system
你是一个专业的笔记助手。请根据用户提供的笔记内容，生成一个简洁的中文摘要。
要求：
- 2-3 句话概括核心内容
- 保留关键信息和数据
- 使用简洁的书面语
- 如果笔记包含代码，说明代码的功能而非代码本身
<|im_end|>
<|im_start|>user
请为以下笔记生成摘要：

{note_content}
<|im_end|>
<|im_start|>assistant
```

### 5.2 主题/关键词提取

```
<|im_start|>system
你是一个专业的文本分析助手。请从用户提供的笔记中提取核心主题和关键词。
要求：
- 提取 3-5 个关键词，用逗号分隔
- 识别 1-2 个核心主题
- 输出格式：JSON {"keywords": [...], "topics": [...]}
<|im_end|>
<|im_start|>user
请分析以下笔记：

{note_content}
<|im_end|>
<|im_start|>assistant
```

### 5.3 标签建议

```
<|im_start|>system
你是一个笔记整理助手。根据笔记内容，建议 2-4 个合适的标签。
标签应该：
- 简短（1-3个词）
- 反映笔记的主题领域
- 适合在知识库中分类检索
- 输出格式：JSON {"tags": [...]}
<|im_end|>
<|im_start|>user
请为以下笔记建议标签：

{note_content}
<|im_end|>
<|im_start|>assistant
```

---

## 6. 模型下载与管理

### 6.1 模型存储位置

```
~/Library/Application Support/LeapGrowNotes/models/
├── qwen2.5-1.5b-instruct-q4_k_m.gguf   # 主模型 ~1.0GB
├── bge-small-zh-v1.5.gguf               # Embedding 模型 ~90MB
└── models.json                           # 模型元数据
```

### 6.2 下载策略

| 策略 | 说明 |
|------|------|
| 按需下载 | 用户首次使用 NLU 功能时提示下载 |
| 断点续传 | 支持中断后继续下载 |
| 校验完整性 | SHA256 校验下载文件 |
| 镜像源 | 支持 HuggingFace + 国内镜像（hf-mirror.com） |
| 手动导入 | 支持用户手动放置 GGUF 文件 |

### 6.3 模型配置 UI

```
设置 → AI 助手
├── 🤖 模型选择         [Qwen2.5-1.5B / Qwen2.5-3B / 自定义]
├── 📦 模型状态         [已下载 1.0GB / 未下载]
├── ⬇️ 下载/更新模型    [按钮]
├── 🗑️ 删除本地模型     [按钮]
├── ⚡ GPU 加速          [开关，默认开]
├── 🧵 推理线程数       [自动 / 手动设置]
├── 📐 最大上下文长度    [2048 / 4096 / 8192]
├── 🌡️ 温度             [0.3 — 摘要建议低温]
└── ⏱️ 空闲卸载时间      [5分钟 / 10分钟 / 不自动卸载]
```

---

## 7. 集成到现有系统

### 7.1 与 NLP 面板集成

在现有 `nlp_panel.svelte` 中新增 AI 摘要区域：

```
📊 Basic Stats
📈 Metrics
📑 Headings
🔗 Links
💻 Code Blocks
🏷️ Keywords (Rust)
🔑 Keywords (Python/jieba)
🎭 Sentiment
🏢 Entities
─────────────────────
🤖 AI Summary          ← 新增
   [生成摘要] 按钮
   摘要文本显示区域
   
🏷️ AI Tag Suggestions  ← 新增
   建议标签列表
   [应用到笔记] 按钮
```

### 7.2 与搜索集成

在 Omnibar 中新增语义搜索模式：

```
┌──────────────────────────────┐
│ 🔍 搜索笔记...               │
│ [关键词] [语义] [命令]  ← 新增语义模式
│                              │
│ 语义搜索结果：                │
│ 📄 笔记A (相似度: 0.92)      │
│ 📄 笔记B (相似度: 0.85)      │
│ 📄 笔记C (相似度: 0.78)      │
└──────────────────────────────┘
```

### 7.3 与积分系统联动

| 行为 | 积分 | 宠物经验 |
|------|------|---------|
| 生成笔记摘要 | +3 pts | +3 exp |
| 应用 AI 标签建议 | +2 pts | +2 exp |
| 使用语义搜索 | +1 pts | +1 exp |
| 使用 AI 问答 | +2 pts | +2 exp |

---

## 8. 性能优化

### 8.1 Apple Silicon 特有优化

| 优化项 | 说明 |
|--------|------|
| Metal GPU 推理 | llama.cpp 自动使用 Metal API 加速矩阵运算 |
| 统一内存架构 | M2 的 CPU/GPU 共享内存，无需数据拷贝 |
| mmap 模型加载 | 模型文件通过 mmap 映射，减少内存占用 |
| Neural Engine | Embedding 模型可通过 Core ML 利用 ANE |
| 批处理 | 多篇笔记的 Embedding 批量计算 |

### 8.2 推理参数调优

```rust
LlmConfig {
    n_ctx: 4096,           // 上下文长度（覆盖大部分笔记）
    n_batch: 512,          // 批处理大小
    n_threads: 4,          // CPU 线程数（M2 效率核心）
    n_gpu_layers: 99,      // 全部层放 GPU（Metal）
    temperature: 0.3,      // 低温度 → 更确定性的摘要
    top_p: 0.9,            // nucleus sampling
    repeat_penalty: 1.1,   // 避免重复
    max_tokens: 300,       // 摘要最大 token 数
}
```

### 8.3 缓存策略

| 缓存层 | 说明 |
|--------|------|
| 模型缓存 | 加载后保持在内存，空闲超时自动卸载 |
| 摘要缓存 | 按 `(note_path, content_hash)` 缓存，内容不变不重新生成 |
| Embedding 缓存 | 存入 SQLite `embedding_vectors` 表，按 mtime 判断是否需要更新 |
| KV Cache | llama.cpp 内置 KV cache，加速连续推理 |

### 8.4 缓存数据库

```sql
-- 摘要缓存
CREATE TABLE IF NOT EXISTS llm_summaries (
    note_path TEXT PRIMARY KEY,
    content_hash TEXT NOT NULL,
    summary TEXT NOT NULL,
    topics TEXT,              -- JSON array
    tags TEXT,                -- JSON array
    model_id TEXT NOT NULL,
    created_at INTEGER NOT NULL
);

-- Embedding 向量
CREATE TABLE IF NOT EXISTS embedding_vectors (
    note_path TEXT PRIMARY KEY,
    vector BLOB NOT NULL,     -- f32 数组序列化
    model_id TEXT NOT NULL,
    mtime INTEGER NOT NULL
);
```

---

## 9. 开发计划

### Phase 1：基础推理集成（3 天）

- [ ] 添加 `llama-cpp-rs` 依赖到 Cargo.toml
- [ ] 实现 `LlmEngine`（模型加载/卸载/生成）
- [ ] 实现 `ModelManager`（下载/路径管理/状态检查）
- [ ] 实现 4 个基础 Tauri 命令（summarize/topics/model_status/load_model）
- [ ] 编写 Prompt 模板（摘要/主题/标签）
- [ ] 基础错误处理和超时控制

### Phase 2：前端集成（2 天）

- [ ] NLP 面板新增 AI Summary 区域
- [ ] 模型下载/管理 UI（设置面板）
- [ ] 加载状态指示器（spinner/进度条）
- [ ] 摘要结果缓存展示

### Phase 3：语义搜索（2 天）

- [ ] BGE-small-zh Embedding 模型集成
- [ ] Embedding 索引构建（后台增量）
- [ ] 语义搜索 Tauri 命令
- [ ] Omnibar 语义搜索模式

### Phase 4：高级功能（2 天）

- [ ] AI 标签建议 + 一键应用到 frontmatter
- [ ] 笔记问答功能
- [ ] 与积分/宠物系统联动
- [ ] 性能监控（推理时间、内存占用显示）

**总计：~9 天**

---

## 10. 依赖清单

### Rust 依赖

```toml
[dependencies]
# LLM 推理
llama-cpp-2 = { version = "0.1", features = ["metal"] }  # llama.cpp Rust binding
# 或使用
# candle-core = { version = "0.8", features = ["metal"] }
# candle-transformers = "0.8"

# 模型下载
reqwest = { version = "0.12", features = ["stream"] }
sha2 = "0.10"                    # 文件校验
indicatif = "0.17"               # 下载进度
```

### 模型文件

| 模型 | 来源 | 大小 | 用途 |
|------|------|------|------|
| Qwen2.5-1.5B-Instruct-Q4_K_M.gguf | HuggingFace / hf-mirror | ~1.0GB | 文本生成 |
| bge-small-zh-v1.5.Q8_0.gguf | HuggingFace / hf-mirror | ~90MB | 语义搜索 |

---

## 11. 风险与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| llama-cpp-rs API 不稳定 | 编译/运行问题 | 锁定版本；备选 Candle 或 MLX Python 桥接 |
| M2 基础款 8GB 内存不足 | 模型加载失败 | 默认 1.5B 模型（~1GB）；提供内存检测和警告 |
| 模型下载慢/失败 | 用户体验差 | 支持国内镜像；断点续传；手动导入 |
| 摘要质量不稳定 | 结果不可靠 | 低温度；严格 prompt；结果带置信度标签 |
| Metal API 版本兼容性 | 旧 macOS 不支持 | 最低要求 macOS 13.0；CPU fallback |
| 推理阻塞主线程 | UI 卡顿 | `tauri::async_runtime::spawn_blocking` 异步推理 |
| GGUF 格式未来变化 | 模型不兼容 | 跟踪 llama.cpp 版本；模型版本管理 |

---

## 12. 与现有 nlp_kernal 的关系

```
现有 nlp_kernal（纯 Rust + Python 桥接）
├── 词频统计、关键词提取、情感分析  ← 保留，轻量快速
├── BPE Token 分析                  ← 保留
├── 规则/ML NER                     ← 保留
└── StructBERT 中文 NER             ← 保留

新增 LLM 模块（llama.cpp）
├── 深度摘要生成                    ← 需要理解语义，非统计方法
├── 语义搜索（Embedding）           ← 需要向量表示
├── 智能标签建议                    ← 需要理解主题
└── 基于笔记的问答                  ← 需要推理能力
```

**定位区分**：
- `nlp_kernal`：轻量级统计/规则 NLP，零延迟，适合实时分析
- `llm`：深度语义理解，有加载延迟，适合按需调用的高质量分析

两者互补，不替代。

---

> 📌 **下一步行动**：从 Phase 1 开始，先集成 llama-cpp-rs + Qwen2.5-1.5B，实现基础摘要生成功能。
