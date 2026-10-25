# Runtime code

- `frontend-vue/`: shared Web/Android UI, platform adapters, and the Capacitor Android project.
- `backend/`: Web HTTP/SSE server, SQLite storage and regression tests.
- `shared/`: portable rules and workflows, with platform IO supplied by adapters.

Run development and checks from the [repository root](../README.md). Existing runtime paths remain stable so local databases and development configurations keep their locations. See [architecture](../docs/ARCHITECTURE.md) before moving behavior between layers.
