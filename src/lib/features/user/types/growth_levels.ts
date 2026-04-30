/**
 * Growth level definitions — based on design/GROWTH_LEVELS.md
 * Maps the Chinese education system to knowledge growth milestones.
 */

export type GrowthLevel = {
  level: number;
  title: string;
  icon: string;
  required_points: number;
  stage: string;
};

export const GROWTH_LEVELS: GrowthLevel[] = [
  { level: 0, title: "知识新生儿", icon: "👶", required_points: 0, stage: "出生" },
  { level: 1, title: "好奇宝宝", icon: "🍼", required_points: 20, stage: "婴幼儿" },
  { level: 2, title: "涂鸦小画家", icon: "🎨", required_points: 50, stage: "幼儿园小班" },
  { level: 3, title: "拼图小能手", icon: "🧩", required_points: 100, stage: "幼儿园中班" },
  { level: 4, title: "彩虹小学者", icon: "🌈", required_points: 200, stage: "幼儿园大班" },
  { level: 5, title: "识字小读者", icon: "📖", required_points: 350, stage: "小学一年级" },
  { level: 6, title: "写话小作家", icon: "✏️", required_points: 500, stage: "小学二年级" },
  { level: 7, title: "课外阅读者", icon: "📚", required_points: 700, stage: "小学三年级" },
  { level: 8, title: "小小探索家", icon: "🔍", required_points: 1_000, stage: "小学四年级" },
  { level: 9, title: "日记小达人", icon: "📝", required_points: 1_300, stage: "小学五年级" },
  { level: 10, title: "小学毕业生", icon: "🎓", required_points: 1_700, stage: "小学六年级" },
  { level: 11, title: "初中新生", icon: "🏫", required_points: 2_200, stage: "初一" },
  { level: 12, title: "科学探究者", icon: "🔬", required_points: 2_800, stage: "初二" },
  { level: 13, title: "中考冲刺者", icon: "📋", required_points: 3_500, stage: "初三" },
  { level: 14, title: "高中新星", icon: "🌟", required_points: 4_500, stage: "高一" },
  { level: 15, title: "学科专研者", icon: "🧪", required_points: 5_800, stage: "高二" },
  { level: 16, title: "高考冲刺者", icon: "🎯", required_points: 7_500, stage: "高三" },
  { level: 17, title: "大一新生", icon: "🎒", required_points: 10_000, stage: "大学新生" },
  { level: 18, title: "专业学习者", icon: "📖", required_points: 13_000, stage: "本科在读" },
  { level: 19, title: "学士", icon: "🎓", required_points: 17_000, stage: "本科毕业" },
  { level: 20, title: "硕士研究员", icon: "📐", required_points: 22_000, stage: "硕士研究生" },
  { level: 21, title: "硕士", icon: "🎓", required_points: 28_000, stage: "硕士毕业" },
  { level: 22, title: "博士研究者", icon: "🔭", required_points: 36_000, stage: "博士研究生" },
  { level: 23, title: "博士", icon: "🎓", required_points: 45_000, stage: "博士毕业" },
  { level: 24, title: "博士后研究员", icon: "🧬", required_points: 60_000, stage: "博士后" },
  { level: 25, title: "副教授", icon: "🏛️", required_points: 80_000, stage: "副教授" },
  { level: 26, title: "教授", icon: "👨‍🏫", required_points: 120_000, stage: "教授" },
  { level: 27, title: "博导", icon: "🌳", required_points: 180_000, stage: "博士生导师" },
  { level: 28, title: "杰出教授", icon: "💫", required_points: 250_000, stage: "杰出教授" },
  { level: 29, title: "院士", icon: "👑", required_points: 500_000, stage: "院士" },
];

/**
 * Get the next level threshold for the given points.
 * Returns the next_level_points and progress_percent.
 */
export function get_level_progress(
  current_level: number,
  total_points: number,
): { next_level_points: number; progress_percent: number; next_level: GrowthLevel | null } {
  const next = GROWTH_LEVELS.find((l) => l.level === current_level + 1);
  if (!next) {
    return { next_level_points: total_points, progress_percent: 100, next_level: null };
  }

  const current = GROWTH_LEVELS.find((l) => l.level === current_level);
  const current_threshold = current?.required_points ?? 0;
  const range = next.required_points - current_threshold;
  const progress = total_points - current_threshold;
  const percent = range > 0 ? Math.min(100, Math.round((progress / range) * 100)) : 100;

  return {
    next_level_points: next.required_points,
    progress_percent: percent,
    next_level: next,
  };
}
