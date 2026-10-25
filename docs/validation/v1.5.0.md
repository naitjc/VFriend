# v1.5.0 validation — 2026-10-25

| Check | Result |
| --- | --- |
| `npm run check` | Frontend undefined-reference lint passed; 66 tests passed, 0 failed; production Web build passed |
| Android sync and Gradle build | `assembleDebug` and `assembleParallel` passed with JDK 21 and SDK 36 |
| npm dependency audits | Frontend and backend report 0 known vulnerabilities after compatible lockfile updates |
| Isolated browser regression | Model settings dialog, guide navigation, archive selection, stop/retry, complete response and story creation passed against a local fixture provider |
| Responsive UI | Desktop and a 390px iframe viewport checked; mobile archive selection returns to chat with the input available |
| Unified launcher | Both services returned HTTP 200; SIGTERM returned exit 0 and closed both test ports |
| APK metadata | Standard and `.preview` application IDs preserved; label VFriend; versionCode 10; version 1.5.0 / 1.5.0-parallel |
| APK signature | Parallel APK verifies and matches the local v1.4.1 parallel certificate |

SQL adapter, HTTP and launcher checks used temporary databases. Browser model traffic used a local fixture; no live provider quality or latency claim is made. Existing user data was backed up locally before starting the updated backend. Databases, keys, local screenshots and APK binaries are excluded from Git.

The device plugin lifecycle, launcher masks, themed icon appearance and splash-screen appearance still need a physical Android device check. Build success and the Node SQL bridge do not establish those results. GitHub CI results are recorded in the actual Actions run, separately from the local checks above.
