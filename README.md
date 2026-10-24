# Chat RP

基于 Vue、Express 与 SQLite 的本地沉浸式角色聊天应用。每个角色可以拥有多个互相独立的聊天存档，并在创建时选择聊天模式。

## 核心能力

- **自由模式**：连续聊天，不设置主线、章节或预设结局。
- **故事模式**：创建时设置最终目标；用户决定行动和推进速度。模型只在形成自然收束点时建议切章，必须由用户确认后才会进入下一章。
- **关系成长**：结合近期互动更新好感和情绪，信任、亲密等阶段由用户填写事件依据后确认，高好感度不会自动变成伴侣关系。旧存档阶段保持兼容。
- **停止与重试**：Web 和 Android 真实流式接收；可停止生成、保留部分内容并原位重试，完整回复先保存，再进行有时限的事项整理。
- **完整备份与恢复**：跨端 JSON 备份、导入副本、存档回收站；Android 使用系统文件选择器。
- **持久化与分支**：SQLite 保存角色快照、聊天记录、记忆与章节检查点；故事模式可以从过去章节创建独立分支。
- **长期连续性**：按容量整理较早对话，保留完整近期轮次和原始聊天记录；可编辑已确认记忆、当前场景与约定事项，完成或取消的事项继续保留状态。
- **容量提醒与继承**：显示上下文估算占用量，并在接近上限时创建继承角色、关系、记忆和最近对话的新存档。
- **可控初始状态**：自由模式可设置初始好感度；故事模式从好感度 0 开始，新存档的初始情绪在 -10～10 内生成并持久保存。
- **角色示例与试聊**：通过示例学习语气；独立试聊不写入正式聊天，也不改变关系和记忆。
- **显式故事记忆**：用户可以确认关键事件，将其作为长期故事记忆继承，普通闲聊不会自动写入。
- **内置教程**：Web 与 Android 界面均可直接打开分章节使用教程，完整说明另见 [USER_GUIDE.md](USER_GUIDE.md)。
- **手机专属布局**：窄屏使用精简顶部操作、全宽存档/设置抽屉和单栏教程；桌面默认两列，故事与记忆按需展开。阅读旧消息时不强制滚动，回复和整理记忆分别显示进度。
- **本地图片优化**：上传头像或背景时自动校验格式、限制大小并缩放为 WebP，避免存档无限膨胀。

## 技术栈

- 前端：Vue 3.5、Pinia 3、Element Plus 2.11、Vite 7
- 后端：Node.js 22.5+、Express 4、SQLite、Axios
- Web 数据：后端 SQLite 数据库，默认位于 `qa-app/backend/data/chat.db`
- Android：Capacitor 8、原生 SQLite、安全凭据存储

## 快速开始

### 1. 启动后端

```bash
cd qa-app/backend
npm install
```

创建 `.env`：

```env
API_KEY=your_key_here
API_BASE_URL=https://your-provider.example/v1
MODEL=your-model
PORT=8888
```

```bash
npm start
```

### 2. 启动前端

```bash
cd qa-app/frontend-vue
npm install
npm run dev
```

默认访问地址为 `http://127.0.0.1:5173/`，前端默认连接 `http://localhost:8888`。如需修改后端地址，可设置 `VITE_API_URL`。

## 验证

```bash
# 跨端回归测试（需先安装 backend 和 frontend-vue 两端依赖）
cd qa-app/backend && npm test

# 前端生产构建
cd qa-app/frontend-vue && npm run build
```

后端还提供 `GET /health` 健康检查接口。

## Android 安装包

Android 与 Web 共用 Vue 界面和聊天状态，但通过运行平台选择不同的数据与模型适配器：

- Web 继续连接现有 Express 后端，使用后端 SQLite 与 `.env` 中的模型配置。
- Android 不需要部署本项目后端。聊天存档保存在手机 SQLite，API Key 保存在 Android KeyStore 支持的安全存储中，模型请求从手机直连用户填写的 OpenAI 兼容接口。
- 两端默认使用各自独立的存档，不会互相覆盖；Android 仍需联网访问所配置的模型服务。

首次打开 Android 应用时，在“模型 API 设置”中填写 API 地址和 API Key。Android 版固定使用 `DeepSeek-V4-Flash`，无需填写模型名称。

Android 调试版（v1.3.1，包含记忆、关系与界面更新）：[下载 APK](https://github.com/naitjc/chat/releases/download/v1.3.1/Chat-RP-v1.3.1.apk)

> 该安装包使用开发调试签名，适合个人安装测试。Android 可能提示来源未知，需要在系统设置中允许当前浏览器或文件管理器安装应用。

本地构建需要 JDK 21、Android SDK Platform 36 和 Android Build Tools：

```bash
cd qa-app/frontend-vue
npm install
npm run android:apk
```

调试安装包生成在：

```text
qa-app/frontend-vue/android/app/build/outputs/apk/debug/app-debug.apk
```

该 APK 使用开发调试签名，适合直接安装测试；正式分发时应改用自己的 release keystore 签名。当前本地 Android 版本号为 `1.4.0`（versionCode `8`）。

## 主要目录

```text
qa-app/
├── shared/                    # Web / Android 共用的提示词、记忆和关系规则
├── backend/
│   ├── src/controllers/       # HTTP 与 SSE 请求处理
│   ├── src/services/          # LLM、状态、提示词、历史与存档服务
│   └── test/                  # Node 内置测试
└── frontend-vue/
    ├── src/components/        # 页面与交互组件
    ├── src/store/             # Pinia 状态和持久化协调
    ├── src/api/               # Web / Android 平台适配入口
    ├── src/services/          # Android SQLite、模型和安全配置实现
    ├── android/               # Capacitor Android 原生工程
    └── src/utils/             # 图片等通用能力
```

## 数据与安全边界

- `.env`、SQLite 数据库、APK 构建输出和依赖目录已被 Git 忽略。
- 聊天接口限制单条消息与历史长度，并对请求进行速率限制。
- 模型输出 Markdown 在渲染前经过 DOMPurify 清理。
- Android 清单关闭普通系统备份；模型 API Key 不会写入源码、Web 存储或 APK 配置。
- 删除存档不可恢复，界面会在执行前要求确认。

### 本地 v1.4.0 与旧版签名兼容

现有 1.3.1 发布包与当前本地调试签名不同，不能直接覆盖安装。可以运行 `npm run android:parallel`，生成应用 ID 为 `com.naitjc.chatrp.preview` 的“Chat RP 新版”，与旧应用共存。输出在 `android/app/build/outputs/apk/parallel/app-parallel.apk`。

旧版调试应用可以通过 `python3 scripts/export_android_legacy.py --push` 导出 SQLite 存档到完整备份 JSON，再在新版“导入备份”中恢复；使用前先结束手机上正在生成的回复，并连接已授权 USB 调试的手机。工具不卸载旧应用、不读取 API Key。ADB 迁移仍需真机验证。
