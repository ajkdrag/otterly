# KCS NLP Function List

> 从 KCS (客酒智析) 项目提取的所有 NLP 相关模块、类与函数清单
> 版本: kcs0.6 | 181 个 Python 文件 | ~57,000 行代码

---

## 目录

1. [bow/ — 词袋与文本表示](#1-bow--词袋与文本表示)
2. [ner/ — 命名实体识别与知识图谱](#2-ner--命名实体识别与知识图谱)
3. [email_parser/ — 邮件解析系统](#3-email_parser--邮件解析系统)
4. [thread_builder/ — 三层级联线程分解引擎](#4-thread_builder--三层级联线程分解引擎)
5. [classifier/ — 文本分类器](#5-classifier--文本分类器)
6. [sentiment/ — 情感分析](#6-sentiment--情感分析)
7. [augmentation/ — 数据增强](#7-augmentation--数据增强)
8. [annotation/ — 数据标注](#8-annotation--数据标注)
9. [self_learning/ — 自学习系统](#9-self_learning--自学习系统)
10. [vllm_manager/ — LLM 推理服务管理](#10-vllm_manager--llm-推理服务管理)
11. [production/ — 生产化模块](#11-production--生产化模块)

---

## 1. bow/ — 词袋与文本表示

### builder.py — 词袋构建与 TF-IDF

| 函数/类 | 签名 | 说明 |
|---------|------|------|
| `clean_text` | `(text: str) -> str` | 文本清洗 |
| `detect_language` | `(text: str) -> str` | 语言检测 (中/英) |
| `tokenize_chinese` | `(text: str) -> list[str]` | 中文分词 (jieba) |
| `tokenize_english` | `(text: str) -> list[str]` | 英文分词 |
| `tokenize` | `(text: str) -> list[str]` | 通用分词 (自动检测语言) |
| `tokenize_with_nlp` | `(text: str, stem=False, lemmatize=False) -> list[str]` | 带词干化/词形还原的分词 |
| `filter_stopwords` | `(tokens: list[str]) -> list[str]` | 停用词过滤 |
| `scan_and_build` | `(source_db=None, output_db=None, batch_size=5000) -> dict` | 全库扫描构建词袋 |
| **`BagOfWordsBuilder`** | 类 | 词袋构建器 |
| `.process_record` | `(self, record: dict)` | 处理单条记录 |
| `.compute_tfidf` | `(self, top_n=5000) -> list[tuple]` | 计算 TF-IDF |
| `.save_to_sqlite` | `(self)` | 保存到 SQLite |
| `.get_stats` | `(self) -> dict` | 获取统计信息 |

### nlp_tools.py — NLP 工具集

| 函数/类 | 签名 | 说明 |
|---------|------|------|
| **`EnglishStemmer`** | 类 | 英文词干化器 |
| `.stem` | `(self, word: str) -> str` | 词干提取 (Snowball/Porter/Lancaster) |
| `.batch_stem` | `(self, words: list[str]) -> list[str]` | 批量词干化 |
| **`EnglishLemmatizer`** | 类 | 英文词形还原器 |
| `.lemmatize` | `(self, word: str, pos: str = "n") -> str` | 词形还原 |
| `.batch_lemmatize` | `(self, words: list[str]) -> list[str]` | 批量词形还原 |
| **`POSTagger`** | 类 | 词性标注器 |
| `.tag` | `(self, tokens: list[str]) -> list[tuple]` | 词性标注 |
| `.tag_chinese` | `(self, text: str) -> list[tuple]` | 中文词性标注 (jieba) |
| **`SubwordTokenizer`** | 类 | 子词分割器 (BPE) |
| `.tokenize` | `(self, text: str) -> list[str]` | 子词分割 |
| `.train` | `(self, texts: list[str], vocab_size: int)` | 训练子词词表 |

### text_repr.py — 文本表示 (向量化)

| 函数/类 | 签名 | 说明 |
|---------|------|------|
| **`NGramExtractor`** | 类 | N-gram 特征提取器 |
| `.extract` | `(self, tokens, n=2) -> list[tuple]` | 提取 N-gram |
| `.extract_char_ngrams` | `(self, text, n=3) -> list[str]` | 字符级 N-gram |
| **`Word2VecTrainer`** | 类 | Word2Vec 训练器 |
| `.train` | `(self, sentences, **kwargs) -> model` | 训练 Word2Vec |
| `.get_vector` | `(self, word) -> ndarray` | 获取词向量 |
| `.most_similar` | `(self, word, topn=10) -> list` | 相似词查询 |
| **`BERTEmbedder`** | 类 | BERT 文本嵌入器 |
| `.embed` | `(self, text: str) -> ndarray` | 单文本嵌入 |
| `.embed_batch` | `(self, texts: list[str]) -> ndarray` | 批量嵌入 |
| **`Doc2VecTrainer`** | 类 | Doc2Vec 训练器 |
| `.train` | `(self, documents) -> model` | 训练 Doc2Vec |
| `.infer_vector` | `(self, tokens) -> ndarray` | 推断文档向量 |

### domain.py — 酒店领域词典

| 变量 | 说明 |
|------|------|
| `HOTEL_DOMAIN_WORDS` | 酒店领域词典 (347 词) |
| `OTA_KEYWORDS` | OTA 平台关键词 |

---

## 2. ner/ — 命名实体识别与知识图谱

### config.py — NER 配置

| 类/常量 | 说明 |
|---------|------|
| **`EntityType`** (Enum) | 15 类实体: HOTEL, BOOKING_ID, SUPPLIER_ID, GUEST, CHECK_IN, CHECK_OUT, ROOM_TYPE, AMOUNT, OTA, CONTACT, LOCATION, BIZ_TYPE, ISSUE_TYPE, DATETIME, ORG |
| **`BizTypeConfig`** | 业务类型配置 (C01-C08) |
| **`ScanConfig`** | 扫描配置 |
| `SENDER_TO_OTA` | 27 个 OTA 域名映射 |
| `BIZ_TYPES` | 8 类业务类型 |
| `ISSUE_KEYWORDS` | 12 类问题词典 |
| `HOTEL_NAME_STOPWORDS` | 酒店名停用词 |
| `GUEST_NAME_STOPWORDS` | 客人名停用词 |

### db.py — 数据库读写

| 类 | 方法 | 说明 |
|----|------|------|
| **`DBReader`** | `.iterate_batches(batch_size)` | 批量迭代读取 |
| **`StructuredDBReader`** | `.iterate_batches(batch_size)` | L0-L3 结构化字段读取 |
| **`KGDBWriter`** | `.write_entities(entities)` | WAL 模式图谱写入 |
| | `.write_relations(relations)` | 写入关系 |
| **`KGDBReader`** | `.query(entity_type, name)` | 图谱查询 |

### scanner.py — 全库扫描

| 函数/类 | 签名 | 说明 |
|---------|------|------|
| `scan_all` | `(config=None)` | 多数据源全库扫描 |
| `scan_database` | `(db_path, config=None)` | 单库扫描 |
| **`NERScanner`** | 类 | NER 扫描器 |
| `.scan_structured` | `(self)` | Phase 1: structured.db |
| `.scan_english` | `(self)` | Phase 2: english.db |
| `.scan_mixed` | `(self)` | Phase 3: mixed.db |
| `.save_and_export` | `(self)` | Phase 4: 保存+导出 |

### deep_ner.py — 深度学习 NER 框架

| 类 | 方法 | 说明 |
|----|------|------|
| **`DeepNERFramework`** | 类 | 深度学习 NER 框架集成 |
| | `.train(train_data, dev_data, config)` | 训练 |
| | `.predict(text)` | 预测 |
| | `.evaluate(test_data)` | 评估 |

### extractors/rule_extractor.py — 规则 NER

| 类 | 方法 | 说明 |
|----|------|------|
| **`RuleExtractor`** | 类 | 增强版规则 NER |
| | `.extract(text, sender=None)` | 10+ 正则模式提取实体 |
| | `.extract_from_structured(record)` | 从 L0-L3 结构化字段提取 |

### extractors/ml_extractor.py — ML NER

| 类 | 方法 | 说明 |
|----|------|------|
| **`MLExtractor`** | 类 | ModelScope StructBERT 中文 NER |
| | `.extract(text) -> list[dict]` | ML 实体提取 (PER/ORG/LOC/TIME) |
| | `.is_available() -> bool` | 模型可用性检查 |

### extractors/llm_extractor.py — LLM NER

| 类 | 方法 | 说明 |
|----|------|------|
| **`LLMExtractor`** | 类 | Qwen2.5 LLM 补充实体抽取 |
| | `.extract(text, context=None) -> list[dict]` | LLM 实体提取 |
| | `.extract_batch(texts) -> list[list[dict]]` | 批量提取 |

### extractors/relation_extractor.py — 关系抽取

| 类 | 方法 | 说明 |
|----|------|------|
| **`RelationExtractor`** | 类 | 实体关系抽取 |
| | `.extract(entities, text) -> list[dict]` | 抽取实体间关系 |

### indexer/entity_counter.py — 实体频次

| 类 | 方法 | 说明 |
|----|------|------|
| **`EntityCounter`** | 类 | 实体频次统计 |
| | `.add(entity_type, name, email_id)` | 添加实体 |
| | `.top_n(entity_type, n=10)` | Top-N 排序 |
| | `.merge(other)` | 合并计数器 |
| | `.export_json(path)` | JSON 导出 |

### indexer/inverted_index.py — 倒排索引

| 类 | 方法 | 说明 |
|----|------|------|
| **`InvertedIndex`** | 类 | 实体↔邮件倒排索引 |
| | `.add(entity, email_id, confidence, source)` | 添加索引条目 |
| | `.search(query, fuzzy=False)` | 实体搜索 |
| | `.find_emails(entity)` | 查找关联邮件 |
| | `.find_entities(email_id)` | 查找邮件中的实体 |

### indexer/cooccurrence.py — 共现矩阵

| 类 | 方法 | 说明 |
|----|------|------|
| **`CooccurrenceMatrix`** | 类 | 实体对共现矩阵 |
| | `.add(entity_a, entity_b)` | 添加共现对 |
| | `.get_matrix(type_a, type_b)` | 跨类型共现矩阵 |
| | `.top_pairs(n=10)` | Top 共现对 |
| | `.export_json(path)` | JSON 导出 |

### graph/schema.py — 知识图谱 Schema

| 类/常量 | 说明 |
|---------|------|
| **`NodeType`** (Enum) | 9 种节点: Hotel, Guest, OTA, Booking, Issue, BizType, Location, Org, RoomType |
| **`EdgeType`** (Enum) | 11 种边: HAS_BOOKING, BELONGS_TO_OTA, HAS_ISSUE, ... |
| `validate_node` | 节点属性校验 |
| `validate_edge` | 边属性校验 |

### graph/builder.py — 图谱构建

| 类 | 方法 | 说明 |
|----|------|------|
| **`GraphBuilder`** | 类 | 知识图谱构建器 |
| | `.process_email(email_id, entities)` | 流式处理单封邮件 |
| | `.build_edges()` | 自动建边 |
| | `.finalize()` | 完成构建 |

### graph/store.py — NetworkX 图存储

| 类 | 方法 | 说明 |
|----|------|------|
| **`GraphStore`** | 类 | NetworkX 内存图 |
| | `.add_node(node_type, name, **attrs)` | 添加节点 |
| | `.add_edge(src, dst, edge_type, **attrs)` | 添加边 |
| | `.pagerank() -> dict` | PageRank 排序 |
| | `.shortest_path(src, dst) -> list` | 最短路径 |
| | `.community_detection() -> dict` | Louvain 社区发现 |
| | `.subgraph(nodes) -> GraphStore` | 子图提取 |
| | `.degree_centrality() -> dict` | 度中心性 |
| | `.betweenness_centrality() -> dict` | 介数中心性 |

### graph/query.py — 知识图谱查询 API

| 类 | 方法 | 说明 |
|----|------|------|
| **`KnowledgeGraph`** | 类 | 查询 API 主入口 |
| | `.search(query)` | 实体搜索 |
| | `.find_emails(entity)` | 查找关联邮件 |
| | `.get_booking_info(booking_id)` | 订单关联信息 |
| | `.top_entities(entity_type, limit=10)` | Top 高频实体 |
| | `.query_ota_biz_types(ota)` | 查询 OTA 业务类型分布 |
| | `.query_issue_hotels(issue)` | 查询问题→酒店 |
| | `.query_hotel_issues(hotel)` | 查询酒店→问题 |
| | `.cooccurrence(entity)` | 共现分析 |
| | `.neighbors(entity)` | 邻居节点 |
| | `.shortest_path(src, dst)` | 最短路径 |
| | `.get_overview()` | 图谱概览 |

### linker/entity_linker.py — 实体链接

| 类 | 方法 | 说明 |
|----|------|------|
| **`EntityLinker`** | 类 | 实体链接与消歧 |
| | `.link(entity, candidates)` | 链接实体到知识库 |

### reasoning/reasoner.py — 知识推理

| 类 | 方法 | 说明 |
|----|------|------|
| **`KnowledgeReasoner`** | 类 | 图谱知识推理 |
| | `.infer(query)` | 推理查询 |

### deep/ — 深度学习 NER 子模块

| 文件 | 类 | 关键方法 | 说明 |
|------|-----|---------|------|
| `config.py` | **`DeepNERConfig`** | — | BERT+BiLSTM-CRF 训练配置 |
| `dataset.py` | **`NERDataset`** | `.encode(text, labels)` | NER 数据集 (BIOES 标注) |
| `model.py` | **`DeepNERModel`** | `.forward()`, `.decode()` | BERT+BiLSTM-CRF 模型 |
| `trainer.py` | **`NERTrainer`** | `.train()`, `.evaluate()` | 训练器 |
| `predictor.py` | **`NERPredictor`** | `.predict(text)`, `.predict_batch(texts)` | 预测器 |
| `metrics.py` | **`NERMetrics`** | `.compute()`, `.report()` | P/R/F1 指标计算 |

---

## 3. email_parser/ — 邮件解析系统

### parser.py — 主解析器

| 函数 | 签名 | 说明 |
|------|------|------|
| `parse_email_sync` | `(body, headers=None, html=None, agent_domains=None) -> EmailThread` | 同步邮件解析 |
| `parse_and_structure_email` | `async (raw_mime, agent_domains=None, crm_client=None, llm_client=None) -> StructuredEmailSummary` | 异步完整解析 |
| `fallback_parse` | `(body, headers) -> StructuredEmailSummary` | 降级解析 |

### data_structures.py — 数据结构

| 类 | 说明 |
|----|------|
| **`EmailThread`** | 邮件线程 |
| **`EmailSegment`** | 邮件段落 |
| **`StructuredEmailSummary`** | 结构化邮件摘要 |
| **`ParsedHeader`** | 解析后的邮件头 |

### header_parser.py — 邮件头解析

| 函数 | 签名 | 说明 |
|------|------|------|
| `derive_thread_id` | `(headers: Dict) -> str` | 推导线程 ID |
| `extract_sender_info` | `(headers: Dict) -> Dict` | 提取发件人信息 |
| `parse_header` | `(headers: Dict) -> ParsedHeader` | 解析邮件头 |

### entity_extractor.py — 实体提取

| 函数 | 签名 | 说明 |
|------|------|------|
| `extract_entities_rule` | `(text: str) -> List[Dict]` | 规则实体提取 (订单号/日期/金额/邮箱/电话) |
| `normalize_amount` | `(text: str) -> str` | 金额归一化 |

### quote_detector.py — 引用检测

| 函数 | 签名 | 说明 |
|------|------|------|
| `detect_quotes` | `(text: str) -> List[QuoteBlock]` | 检测引用块 |
| `strip_quotes` | `(text: str) -> str` | 去除引用内容 |

### role_identifier.py — 角色识别

| 函数 | 签名 | 说明 |
|------|------|------|
| `identify_role` | `(text, sender=None, headers=None) -> str` | 识别发送者角色 (customer/agent/hotel/system) |

### multi_intent_splitter.py — 多意图拆分

| 函数 | 签名 | 说明 |
|------|------|------|
| `split_intents` | `(text: str) -> List[Dict]` | 多意图邮件拆分 |

### summarizer.py — 摘要生成

| 函数 | 签名 | 说明 |
|------|------|------|
| `summarize` | `(text: str, max_length=200) -> str` | 单文档摘要 |

### multi_doc_summary.py — 多文档摘要

| 函数/类 | 签名 | 说明 |
|---------|------|------|
| **`MultiDocSummarizer`** | 类 | 多文档摘要器 |
| | `.summarize(docs: List[str]) -> str` | 多文档摘要 |

### patterns/ — 模式匹配规则

| 文件 | 函数 | 说明 |
|------|------|------|
| `attribution.py` | `detect_attribution(text) -> List[Match]` | Attribution 行检测 |
| `escalation.py` | `detect_escalation(text) -> List[Match]` | 升级模式检测 |
| `forward.py` | `detect_forward(text) -> List[Match]` | 转发头检测 |
| `multi_intent.py` | `detect_multi_intent(text) -> List[Match]` | 多意图模式检测 |
| `outlook_block.py` | `detect_outlook_block(text) -> List[Match]` | Outlook 引用块检测 |
| `signature.py` | `detect_signature(text) -> List[Match]` | 签名检测 |

---

## 4. thread_builder/ — 三层级联线程分解引擎

### core/models.py — 数据模型

| 类 | 说明 |
|----|------|
| **`ProcessingLayer`** (Enum) | RULE=0, LOCAL=1, CLOUD=2 |
| **`ArbitrationStrategy`** (Enum) | CONFIDENCE_PRIORITY, SCENARIO_ADAPTIVE, EVIDENCE_WEIGHTED |
| **`LayerResult`** | 单层处理结果 |
| **`LayerDecision`** | 升级决策 |
| **`SegmentReconstructionResult`** | 段落重建结果 |
| **`ReconstructionComparison`** | 重建对比 |
| **`CascadingResult`** | 级联处理最终结果 |

### core/rules.py — 规则引擎 (Layer 0)

| 类 | 方法 | 说明 |
|----|------|------|
| **`ThreadDecomposer`** | 类 | L0 规则引擎 |
| | `.decompose(text) -> LayerResult` | 规则分解 |
| | `.detect_boundaries(text)` | 检测段落边界 |
| | `.extract_segments(text, boundaries)` | 提取段落 |

### llm/base.py — LLM 客户端基类

| 类 | 方法 | 说明 |
|----|------|------|
| **`BaseLLMClient`** | 抽象基类 | LLM 客户端接口 |
| | `.complete(prompt) -> str` | 文本补全 |
| | `.is_available() -> bool` | 可用性检查 |

### llm/clients.py — LLM 客户端

| 类 | 说明 |
|----|------|
| **`LocalLLMClient`** | 本地 LLM 客户端 |
| **`CloudLLMClient`** | 云端 LLM 客户端 (DeepSeek/Qwen/OpenAI) |
| **`HybridLLMClient`** | 混合客户端 (本地优先, 云端兜底) |
| `create_llm_client(provider, **kwargs)` | 客户端工厂函数 |

### llm/prompts.py — Prompt 模板

| 函数 | 说明 |
|------|------|
| `build_decompose_prompt(email_text)` | 构建线程分解 prompt |
| `build_structured_prompt(email_text)` | 构建结构化输出 prompt |

### llm/prompt_optimizer.py — Prompt 优化

| 类 | 方法 | 说明 |
|----|------|------|
| **`PromptOptimizer`** | 类 | Prompt 自动优化器 |
| | `.optimize(prompt, examples)` | 优化 prompt |
| | `.ab_test(prompt_a, prompt_b, test_data)` | A/B 测试 |

### local_llm_splitter.py — 本地 LLM 切分器

| 类 | 方法 | 说明 |
|----|------|------|
| **`LocalLLMSplitter`** | 类 | Layer 1 本地 LLM 切分 |
| | `.split(text) -> LayerResult` | LLM 切分 |
| | `.split_with_cache(text) -> LayerResult` | 带 SQLite 缓存的切分 |

### pipeline.py — 级联管线

| 类 | 方法 | 说明 |
|----|------|------|
| **`Pipeline`** | 类 | 三层编排流水线 |
| | `.process(text) -> CascadingResult` | L0→L1→L2 级联处理 |
| | `.process_batch(texts) -> list` | 批量处理 |

### fusion.py — 融合引擎

| 类 | 方法 | 说明 |
|----|------|------|
| **`FusionEngine`** | 类 | 多层结果仲裁融合 |
| | `.fuse(results: list[LayerResult]) -> SegmentReconstructionResult` | 融合多层结果 |
| | `.fuse_segment(segments_a, segments_b)` | 段落级融合 |

### circuit.py — 熔断器

| 类 | 方法 | 说明 |
|----|------|------|
| **`CircuitBreaker`** | 类 | LLM 调用熔断保护 |
| | `.call(fn, *args)` | 带熔断的调用 |
| | `.is_open -> bool` | 是否熔断 |
| | `.get_stats() -> dict` | 统计信息 |
| **`CircuitBreakerManager`** | 类 | 多熔断器管理 |

### threshold.py — 自适应阈值

| 类 | 方法 | 说明 |
|----|------|------|
| **`AdaptiveThreshold`** | 类 | 自适应置信度阈值 |
| | `.should_upgrade(confidence) -> bool` | 是否需要升级 |
| | `.update(result)` | 更新阈值 |
| **`MetricsCollector`** | 类 | 指标收集器 |

### strategy.py — 升级策略

| 类 | 方法 | 说明 |
|----|------|------|
| **`UpgradeStrategy`** | 基类 | 升级策略接口 |
| | `.should_upgrade(result) -> LayerDecision` | 判断是否升级 |
| **`UpgradeThresholds`** | 类 | 阈值配置 |

---

## 5. classifier/ — 文本分类器

### text_classifier.py

| 类 | 方法 | 说明 |
|----|------|------|
| **`TextCNNClassifier`** | 类 | TextCNN 文本分类 (C01-C08) |
| | `.train(train_data, dev_data)` | 训练 |
| | `.predict(text) -> str` | 预测分类 |
| | `.predict_batch(texts) -> list[str]` | 批量预测 |
| | `.evaluate(test_data) -> dict` | 评估 |

---

## 6. sentiment/ — 情感分析

### analyzer.py

| 类 | 方法 | 说明 |
|----|------|------|
| **`SentimentAnalyzer`** | 类 | 情感分析器 |
| | `.analyze(text) -> dict` | 分析情感 (positive/negative/neutral) |
| | `.analyze_batch(texts) -> list[dict]` | 批量分析 |

---

## 7. augmentation/ — 数据增强

### augmenter.py

| 类 | 方法 | 说明 |
|----|------|------|
| **`DataAugmenter`** | 类 | 数据增强器 |
| | `.synonym_replace(text, n=1) -> str` | 同义词替换 |
| | `.random_insert(text, n=1) -> str` | 随机插入 |
| | `.random_swap(text, n=1) -> str` | 随机交换 |
| | `.random_delete(text, p=0.1) -> str` | 随机删除 |
| | `.back_translate(text, src="zh", tgt="en") -> str` | 回译增强 |
| | `.eda(text, alpha=0.1, n_aug=4) -> list[str]` | EDA 综合增强 |
| | `.domain_replace(text) -> str` | 酒店领域替换 |
| | `.augment(text, methods=None, n=1) -> list[str]` | 统一增强接口 |

---

## 8. annotation/ — 数据标注

### store.py

| 类 | 方法 | 说明 |
|----|------|------|
| **`AnnotationStore`** | 类 | 标注存储 |
| | `.save(annotation)` | 保存标注 |
| | `.load(annotation_id) -> dict` | 加载标注 |
| | `.export_jsonl(path)` | 导出 JSONL |
| | `.get_stats() -> dict` | 标注统计 |
| | `.get_by_annotator(annotator) -> list` | 按标注员查询 |

---

## 9. self_learning/ — 自学习系统

### config.py — 配置

| 类 | 说明 |
|----|------|
| **`SilverMiningConfig`** | 银标挖掘配置 (min_confidence, max_hallucination_ratio, ...) |
| **`ExportConfig`** | 训练数据导出配置 (format, train_ratio, ...) |

### collector/silver_miner.py — 银标挖掘

| 类 | 方法 | 说明 |
|----|------|------|
| **`SilverLabel`** | 数据类 | 银标数据 |
| **`MiningReport`** | 数据类 | 挖掘报告 |
| **`SilverLabelMiner`** | 类 | 银标挖掘器 |
| | `.mine_from_llm_cache(db_path=None, min_confidence=None, limit=5000) -> MiningReport` | 从 LLM 缓存挖掘 |
| | `.mine_from_decomposed(db_path=None, min_confidence=None, limit=5000) -> MiningReport` | 从分解结果挖掘 |
| | `.mine_all() -> list[MiningReport]` | 全量挖掘 |
| | `.save_to_db(silver_labels)` | 保存到银标数据库 |
| | `.get_silver_count() -> int` | 获取银标总数 |
| | `.get_silver_labels(limit=None) -> list` | 获取银标数据 |
| | `.export_training_data(config=None) -> dict` | 导出训练数据 |

### collector/quality_filter.py — 质量过滤

| 类 | 方法 | 说明 |
|----|------|------|
| **`QualityFilter`** | 类 | 7 维质量过滤器 |
| | `.check(content, segments_json, confidence) -> FilterResult` | 单条检查 |
| | `.filter_batch(records) -> tuple[list, dict]` | 批量过滤 |

### collector/dedup.py — 去重

| 类 | 方法 | 说明 |
|----|------|------|
| **`Deduplicator`** | 类 | MD5 精确去重 |
| | `.deduplicate(records) -> list` | 批量去重 |
| | `.load_existing_md5s(db_path)` | 加载已有 MD5 |

### distiller/pattern_miner.py — 模式挖掘

| 类 | 方法 | 说明 |
|----|------|------|
| **`PatternMiner`** | 类 | OTA 聚类模式挖掘 |
| | `.cluster_by_ota(labels) -> dict` | 按 OTA 分组 |
| | `.extract_boundary_patterns(cluster) -> list` | 提取边界模式 |
| | `.extract_all_patterns(clusters) -> list` | 提取所有 OTA 模式 |
| | `.classify_pattern(text) -> str` | 分类: separator/attribution/forward/signature/unknown |

### distiller/rule_generator.py — 规则生成

| 类 | 方法 | 说明 |
|----|------|------|
| **`RuleGenerator`** | 类 | 模式→正则规则生成 |
| | `.generate(patterns) -> list` | 批量生成规则 |
| | `.generate_from_text(text, pattern_type) -> Rule` | 从文本生成单条规则 |

### distiller/rule_validator.py — 规则验证

| 类 | 方法 | 说明 |
|----|------|------|
| **`RuleValidator`** | 类 | 7 项验证门禁 |
| | `.validate(rules, test_cases) -> ValidationReport` | 验证规则 (Precision≥90%, FP≤5%) |

### trainer/data_curator.py — 数据整理

| 类 | 方法 | 说明 |
|----|------|------|
| **`DataCurator`** | 类 | 金银标混合数据整理 |
| | `.prepare_mixed_dataset(silver_labels, gold_samples=None, ...) -> TrainingDataset` | 混合数据集 |
| | `.prepare_from_silver_db(silver_db_path, ...) -> TrainingDataset` | 从银标库准备 |

### trainer/incremental_lora.py — 增量 LoRA

| 类 | 方法 | 说明 |
|----|------|------|
| **`LoRAConfig`** | 数据类 | LoRA 训练配置 |
| **`IncrementalLoRA`** | 类 | 增量 LoRA 训练器 |
| | `.train(dataset, notes=None) -> TrainResult` | 增量训练 (支持 dry-run) |

### trainer/model_registry.py — 模型版本管理

| 类 | 方法 | 说明 |
|----|------|------|
| **`ModelRegistry`** | 类 | 模型版本管理 |
| | `.create_version(base_model=None, notes=None) -> ModelVersion` | 创建版本 |
| | `.activate(version)` | 激活版本 |
| | `.update_training_result(version, ...)` | 更新训练结果 |
| | `.update_eval_result(version, ...)` | 更新评估结果 |
| | `.get_prev_lora_path() -> str` | 获取上一版 LoRA 路径 |

### trainer/eval_gate.py — 评估门禁

| 类 | 方法 | 说明 |
|----|------|------|
| **`EvalGate`** | 类 | 训练评估门禁 |
| | `.evaluate_simple(new_f1, old_f1) -> EvalResult` | 简化评估 |
| | `.evaluate(new_outputs, old_outputs, ground_truth=None) -> EvalResult` | 完整评估 |

### trainer/hyperopt.py — 超参调优

| 类 | 方法 | 说明 |
|----|------|------|
| **`HyperparamSpace`** | 数据类 | 搜索空间定义 |
| **`HyperoptReport`** | 数据类 | 调优报告 |
| **`HyperparamOptimizer`** | 类 | Optuna TPE 贝叶斯搜索 |
| | `.optimize(n_trials=20, timeout=3600) -> HyperoptReport` | 运行搜索 |
| | `.best_lora_config() -> LoRAConfig` | 获取最佳配置 |

### trainer/distillation.py — 知识蒸馏

| 类 | 方法 | 说明 |
|----|------|------|
| **`DistillConfig`** | 数据类 | 蒸馏配置 |
| **`KnowledgeDistiller`** | 类 | 教师→学生蒸馏器 |
| | `.distill(dataset) -> DistillResult` | 在线蒸馏 |
| | `.distill_offline(teacher_outputs) -> DistillResult` | 离线蒸馏 |
| | `.generate_teacher_outputs(dataset) -> list` | 生成教师输出 |
| `compute_kl_loss(student_logits, teacher_logits, T) -> Tensor` | KL 散度损失 |

### trainer/rlhf.py — RLHF 强化学习

| 类 | 方法 | 说明 |
|----|------|------|
| **`PreferencePair`** | 数据类 | 偏好数据对 (chosen/rejected) |
| **`RLHFConfig`** | 数据类 | RLHF 配置 |
| **`PreferenceCollector`** | 类 | 偏好数据收集器 |
| | `.from_ab_results(model_a, model_b, ground_truth) -> list` | 从 A/B 结果生成 |
| | `.from_jsonl(path) -> list` | 从 JSONL 导入 |
| | `.auto_generate(samples, n_pairs=500) -> list` | 自动生成 (冷启动) |
| **`RLHFTrainer`** | 类 | RLHF 训练器 |
| | `.train(pairs, notes=None) -> TrainResult` | DPO/RewardModel/PPO 训练 |
| | `.score(outputs) -> list` | 启发式奖励评分 |

### tuner/metrics_tracker.py — 指标追踪

| 类 | 方法 | 说明 |
|----|------|------|
| **`MetricsTracker`** | 类 | SQLite 事件追踪 |
| | `.record(layer, event_type, confidence=None, latency_ms=None, ota=None)` | 记录事件 |
| | `.get_metrics(layer, period_days=7) -> LayerMetrics` | 查询指标 |
| | `.get_metrics_by_ota(ota, period_days=7) -> dict` | 按 OTA 查询 |

### tuner/weight_optimizer.py — 权重优化

| 类 | 方法 | 说明 |
|----|------|------|
| **`WeightConfig`** | 数据类 | 权重配置 (save/load JSON) |
| **`WeightOptimizer`** | 类 | EMA 权重优化器 |
| | `.optimize(current: WeightConfig, period_days=7) -> WeightConfig` | 优化权重 |

### evaluator/shadow_runner.py — 影子模式

| 类 | 方法 | 说明 |
|----|------|------|
| **`ShadowRunner`** | 类 | A/B 影子模式运行器 |
| | `.run(test_inputs, model_a, model_b) -> list` | 实时运行 |
| | `.run_with_precomputed(old_outputs, new_outputs) -> list` | 预计算输出对比 |

### evaluator/comparator.py — A/B 对比

| 类 | 方法 | 说明 |
|----|------|------|
| **`ABComparator`** | 类 | A/B 结果对比器 |
| | `.compare(results, ground_truth=None) -> ComparisonReport` | 对比→推荐 deploy_b/keep_a/manual_review |

### scheduler/scheduler.py — 学习调度器

| 类 | 方法 | 说明 |
|----|------|------|
| **`ScheduleConfig`** | 数据类 | 调度配置 |
| **`LearningScheduler`** | 类 | 自学习调度器 |
| | `.run_daily() -> ScheduleReport` | 日任务: 银标收集 |
| | `.run_weekly() -> ScheduleReport` | 周任务: 规则蒸馏+权重调整 |
| | `.run_monthly() -> ScheduleReport` | 月任务: 增量训练 |
| | `.run_all() -> ScheduleReport` | 全部任务 |

---

## 10. vllm_manager/ — LLM 推理服务管理

### config.py

| 类 | 方法 | 说明 |
|----|------|------|
| **`BackendType`** (Enum) | AUTO, VLLM, MLX, TRANSFORMERS |
| **`VLLMConfig`** | 类 | 推理服务配置 |
| | `.from_preset(name) -> VLLMConfig` | 从预设加载 |
| | `.from_env() -> VLLMConfig` | 从环境变量加载 |
| | `.list_presets() -> dict` | 列出所有预设 |
| | `.validate()` | 配置校验 |

### server.py

| 类 | 方法 | 说明 |
|----|------|------|
| **`VLLMServer`** | 类 | 推理服务管理 |
| | `.start()` | 启动 (vLLM/MLX/transformers) |
| | `.stop()` | 停止 |
| | `.restart()` | 重启 |
| | `.status() -> dict` | 状态查询 |

### health.py

| 类 | 方法 | 说明 |
|----|------|------|
| **`HealthChecker`** | 类 | 健康检查器 |
| | `.check_pid(pid) -> bool` | PID 进程探测 |
| | `.check_api(url) -> bool` | API 可达性 |
| | `.detect_environment() -> dict` | CUDA/MLX/MPS 环境检测 |
| | `.wait_ready(timeout=60) -> bool` | 等待就绪 |

---

## 11. production/ — 生产化模块

### monitoring/metrics.py

| 类 | 方法 | 说明 |
|----|------|------|
| **`Counter`** | `.inc(value=1, labels=None)` | Prometheus 计数器 |
| **`Gauge`** | `.set(value, labels=None)` | Prometheus 仪表盘 |
| **`Histogram`** | `.observe(value, labels=None)` | Prometheus 直方图 |
| **`MetricsCollector`** | `.export_text() -> str`, `.export_json() -> dict` | 指标导出 |

### monitoring/health_check.py

| 类 | 方法 | 说明 |
|----|------|------|
| **`HealthChecker`** | `.add_check(name, fn)`, `.run_all() -> dict` | 统一健康检查 |

### monitoring/structured_logger.py

| 类 | 方法 | 说明 |
|----|------|------|
| **`StructuredLogger`** | `.info()`, `.error()`, `.warning()` | JSON 结构化日志 |

### ab_test/traffic_splitter.py

| 类 | 方法 | 说明 |
|----|------|------|
| **`TrafficSplitter`** | `.split(user_id) -> str` | 哈希/随机/轮询分流 |

### ab_test/variant_manager.py

| 类 | 方法 | 说明 |
|----|------|------|
| **`VariantManager`** | `.create()`, `.query()`, `.update_metrics()`, `.promote()` | 变体管理 |

### ab_test/result_collector.py

| 类 | 方法 | 说明 |
|----|------|------|
| **`ResultCollector`** | `.collect()`, `.analyze() -> Recommendation` | 结果收集与分析 |

### model_swap/hot_swap.py

| 类 | 方法 | 说明 |
|----|------|------|
| **`HotSwapper`** | `.preload(model)`, `.swap()`, `.rollback()` | 模型原子切换+自动回滚 |

### api_gateway/rate_limiter.py

| 类 | 方法 | 说明 |
|----|------|------|
| **`RateLimiter`** | `.check(key) -> bool` | 滑动窗口限流 |

### api_gateway/gateway.py

| 类 | 方法 | 说明 |
|----|------|------|
| **`APIGateway`** | `.route(request)`, `.handle()` | API 网关路由 |

### api_gateway/auth.py

| 类 | 方法 | 说明 |
|----|------|------|
| **`AuthHandler`** | `.authenticate(token) -> bool` | 认证处理 |

---

## 统计总览

| 模块 | Python 文件数 | 主要类数 | 说明 |
|------|-------------|---------|------|
| `bow/` | 5 | 6 | 词袋、分词、TF-IDF、文本表示 |
| `ner/` | 24 | 20+ | NER、知识图谱、深度学习 NER |
| `email_parser/` | 16 | 4 | 邮件解析、实体提取、角色识别 |
| `thread_builder/` | 13 | 15+ | 三层级联引擎、LLM、融合、熔断 |
| `classifier/` | 2 | 1 | TextCNN 文本分类 |
| `sentiment/` | 2 | 1 | 情感分析 |
| `augmentation/` | 3 | 1 | 数据增强 (EDA/回译) |
| `annotation/` | 2 | 1 | 数据标注存储 |
| `self_learning/` | 20 | 25+ | 银标挖掘、规则蒸馏、LoRA、RLHF |
| `vllm_manager/` | 4 | 3 | LLM 推理服务管理 |
| `production/` | 12 | 10+ | 监控、A/B 测试、模型热切换 |
| **总计** | **~181** | **90+** | **~57,000 行** |
