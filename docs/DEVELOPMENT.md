# 开发与构建

## 环境与安装

全项目工具需要 Node.js 22 LTS（22.13+）或 24+、npm 和 Python 3。Python 仅用于已有矢量资源生成与校验；不需要额外 Python 包。单独运行后端仍支持 Node.js 22.5+。

```bash
npm run setup
```

根目录锁文件管理共用工具；apps/server 与 apps/client 各自锁定运行依赖。packages/core 通过本地 file 依赖供两端及根目录测试使用。`setup` 使用三个锁文件执行 `npm ci`；克隆后不要依赖全局安装的工具。

## 开发与生产

```bash
npm run dev
# Ctrl+C 同时停止当前启动器的前后端进程

npm run build
npm start
```

开发页面在 `127.0.0.1:5173`，API 默认在 8888。生产由 Express 同时提供 dist 与 API，默认地址为 `http://127.0.0.1:8888`。API 默认使用相对路径，因此通过实际网页域名访问时也能工作。

`PORT=8889 npm run dev` 会同时调整后端端口和开发代理目标。仅在 backend `.env` 修改 PORT 时，还需设置对应的 `VFRIEND_API_ORIGIN`，或在前端指定 `VITE_API_URL`。自定义 `VFRIEND_WEB_PORT` 可以修改开发页面端口。

## 配置与数据

- 可选服务器默认值：复制 `apps/server/.env.example` 为 `.env`，填写 `API_KEY`、`API_BASE_URL`、`MODEL`、`PORT`。
- Web 会话配置覆盖服务器默认模型，并用于聊天、试聊、章节摘要、章节/目标建议及分支摘要。它不会自动写入服务器 `.env`。
- 前端可选构建配置见 `apps/client/.env.example`；跨域后端填写 `VITE_API_URL`。留空时开发走代理、生产走同源。
- Web 数据默认在 `apps/server/data/chat.db`，可用 `SQLITE_PATH` 修改。移动数据库前先停止写入并备份。
- Android 数据存在本机 SQLite，Key 存在安全存储；Web 和 Android 通过完整备份迁移，导入会创建新 ID。

## 检查

```bash
npm run check
npm run lint
npm test
npm run check:repo
npm run icons
```

`check` 顺序执行版本/文档/生成图标校验、全项目 ESLint、隔离回归测试和 Web 生产构建。测试使用临时 SQLite、本地 HTTP 服务或模拟模型，不使用真实聊天数据和收费模型。`icons --check` 在 CI 中只比较资源，不改文件。

UI 实测需要使用独立测试数据库和本地模拟服务。不要为了验证布局打开或导出用户的真实聊天。具体历史证据见 [验证记录](README.md)。Android SQL bridge 测试不代表真机插件、系统文件选择器、主题图标或进程恢复已通过测试。

## Android

需要 JDK 21、SDK Platform 36 和 Build Tools。首次配置 Android SDK 路径使用 Android Studio 或未跟踪的 `android/local.properties`。

```bash
npm run android:apk
npm run android:parallel
```

应用 ID 保持 `com.naitjc.chatrp`；共存版使用 `.preview`。本地 v1.4.x 之后同签名、同 ID 的包可覆盖更新；历史 GitHub v1.3.1 调试包使用不同证书，不能直接覆盖。保留旧应用，先用完整备份导入新版。旧版调试应用也可使用：

```bash
python3 scripts/export-android-legacy.py --push
```

该工具需已授权 USB 调试的手机，不卸载旧应用、不读取 API Key。ADB 迁移仍需真机核验。

GitHub tag 工作流会运行项目检查并生成调试 APK；正式发行需另行配置稳定的私有签名。不要把 keystore 或密钥提交到 Git。

## 目录命名与迁移

项目目录为 `VFriend`。`apps/client` 表示 Web/Android 共用客户端，`apps/server` 表示 API 服务，`packages/core` 表示无平台依赖的共享规则，跨端回归测试统一放在根目录 `tests`。

核心模块文件和 CLI 脚本采用 kebab-case；Vue 组件保留 PascalCase，应用内部 JavaScript 保留已有 camelCase。`src/api/index.js` 是平台 API 的统一入口。

旧目录迁移后，本地 `.env`、`data/`、SDK 配置和未跟踪文件随应用目录保留。外部自定义命令、IDE 启动配置及自定义绝对 SQLITE_PATH 应更新到新目录。Android 应用 ID、SQLite 文件名、备份标识和已保存头像 URL 保留兼容名称。
