import { toRaw } from 'vue'

// Runtime-only resources are isolated per Pinia state, never persisted in snapshots.
const sessions = new WeakMap()
export function getStoreRuntime(store) {
  const key = toRaw(store.$state)
  if (!sessions.has(key)) sessions.set(key, {
    saveTimer: null, saveSequence: Promise.resolve(), savedSignatures: new Map(), turnControllers: new Map(),
  })
  return sessions.get(key)
}
