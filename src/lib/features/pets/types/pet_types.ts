// ── 宠物种类 ──────────────────────────────────────────────

export type PetSpecies =
  | "ink_sprite"
  | "scroll_pup"
  | "code_kit"
  | "think_cloud"
  | "sprout_bud";

export const PET_SPECIES_LIST: {
  species: PetSpecies;
  emoji: string;
  traitEmoji: string;
  nameCn: string;
  description: string;
}[] = [
  {
    species: "ink_sprite",
    emoji: "🐱",
    traitEmoji: "✒️",
    nameCn: "墨灵",
    description: "偏好创作笔记、长文写作",
  },
  {
    species: "scroll_pup",
    emoji: "🐶",
    traitEmoji: "📖",
    nameCn: "卷卷",
    description: "偏好阅读、文件浏览",
  },
  {
    species: "code_kit",
    emoji: "🐹",
    traitEmoji: "💻",
    nameCn: "码仔",
    description: "偏好代码块、技术笔记",
  },
  {
    species: "think_cloud",
    emoji: "🦉",
    traitEmoji: "💭",
    nameCn: "思思",
    description: "偏好链接、知识图谱",
  },
  {
    species: "sprout_bud",
    emoji: "🐸",
    traitEmoji: "🌱",
    nameCn: "芽芽",
    description: "均衡发展",
  },
];

// ── 进化阶段 ──────────────────────────────────────────────

export type EvolutionStage = 1 | 2 | 3 | 4;

export const STAGE_LABELS: Record<EvolutionStage, string> = {
  1: "幼崽期",
  2: "成长期",
  3: "成熟期",
  4: "传说期",
};

// ── 心情 ──────────────────────────────────────────────────

export type PetMood =
  | "happy"
  | "content"
  | "calm"
  | "bored"
  | "sad"
  | "sleeping"
  | "excited"
  | "celebrating";

export const MOOD_EMOJIS: Record<PetMood, string> = {
  happy: "😄",
  content: "😊",
  calm: "😐",
  bored: "😟",
  sad: "😢",
  sleeping: "😴",
  excited: "🤩",
  celebrating: "🎉",
};

// ── 性格 ──────────────────────────────────────────────────

export type PetPersonality =
  | "diligent"
  | "lazy"
  | "curious"
  | "lively"
  | "scholarly"
  | "resilient";

export const PERSONALITY_INFO: Record<
  PetPersonality,
  { emoji: string; label: string }
> = {
  diligent: { emoji: "🌟", label: "勤勉" },
  lazy: { emoji: "😴", label: "慵懒" },
  curious: { emoji: "🤓", label: "好奇" },
  lively: { emoji: "🎭", label: "活泼" },
  scholarly: { emoji: "📚", label: "博学" },
  resilient: { emoji: "💪", label: "坚韧" },
};

// ── 八字信息 (来自后端) ───────────────────────────────────

export interface BaziInfo {
  year_pillar: string;
  month_pillar: string;
  day_pillar: string;
  hour_pillar: string;
  bazi_full: string;
  wu_xing: string;
  wu_xing_emoji: string;
  sheng_xiao: string;
  sheng_xiao_emoji: string;
  ba_gua: string;
  ba_gua_symbol: string;
  ba_gua_nature: string;
  ba_gua_trait: string;
  shi_chen: string;
  fortune_summary: string;
}

// ── 宠物状态 (来自后端) ───────────────────────────────────

export interface PetState {
  id: string;
  owner_id: string;
  name: string;
  species: PetSpecies;
  species_emoji: string;
  species_name_cn: string;
  trait_emoji: string;
  stage: EvolutionStage;
  stage_label: string;
  variant: string;
  happiness: number;
  energy: number;
  hunger: number;
  bond_level: number;
  exp: number;
  level: number;
  exp_to_next_level: number;
  level_progress: number;
  personality: PetPersonality[];
  mood: PetMood;
  mood_emoji: string;
  skills: string[];
  accessories: string[];
  skin_variant: string;
  gender: string;
  gender_emoji: string;
  gender_label: string;
  born_at: number;
  bazi: BaziInfo | null;
  last_fed_at: number | null;
  last_interaction_at: number | null;
}

// ── 命令返回类型 ──────────────────────────────────────────

export interface PetActionResult {
  success: boolean;
  message: string;
  pet_state: PetState | null;
}

export interface EvolutionResult {
  can_evolve: boolean;
  new_stage: number | null;
  new_stage_label: string | null;
  message: string;
  pet_state: PetState | null;
}

export interface InventoryItem {
  item_type: string;
  quantity: number;
  item_emoji: string;
  item_name: string;
}

// ── 食物定义 ──────────────────────────────────────────────

export interface FoodDef {
  item_type: string;
  name: string;
  emoji: string;
  hunger_restore: number;
  happiness_bonus: number;
  exp_bonus: number;
  bond_bonus: number;
}

export const FOODS: FoodDef[] = [
  {
    item_type: "ink_candy",
    name: "墨水糖",
    emoji: "📝",
    hunger_restore: 20,
    happiness_bonus: 5,
    exp_bonus: 0,
    bond_bonus: 0,
  },
  {
    item_type: "scroll_cake",
    name: "书页饼",
    emoji: "📖",
    hunger_restore: 15,
    happiness_bonus: 0,
    exp_bonus: 3,
    bond_bonus: 0,
  },
  {
    item_type: "idea_fruit",
    name: "灵感果",
    emoji: "💡",
    hunger_restore: 25,
    happiness_bonus: 0,
    exp_bonus: 0,
    bond_bonus: 10,
  },
  {
    item_type: "analysis_tea",
    name: "分析茶",
    emoji: "🔬",
    hunger_restore: 10,
    happiness_bonus: 0,
    exp_bonus: 5,
    bond_bonus: 0,
  },
  {
    item_type: "star_dew",
    name: "星辰露",
    emoji: "⭐",
    hunger_restore: 50,
    happiness_bonus: 10,
    exp_bonus: 10,
    bond_bonus: 10,
  },
];

// ── 互动定义 ──────────────────────────────────────────────

export interface InteractionDef {
  type: string;
  name: string;
  emoji: string;
  description: string;
}

export const INTERACTIONS: InteractionDef[] = [
  { type: "pat", name: "摸头", emoji: "🤚", description: "快乐+5, 亲密+2" },
  {
    type: "play",
    name: "玩耍",
    emoji: "🎮",
    description: "快乐+10, 活力-5, 亲密+3",
  },
  { type: "talk", name: "对话", emoji: "💬", description: "随机知识小贴士" },
];
