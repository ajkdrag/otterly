# NLP Kernal — Function & Class List

> Auto-generated from kcs v0.6 NLP modules

**Modules**: annotation,augmentation,bow,classifier,email_parser,ner,self_learning,sentiment,
**Total Python files**: 68
**Total classes**: 0
**Total functions**: 0

---


## nlp_kernal/annotation/store.py
class LabelSchema:
class AnnotationStore:


## nlp_kernal/augmentation/augmenter.py
class AugmentedSample:
class AugmentConfig:
class AugmentStrategy(ABC):
class SynonymReplacer(AugmentStrategy):
class BackTranslator(AugmentStrategy):
class RandomEditor(AugmentStrategy):
class DomainAugmenter(AugmentStrategy):
class TextAugmenter:
def augment_dataset(


## nlp_kernal/bow/builder.py
def clean_text(text: str) -> str:
def detect_language(text: str) -> str:
def tokenize_chinese(text: str) -> list[str]:
def tokenize_english(text: str) -> list[str]:
def tokenize(text: str) -> list[str]:
def tokenize_with_nlp(
def filter_stopwords(tokens: list[str]) -> list[str]:
def _init_jieba():
class BagOfWordsBuilder:
def scan_and_build(


## nlp_kernal/bow/domain.py
def classify_word_domain(word: str) -> str | None:
def identify_channel(sender: str) -> tuple[str, str]:
def get_all_channel_names() -> list[str]:
def get_channels_by_type() -> dict[str, list[str]]:
def get_domain_word_count() -> int:


## nlp_kernal/bow/nlp_tools.py
class EnglishStemmer:
class EnglishLemmatizer:
class TaggedWord:
class POSTagger:
def get_stemmer() -> EnglishStemmer:
def get_lemmatizer() -> EnglishLemmatizer:
def get_pos_tagger() -> POSTagger:
def stem(word: str) -> str:
def lemmatize(word: str, pos: str = "n") -> str:
def pos_tag(text: str) -> list[TaggedWord]:
class SubwordTokenizer:
def _simple_bpe_split(word: str) -> list[str]:
def get_subword_tokenizer(
def subword_tokenize(text: str) -> list[str]:


## nlp_kernal/bow/text_repr.py
class NGramStats:
class NGramModel:
class WordEmbedding:
class TransformerEmbedder:
class DocVectorizer:
def build_ngrams(
def train_word_vectors(
def train_doc_vectors(


## nlp_kernal/classifier/text_classifier.py
class ClassifyResult:
class TextClassifier:


## nlp_kernal/email_parser/data_structures.py
class EmailSegment:
class EmailThread:
class QuoteBoundary:
class SenderRole:
class StructuredEmailSummary:


## nlp_kernal/email_parser/email_parser_gui.py
def clean_df_for_display(df):
def load_excel_data(file_path):
def load_excel_from_upload(uploaded_file):
def load_from_sqlite(db_path, table_name="hotel_work_orders", limit=None, random_sample=False, seed=None):
def get_db_info(db_path):
def get_db_columns(db_path, table_name="hotel_work_orders"):
def parse_single_email(row):
def thread_to_dict(thread):
def convert_to_serializable(obj):
def save_to_testdata(df, analysis_results, prefix="sample"):


## nlp_kernal/email_parser/entity_extractor.py
def extract_entities_rule(text: str) -> List[Dict]:
def normalize_amount(text: str) -> str:


## nlp_kernal/email_parser/header_parser.py
def derive_thread_id(headers: Dict) -> str:
def extract_headers(raw_mime: bytes) -> Dict:
def extract_sender_from_header(headers: Dict) -> Optional[str]:
def extract_subject(headers: Dict) -> str:


## nlp_kernal/email_parser/multi_doc_summary.py
class Document:
class SummaryResult:
def _is_chinese(text: str) -> bool:
def _split_sentences(text: str) -> List[str]:
def _tokenize_simple(text: str) -> List[str]:
class TFIDFScorer:
def _position_score(idx: int, total: int) -> float:
def _length_score(sentence: str) -> float:
def _extract_keywords(sentences: List[str], top_k: int = 10) -> List[str]:
class MultiDocSummarizer:


## nlp_kernal/email_parser/multi_intent_splitter.py
def suggest_generation_mode(thread: Any) -> str:


## nlp_kernal/email_parser/parser.py
def fallback_parse(body: str, headers: Dict) -> StructuredEmailSummary:
def parse_email_sync(


## nlp_kernal/email_parser/patterns/attribution.py
def extract_sender_from_attribution(line: str) -> Optional[str]:
def extract_timestamp_from_attribution(line: str) -> Optional[datetime]:
def find_attribution_lines(lines: List[str]) -> List[Dict]:


## nlp_kernal/email_parser/patterns/escalation.py
def detect_escalation(segments: list, neg_words: List[str] = None) -> bool:


## nlp_kernal/email_parser/patterns/forward.py
def is_forwarded_separator(line: str) -> bool:
def is_forwarded_vs_quoted(


## nlp_kernal/email_parser/patterns/multi_intent.py
def has_multi_intent_signals(text: str) -> bool:


## nlp_kernal/email_parser/patterns/outlook_block.py
def find_outlook_separators(lines: List[str]) -> List[Dict]:
def parse_outlook_block(lines: List[str], start_line: int) -> Optional[Dict]:


## nlp_kernal/email_parser/patterns/signature.py
def detect_signature(lines: list[str], max_scan_lines: int = 8) -> Optional[int]:


## nlp_kernal/email_parser/quote_detector.py
def normalize_line_breaks(text: str) -> str:
def detect_quote_prefix(lines: List[str]) -> List[Dict]:
def extract_html_quotes(html: str) -> List[Dict]:
def classify_blockquote(tag) -> str:
def infer_depth(attr_info: Dict, prefix_info: List[Dict]) -> int:
def continuity_inference(prefix_info: List[Dict]) -> List[Dict]:
def detect_quote_boundaries(body: str, html: Optional[str] = None) -> List[QuoteBoundary]:
def convert_html_segments_to_boundaries(html_segments: List[Dict]) -> List[QuoteBoundary]:


## nlp_kernal/email_parser/role_identifier.py
def identify_sender_role(
def extract_content_features(text: str) -> dict:


## nlp_kernal/email_parser/summarizer.py
def generate_thread_summary(thread: Any) -> str:
class ExtractiveSummarizer:
class GenerativeSummarizer:


## nlp_kernal/email_parser/test_tkinter.py


## nlp_kernal/email_parser/thread_builder.py
def log_thread_rebuild(headers, body, html):
def log_segments(segments):
def split_by_boundaries(
def detect_language(text: str) -> str:
def detect_inline_reply(segments: List[EmailSegment]) -> bool:
def compute_duration(segments: List[EmailSegment]) -> Optional[float]:
def rebuild_thread(


## nlp_kernal/ner/config.py
class EntityType(str, Enum):
class BizTypeConfig:
class ScanConfig:


## nlp_kernal/ner/db.py
class DBReader:
class StructuredDBReader(DBReader):
class KGDBWriter:
class KGDBReader:


## nlp_kernal/ner/deep/config.py
class DeepNERConfig:


## nlp_kernal/ner/deep/dataset.py
class NERSample:
class NERDataset(Dataset):
def ner_collate_fn(batch: List[Dict[str, Any]]) -> Dict[str, Any]:
def _convert_rule_entities(record_entities: Any) -> List[Dict[str, Any]]:
def _map_entity_type(entity_type: str) -> str:
def entities_to_bio(text: str, entities: List[Dict[str, Any]]) -> List[str]:
def split_dataset(
def save_samples_jsonl(samples: List[NERSample], path: str | Path):


## nlp_kernal/ner/deep/metrics.py
def compute_ner_metrics(
def _compute_seqeval(
def _extract_per_type_seqeval(
def _compute_builtin(
def _extract_entities_from_bio(
def ids_to_labels(


## nlp_kernal/ner/deep/model.py
def _check_deps():
class BertBiLstmCrf(nn.Module if HAS_TORCH else object):


## nlp_kernal/ner/deep/predictor.py
class DeepNERPredictor:


## nlp_kernal/ner/deep/trainer.py
class TrainingResult:
class NERTrainer:


## nlp_kernal/ner/deep_ner.py
class Entity:
class NERResult:
def get_device() -> str:
def bio_decode(tokens: list[str], labels: list[str],
class TransformerNER:
class BiLSTMCRF:
class NestedNER:
class HotelNERPipeline:


## nlp_kernal/ner/extractors/llm_extractor.py
class LLMExtractor:


## nlp_kernal/ner/extractors/ml_extractor.py
class MLExtractor:


## nlp_kernal/ner/extractors/relation_extractor.py
class ExtractedRelation:
class RelationExtractor:


## nlp_kernal/ner/extractors/rule_extractor.py
class ExtractedEntity:
class RecordEntities:
class RuleExtractor:
def _get_extractor() -> RuleExtractor:
def extract_entities_from_record(record: dict) -> dict:


## nlp_kernal/ner/graph/builder.py
class GraphBuilder:


## nlp_kernal/ner/graph/query.py
class KnowledgeGraph:


## nlp_kernal/ner/graph/schema.py
class NodeType(str, Enum):
class EdgeType(str, Enum):
class NodeSchema:
class EdgeSchema:
class GraphSchema:


## nlp_kernal/ner/graph/store.py
class GraphStore:


## nlp_kernal/ner/indexer/cooccurrence.py
class CooccurrenceMatrix:


## nlp_kernal/ner/indexer/entity_counter.py
class EntityCounter:


## nlp_kernal/ner/indexer/inverted_index.py
class InvertedIndex:


## nlp_kernal/ner/linker/entity_linker.py
class LinkResult:
def _levenshtein_distance(s1: str, s2: str) -> int:
def _levenshtein_similarity(s1: str, s2: str) -> float:
def _jaro_winkler_similarity(s1: str, s2: str) -> float:
def _normalize_for_match(text: str) -> str:
class EntityLinker:


## nlp_kernal/ner/reasoning/reasoner.py
class ReasoningResult:
class KnowledgeReasoner:


## nlp_kernal/ner/scanner.py
def scan_all(
def _scan_structured(
def _scan_raw(
def _print_summary(stats: dict, elapsed: float):
def scan_database(db_path: str, output_db_path: str, batch_size: int = 5000):


## nlp_kernal/self_learning/collector/dedup.py
class Deduplicator:


## nlp_kernal/self_learning/collector/quality_filter.py
class FilterResult:
class QualityFilter:


## nlp_kernal/self_learning/collector/silver_miner.py
class SilverLabel:
class MiningReport:
class SilverLabelMiner:


## nlp_kernal/self_learning/config.py
class SilverMiningConfig:
class ExportConfig:


## nlp_kernal/self_learning/distiller/pattern_miner.py
class BoundaryPattern:
class OTACluster:
class PatternMiner:


## nlp_kernal/self_learning/distiller/rule_generator.py
class GeneratedRule:
class RuleGenerator:


## nlp_kernal/self_learning/distiller/rule_validator.py
class ValidatedRule(GeneratedRule):
class ValidationReport:
class RuleValidator:


## nlp_kernal/self_learning/evaluator/comparator.py
class ComparisonReport:
class ABComparator:


## nlp_kernal/self_learning/evaluator/shadow_runner.py
class ShadowResult:
class ShadowRunner:


## nlp_kernal/self_learning/scheduler/scheduler.py
class ScheduleConfig:
class TaskResult:
class ScheduleReport:
class LearningScheduler:


## nlp_kernal/self_learning/trainer/data_curator.py
class TrainingDataset:
class DataCurator:


## nlp_kernal/self_learning/trainer/distillation.py
class DistillConfig:
class TeacherOutput:
class DistillResult:
class KnowledgeDistiller:


## nlp_kernal/self_learning/trainer/eval_gate.py
class GateDecision(str, Enum):
class EvalResult:
class EvalGate:


## nlp_kernal/self_learning/trainer/hyperopt.py
class HyperparamSpace:
class TrialResult:
class HyperoptReport:
class HyperparamOptimizer:


## nlp_kernal/self_learning/trainer/incremental_lora.py
class LoRAConfig:
class TrainingResult:
class IncrementalLoRA:


## nlp_kernal/self_learning/trainer/model_registry.py
class ModelVersion:
class ModelRegistry:


## nlp_kernal/self_learning/trainer/rlhf.py
class PreferenceLabel(str, Enum):
class PreferencePair:
class RLHFConfig:
class RewardScore:
class RLHFResult:
class PreferenceCollector:
class RLHFTrainer:


## nlp_kernal/self_learning/tuner/metrics_tracker.py
class LayerMetrics:
class MetricsTracker:


## nlp_kernal/self_learning/tuner/weight_optimizer.py
class WeightConfig:
class WeightOptimizer:


## nlp_kernal/sentiment/analyzer.py
class SentimentResult:
class SentimentAnalyzer:

