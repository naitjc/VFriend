# Changelog

## 1.5.1 — 2026-10-25

- Adopt Companion V after the user selected the two-companion concept. Match the Web icon, adaptive/legacy Android launchers, monochrome layer and splash palette with one vector source.
- Preserve the four proposals and previous Conversation V reference; add an icon preview page.
- Restore the original welcome dialog reminder.
- Android versionCode is 11; application IDs and signing configuration are unchanged.

## 1.5.0 — 2026-10-25

- Unify Web and Android chat orchestration, chapter/goal advisers, summaries, model validation and chapter snapshot rules.
- Split the Pinia action implementation and isolate each store's saves, timers and abort controllers. Strengthen native transaction boundaries around chapter closure, queued saves, trash creation and restore.
- Extract the guide and model settings dialog into lazy components. Keep connection testing separate from credential persistence. Cover JSON response-body reads with cancellation and timeouts.
- Add root development/check/build commands, frontend undefined-reference checks, isolated HTTP integration tests and GitHub Web/Android checks. Update compatible dependencies; both npm audits report zero known vulnerabilities at validation time.
- Adopt the selected Conversation V icon for Web, Android launchers, Android monochrome themes and the splash screen. Preserve all four original proposals, research links and generation prompts.
- Preserve application IDs, data keys and backup compatibility. Android versionCode is 10. Local debug signing is unchanged; release signing still requires a stable private keystore.
