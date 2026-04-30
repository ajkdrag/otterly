# LeapGrowNotes

> 本地优先、非 RAG、支持 LLM、多设备同步的个人知识库系统

LeapGrowNotes 是一个本地优先的个人知识库应用，支持 Markdown、代码文件和纯文本。通过非 RAG 的方式（全量上下文注入 / 结构化摘要 / 滑动窗口）将知识提供给大语言模型，同时支持多设备间的数据同步。

## 基于 Otterly 二次开发

本项目 fork 自 [Otterly](https://github.com/ajkdrag/otterly)（MIT 许可证），一个优秀的本地优先 Markdown 编辑器。我们在其基础上扩展以下功能：

- 🔧 **多文件格式支持**：代码文件（.py, .js, .ts, .go 等）和纯文本（.txt）
- 🤖 **LLM 集成**：支持 OpenAI / Claude / DeepSeek / Ollama，非 RAG 智能上下文注入
- 🔄 **多设备同步**：Git 自动 commit/push/pull
- 🔍 **增强搜索**：中文分词、标签系统、代码结构索引

## 已有功能（继承自 Otterly）

- ✅ 本地优先 Markdown vault，文件以原始格式存储
- ✅ 全文搜索（SQLite FTS5）+ Omnibar
- ✅ `[[wiki-links]]` + Backlinks + Outlinks
- ✅ 文件树导航、多标签页编辑
- ✅ Git 感知状态、检查点、版本历史
- ✅ 明/暗主题 + 自定义主题
- ✅ 可自定义快捷键
- ✅ Tauri 2 跨平台（macOS / Windows / Linux）

## 技术栈

| 层级     | 技术                                  |
| -------- | ------------------------------------- |
| 前端     | SvelteKit + Svelte 5 + TypeScript     |
| 编辑器   | Milkdown (ProseMirror) + CodeMirror 6 |
| 桌面打包 | Tauri 2                               |
| 后端     | Rust                                  |
| 数据库   | SQLite + FTS5                         |
| Git      | git2 (Rust) + isomorphic-git (JS)     |

## 开发

### 前置要求

- [Node.js](https://nodejs.org/) >= 20
- [pnpm](https://pnpm.io/) >= 10
- [Rust](https://www.rust-lang.org/tools/install) >= 1.75
- Tauri 2 系统依赖（参见 [Tauri 文档](https://v2.tauri.app/start/prerequisites/)）

### 开始开发

```bash
# 安装依赖
pnpm install

# 启动开发模式（前端 + Rust 后端热重载）
pnpm tauri dev

# 类型检查
pnpm check

# 代码检查
pnpm lint

# 运行测试
pnpm test

# Rust 类型检查
cd src-tauri && cargo check
```

### 构建

```bash
pnpm tauri build
```

## 项目文档

- [BLUEPRINT.md](./design/BLUEPRINT.md) — 项目蓝图与架构设计
- [GAP_ANALYSIS.md](./design/GAP_ANALYSIS.md) — Gap 分析与开发计划
- [architecture.md](./docs/architecture.md) — 代码架构说明
- [UI.md](./docs/UI.md) — UI 设计规范

## 许可证

[MIT License](./LICENSE) — 继承自 Otterly
