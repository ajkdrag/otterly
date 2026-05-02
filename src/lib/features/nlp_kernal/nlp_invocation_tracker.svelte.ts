import { invoke } from "@tauri-apps/api/core";

interface InvocationRecord {
  count: number;
  last_called_at: number;
}

type NlpCommandId =
  | "nlp_analyze_note"
  | "nlp_get_aggregate_stats"
  | "nlp_py_capabilities"
  | "nlp_py_tokenize"
  | "nlp_py_keywords"
  | "nlp_py_sentiment"
  | "nlp_py_entities"
  | "nlp_py_entities_ml"
  | "nlp_py_classify"
  | "nlp_bpe_analyze";

const NLP_COMMAND_LABELS: Record<NlpCommandId, string> = {
  nlp_analyze_note: "Note Analysis (Rust)",
  nlp_get_aggregate_stats: "Aggregate Stats (Rust)",
  nlp_py_capabilities: "Capabilities Check",
  nlp_py_tokenize: "Tokenize (Python/jieba)",
  nlp_py_keywords: "Keyword Extraction (Python)",
  nlp_py_sentiment: "Sentiment Analysis (Python)",
  nlp_py_entities: "Entity Extraction (Python)",
  nlp_py_entities_ml: "NER ML (Python/ModelScope)",
  nlp_py_classify: "Text Classification (Python)",
  nlp_bpe_analyze: "BPE Analysis (Rust)",
};

const ALL_COMMANDS: NlpCommandId[] = [
  "nlp_analyze_note",
  "nlp_get_aggregate_stats",
  "nlp_py_capabilities",
  "nlp_py_tokenize",
  "nlp_py_keywords",
  "nlp_py_sentiment",
  "nlp_py_entities",
  "nlp_py_entities_ml",
  "nlp_py_classify",
  "nlp_bpe_analyze",
];

class NlpInvocationTracker {
  #records = $state<Map<NlpCommandId, InvocationRecord>>(new Map());

  record(command: NlpCommandId) {
    const existing = this.#records.get(command);
    const updated = new Map(this.#records);
    updated.set(command, {
      count: (existing?.count ?? 0) + 1,
      last_called_at: Date.now(),
    });
    this.#records = updated;
  }

  get entries(): Array<{
    id: NlpCommandId;
    label: string;
    invoked: boolean;
    count: number;
    last_called_at: number | null;
  }> {
    return ALL_COMMANDS.map((id) => {
      const record = this.#records.get(id);
      return {
        id,
        label: NLP_COMMAND_LABELS[id],
        invoked: !!record,
        count: record?.count ?? 0,
        last_called_at: record?.last_called_at ?? null,
      };
    });
  }

  get invoked_count(): number {
    return this.#records.size;
  }

  get total_count(): number {
    return ALL_COMMANDS.length;
  }
}

export const nlp_tracker = new NlpInvocationTracker();

export async function tracked_invoke<T>(
  command: NlpCommandId,
  args?: Record<string, unknown>,
): Promise<T> {
  nlp_tracker.record(command);
  return invoke<T>(command, args);
}
