# 📋 Changelog

所有版本的更新记录。格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/)。

---

## [1.0.0] - 2026-05-01

### 🎉 大版本里程碑

- **feat**: 新增自动更新模块（UpdateStore/UpdateService/UpdateDialog）
- **feat**: Help 菜单新增「检查更新」功能，支持应用内检查新版本
- **docs**: `update/UPDATE_SYSTEM_DESIGN.md` 完整更新系统设计规划

---

## [0.4.0] - 2026-05-01

### ✨ 新功能

- **feat**: 登录页 slogan 改为「24小时激烈陪伴成长型知识笔记」
- **feat**: App 右上角 TabBar 显示 slogan「24小时陪伴成长型知识笔记」
- **feat**: NLP 面板新增 BPE Token 分析（纯 Rust 实现）
  - 显示 Token 总数、词表大小、合并次数、压缩比
  - Top 合并规则可视化
  - 高频 Token 分布图
  - BPE 算法原理说明
- **feat**: Profile 成就徽章展示优化（已点亮 + 未来 3 个一排）
- **feat**: 点击任意徽章图标打开 `docs/badges.md` 说明文档
- **feat**: 登录页保留最近 5 个成功登录账号，快速选择
- **feat**: 用户名不区分大小写（提示 + 比对逻辑）
- **feat**: Usage Statistics 连续天数改为 dd天:hh时:mm分:ss秒 实时计时格式
- **feat**: 秒数翻动动画效果

### 📝 文档

- **docs**: `docs/badges.md` — 成就徽章系统完整说明
- **docs**: `pets/PET_SYSTEM_DESIGN.md` — 电子宠物产品设计规划（13 章）

### 🔧 修复

- **fix**: 移除 upstream (otterly) 远程仓库
- **fix**: DMG 安装包 Python.framework 签名冲突修复（install_name_tool + codesign）
- **fix**: Svelte 5 `@const` 位置限制错误修复（改用 `$derived`）
- **fix**: 登录逻辑用户名比对统一使用 `toUpperCase()`

### 🏗️ 基础设施

- **chore**: Rust 后端新增 `bpe.rs` BPE 分析模块
- **chore**: 新增 `nlp_bpe_analyze` Tauri 命令
- **chore**: tauri.conf.json 添加 Python.framework 打包配置

---

## [0.3.1] - 2026-04-30

### 基础版本

- 初始功能：Markdown 编辑器、文件管理、NLP 分析
- 积分系统、成长等级
- Git 版本控制集成
- 多用户支持（登录/注册/游客）
- 主题切换
- 全文搜索（FTS5）
- Python NLP 桥接（jieba/sentiment/NER/分类）

---

## [0.2.0] - 2026-04-28

- 用户系统：多用户切换、密码管理
- 积分系统：行为积分 + 等级体系
- 统计仪表盘：会话统计、图表可视化

---

## [0.1.0] - 2026-04-25

- 项目初始化
- 基于 Otterly 的 Tauri 2 + SvelteKit 框架
- Markdown 编辑器核心功能
- 本地文件存储
