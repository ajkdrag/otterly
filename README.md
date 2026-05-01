# LeapGrowNotes

> 24小时陪伴激励成长型知识笔记 — 本地优先、游戏化激励、电子宠物陪伴

LeapGrowNotes 是一个**本地优先**的个人知识库应用，支持 Markdown、代码文件和纯文本。通过游戏化积分系统、成长等级体系和电子宠物陪伴，让知识管理变得有趣。

## ✨ 核心功能

### 📝 知识管理
- **Markdown 编辑器**：Milkdown (ProseMirror) WYSIWYG + CodeMirror 6 代码块 + Prism 语法高亮
- **Wiki-links**：`[[wiki-links]]` + 自动补全 + Backlinks/Outlinks 面板
- **全文搜索**：SQLite FTS5 全文检索（17个搜索命令），支持中文 trigram 分词
- **文件树**：目录导航 + 拖拽排序 + 文件夹管理 + 作用域模式
- **Tab 系统**：多标签页 + 拖拽排序 + 固定标签
- **Git 版本控制**：init/status/commit/history/checkpoint/restore/diff + autocommit

### 🎮 游戏化激励
- **积分系统**：10+ 种行为积分（打开文件/创建笔记/阅读完成/搜索/NLP分析等）
- **成长等级**：30级体系（👶 知识新生儿 → 👑 院士），模拟中国教育路径
- **成就徽章**：10枚徽章（🌅早起鸟/🦉夜猫子/📖阅读马拉松/🔥连续30天 等）
- **升级动画**：confetti 烟花 + 飘动积分(+2) 动画
- **连续天数**：🔥 连续使用追踪 + 动态计时器

### 🐾 电子宠物
- **5种宠物**：墨灵/卷卷/码仔/思思/芽芽，对应不同学习风格
- **4阶段进化**：幼崽期 → 成长期 → 成熟期 → 传说期
- **互动系统**：喂食（5种知识食物）+ 互动（摸头/玩耍/对话）+ 心情系统
- **积分联动**：学习行为 → 宠物获得经验值 → 宠物成长进化

### 🧠 NLP 分析
- **纯 Rust 分析**：词频统计/关键词提取/段落结构/代码块检测/链接分析
- **Python NLP 桥接**：jieba 中文分词/情感分析/规则NER/ML NER (ModelScope StructBERT)
- **BPE Token 分析**：Token 可视化 + 压缩比 + 高频 Token 分布
- **聚合统计**：全 vault NLP 数据汇总

### 👤 用户系统
- 多用户登录/注册/游客模式
- 密码管理 + 用户切换
- 个性化设置（头像/语言/侧边栏偏好）

### 🎨 界面
- 明/暗主题 + 自定义主题（色调/字体/间距/代码块样式 等 40+ 参数）
- 可重绑定快捷键
- 自动更新检查

## 🏗 技术栈

| 层级     | 技术                                  |
| -------- | ------------------------------------- |
| 前端     | SvelteKit + Svelte 5 (runes) + TypeScript |
| 编辑器   | Milkdown (ProseMirror) + CodeMirror 6 |
| 桌面打包 | Tauri 2                               |
| 后端     | Rust (76个 Tauri 命令)                |
| 数据库   | SQLite (rusqlite) + FTS5              |
| NLP      | 纯 Rust + Python 桥接 (PyO3) + BPE   |
| Git      | git2 crate                            |
| 跨平台   | macOS / Windows / Linux               |

## 📦 后端模块（76个 Tauri 命令）

| 模块 | 命令数 | 说明 |
| ---- | ------ | ---- |
| vault | 6 | Vault 管理 |
| notes | 14 | 笔记 CRUD + 文件夹 + 资产 |
| search | 17 | FTS5 全文搜索 + 链接解析 |
| git | 7 | Git 版本控制 |
| settings | 4 | 全局/Vault 设置 |
| stats | 5 | 会话统计 |
| points | 4 | 积分系统 |
| pets | 10 | 电子宠物系统 |
| nlp_kernal | 9 | NLP + BPE 分析 |
| user | 4 | 用户管理 |
| update | 2 | 自动更新 |
| watcher | 2 | 文件监控 |
| vault_session | 2 | 会话持久化 |

## 🏛 架构

基于 [Otterly](https://github.com/ajkdrag/otterly)（MIT 许可）二次开发。前端采用 Ports + Adapters + Stores + Services + Reactors 分层架构，通过 Action Registry 统一调度。详见 `design/02_ARCHITECTURE.md`。

## 📚 设计文档

所有设计文档位于 `design/` 目录：

| 编号 | 文档 | 说明 |
| ---- | ---- | ---- |
| 01 | BLUEPRINT | 项目蓝图与总体规划 |
| 02 | ARCHITECTURE | 系统架构设计 |
| 03 | GAP_ANALYSIS | Gap 分析与开发计划 |
| 04 | UI | UI 设计系统 |
| 05 | POINTS_SYSTEM | 积分系统设计 |
| 06 | GROWTH_LEVELS | 成长等级体系 |
| 07 | BADGES | 成就徽章系统 |
| 08 | PET_SYSTEM_DESIGN | 电子宠物系统设计 |
| 09 | NLP_VALUE_PLAN | NLP 价值导向规划 |
| 10 | NLPTRACK | NLP 使用追踪 |
| 11 | LOCAL_LLM_NLU | 本地 LLM/NLU 技术方案 |
| 12 | UPDATE_SYSTEM_DESIGN | 自动更新模块设计 |
| 13-20 | NLP 子模块文档 | KCS/NER/Thread 等详细设计 |

## 🚀 开发

```bash
# 安装依赖
pnpm install

# 开发模式
pnpm tauri dev

# 构建
pnpm tauri build

# 检查
pnpm check          # TypeScript 类型检查
pnpm lint           # oxlint + 分层规则
pnpm test           # Vitest 单元测试
cargo check         # Rust 类型检查（在 src-tauri/ 下）
```

## 📄 许可证

MIT License — 基于 [Otterly](https://github.com/ajkdrag/otterly) 二次开发
