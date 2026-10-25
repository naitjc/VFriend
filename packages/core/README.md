# @vfriend/core

Private, dependency-free rules shared by the Node service, Web UI and Android adapter. Import public modules through the package exports:

```js
const { runChatTurn } = require('@vfriend/core/session')
// Client ES modules can also use: import session from '@vfriend/core/session'
```

| Export | Purpose |
| --- | --- |
| `rules` / `prompt` | Relationship, memory, token and prompt rules |
| `session` | Chat-turn orchestration |
| `workflow` / `advisors` | Chapter, goal, summary and fork operations |
| `relationships` / `snapshots` | Goal updates and chapter state |
| `archives` / `model-settings` | Portable backup format and provider validation |

Storage, network calls and credentials stay in platform adapters. Each app uses a local `file:../../packages/core` dependency; dependencies remain inside each app so Capacitor's native plugin discovery keeps working. Run installation and regression checks from the [repository root](../../README.md).
