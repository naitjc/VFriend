# v1.5.1 icon update validation — 2026-10-25

- SVG and generated Android XML resources parse successfully. The Web asset matches the brand source.
- Browser preview checked the full-color tile, round mask, monochrome silhouette and 24/48 px sizes. See `design/brand/preview.html`.
- Frontend undefined-reference lint passed. The production Web build and Capacitor sync passed.
- Android `assembleDebug` and `assembleParallel` passed with JDK 21 and SDK 36. App label remains VFriend; versionCode is 11; the coexistence package remains `com.naitjc.chatrp.preview`.
- The parallel APK signature verifies and retains the local debug certificate used by v1.5.0. This is separate from historical GitHub release signing.

The welcome dialog reminder restored in the previous edit is included. Chat behavior and data formats are unchanged by this patch. Physical-device launcher, themed-icon and splash-screen checks remain outstanding; browser mask previews are design checks only. CI results belong to the corresponding GitHub Actions run.
