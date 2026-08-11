import '@testing-library/jest-dom'
import 'fake-indexeddb/auto'

// jsdom has no ResizeObserver, and the revenue chart measures its container to
// fill the card's width. Without a stub that code path is simply skipped in
// tests; this one lets a test drive it by invoking the stored callback.
class TestResizeObserver implements ResizeObserver {
  static instances: { callback: ResizeObserverCallback; targets: Element[] }[] = []
  private entry: { callback: ResizeObserverCallback; targets: Element[] }
  constructor(callback: ResizeObserverCallback) {
    this.entry = { callback, targets: [] }
    TestResizeObserver.instances.push(this.entry)
  }
  observe(target: Element) { this.entry.targets.push(target) }
  unobserve(target: Element) { this.entry.targets = this.entry.targets.filter(t => t !== target) }
  disconnect() {
    TestResizeObserver.instances = TestResizeObserver.instances.filter(i => i !== this.entry)
    this.entry.targets = []
  }
}
globalThis.ResizeObserver = TestResizeObserver as unknown as typeof ResizeObserver

/** Reports `width` to every live observer, as a real resize would. */
export function resizeTo(width: number) {
  for (const { callback, targets } of TestResizeObserver.instances) {
    callback(targets.map(target => ({ target, contentRect: { width, height: 260 } })) as unknown as ResizeObserverEntry[],
      null as unknown as ResizeObserver)
  }
}
