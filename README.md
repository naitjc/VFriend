# VFriend

<img src="design/brand/vfriend.svg" width="88" alt="VFriend Companion V icon">

VFriend（Virtual Friend，虚拟伙伴）是一款基于 Vue、Express 与 SQLite 的角色聊天应用，支持 Web 和无需自建后端的 Android 版本。

- **自由聊天**：独立存档、关系成长、记忆与约定事项。
- **故事模式**：用户设定目标、确认章节推进，并能从过去章节创建分支。
- **流式交互**：停止生成、保留未完成内容、原位重试；完整回复先保存，再整理记忆。
- **数据管理**：SQLite 持久化、跨端 JSON 备份、导入副本及可恢复的回收站。
- **角色与外观**：角色向导、独立试聊、头像/背景优化、窄屏抽屉和内置教程。

## 启动

需要 Node.js 22 LTS（22.13+）或 24+。首次安装在仓库根目录执行：

```bash
npm run setup
npm run dev
```

打开 `http://127.0.0.1:5173/`。在“更多操作 → 模型 API 设置”填写模型信息；也可以复制 `qa-app/backend/.env.example` 为同目录的 `.env`，填写服务器默认配置。不设置 Key 也能管理已有存档。

开发时 Web 通过 Vite 代理连接后端；生产构建默认请求网页同源的 API。外置后端可通过 `VITE_API_URL` 指定，开发代理目标可用 `VFRIEND_API_ORIGIN` 指定。

```bash
npm run check   # 仓库一致性、全项目静态检查、回归测试、Web 构建
npm run build
npm start       # Express 提供构建后的网页与 API，默认端口 8888
```

## Android

Android 与 Web 共用界面和领域逻辑，存档保存在手机 SQLite，Key 保存在系统安全存储，模型从手机直连。两端的数据独立；需要迁移时使用完整备份。Android 固定使用 `DeepSeek-V4-Flash`。

本地构建需要 JDK 21、Android SDK Platform 36 和相应 Build Tools：

```bash
npm run android:apk
npm run android:parallel
```

标准版产物为 `qa-app/frontend-vue/android/app/build/outputs/apk/debug/app-debug.apk`；共存版在 `outputs/apk/parallel/app-parallel.apk`。当前版本为 **1.6.0**（versionCode **12**）。

本地调试包适合个人测试。历史 v1.3.1 GitHub APK 与当前本地签名不同；迁移和签名说明见 [Android 开发与迁移](docs/DEVELOPMENT.md#android)。CI 调试签名不是稳定的正式发行签名。

## 仓库导航

| 位置 | 内容 |
| --- | --- |
| `qa-app/frontend-vue/` | Vue 界面、Pinia actions、Web/Android 适配器和原生工程 |
| `qa-app/backend/` | Express API、Web SQLite 存储及回归测试 |
| `qa-app/shared/` | 聊天编排、章节工作流、目标状态、提示词、快照和备份规则 |
| `scripts/` | 启动、图标生成/校验、仓库检查和旧 Android 存档导出 |
| `design/` | 正式 Companion V 矢量源、预览、探索稿及来源记录 |
| `docs/` | 使用、开发、架构与按版本归档的验证记录 |

[文档索引](docs/README.md) · [使用指南](docs/USER_GUIDE.md) · [参与开发](CONTRIBUTING.md) · [更新记录](CHANGELOG.md)

主分支和 PR 自动检查 Web、共享规则及两个 Android 构建。`.env`、数据库、私有签名文件和本地 APK 不进入仓库。既有应用 ID、数据库名、设置键与 `chat-rp-backup` 格式标识保持兼容。
