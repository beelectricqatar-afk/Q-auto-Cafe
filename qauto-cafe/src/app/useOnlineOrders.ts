import { useCallback, useEffect, useRef, useState } from 'react'
import { onlineClient } from '../sync/online'
import type { OnlineOrder } from '../domain/online'

const EVERY_MS = 6000

const startOfToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime() }

// Two rising notes, rung four times a second and a bit apart, loud enough to
// be heard across a busy counter.
const RINGS = 4
const RING_GAP_S = 1.2
const VOLUME = 0.7
let audio: AudioContext | null = null
function chime() {
  try {
    audio ??= new AudioContext()
    void audio.resume()
    for (let ring = 0; ring < RINGS; ring++) {
      ;[0, 0.18].forEach((delay, i) => {
        const osc = audio!.createOscillator(), gain = audio!.createGain()
        osc.frequency.value = i ? 1046 : 784
        osc.connect(gain); gain.connect(audio!.destination)
        const t = audio!.currentTime + ring * RING_GAP_S + delay
        gain.gain.setValueAtTime(0.0001, t)
        gain.gain.exponentialRampToValueAtTime(VOLUME, t + 0.02)
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.35)
        osc.start(t); osc.stop(t + 0.4)
      })
    }
  } catch { /* no sound available; the count on the tab still shows it */ }
}

/** The online board, checked every few seconds; rings when a new order arrives. */
export function useOnlineOrders() {
  const [orders, setOrders] = useState<OnlineOrder[]>([])
  const seen = useRef<Set<string> | null>(null)

  const reload = useCallback(async () => {
    try {
      const list = await onlineClient.list(startOfToday())
      const pending = list.filter(o => o.status === 'pending').map(o => o.id)
      // The first load only learns what is already waiting; it does not ring for it.
      if (seen.current && pending.some(id => !seen.current!.has(id))) chime()
      seen.current = new Set([...(seen.current ?? []), ...pending])
      setOrders(list)
    } catch { /* offline: keep showing the last board */ }
  }, [])

  useEffect(() => {
    const first = setTimeout(() => { void reload() }, 0)
    const timer = setInterval(() => { void reload() }, EVERY_MS)
    return () => { clearTimeout(first); clearInterval(timer) }
  }, [reload])

  return { orders, reload, pendingCount: orders.filter(o => o.status === 'pending').length }
}
