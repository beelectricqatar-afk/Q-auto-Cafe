import { useSyncExternalStore } from 'react'

// Goes up whenever a sync brings in something another device changed, so a
// screen that read its records once (orders, expenses…) knows to read again.
let version = 0
const listeners = new Set<() => void>()

export function bumpSyncVersion() { version++; listeners.forEach(l => l()) }

const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l) } }
export function useSyncVersion(): number { return useSyncExternalStore(subscribe, () => version) }
