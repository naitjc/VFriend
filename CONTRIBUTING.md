# Contributing

Use Node.js 22 LTS (22.13+) or 24+, npm and Python 3. Start at the repository root:

```bash
npm run setup
npm run dev
npm run check
```

Place shared business rules under `packages/core/`; keep HTTP, native plugins, storage connections and credentials in platform adapters. Preserve the public API facade and the existing Android application IDs, storage keys and backup marker.

For behavior changes, add regression coverage at the relevant boundary: workflow rules, HTTP/native adapter behavior, SQLite persistence or client state. Use temporary databases and local model fixtures. A successful SQL bridge or build is not a device test. Simple text, style and asset edits need proportionate validation rather than duplicate implementation tests.

Edit `design/brand/icon.json` and run `npm run icons` when changing icon geometry. Root/frontend/Android versions must agree; update versionCode for new APK versions. `npm run check:repo` checks versions, documentation links and generated assets.

Include the resulting behavior, relevant checks and any remaining validation limits in a pull request. Do not commit `.env`, databases, API keys, private signing files, APK output or personal conversations. See [development instructions](docs/DEVELOPMENT.md) and [architecture](docs/ARCHITECTURE.md).
