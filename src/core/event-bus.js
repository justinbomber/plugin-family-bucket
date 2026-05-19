/**
 * 進程內簡易事件總線（同一 Service Worker 生命週期內）。
 */
export function createEventBus() {
  /** @type {Map<string, Set<(payload?: unknown) => void>>} */
  const subscribers = new Map();

  /**
   * @param {string} topic
   * @param {(payload?: unknown) => void} listener
   * @returns {() => void} unsubscribe
   */
  function on(topic, listener) {
    let set = subscribers.get(topic);
    if (!set) {
      set = new Set();
      subscribers.set(topic, set);
    }
    set.add(listener);
    return () => {
      set.delete(listener);
    };
  }

  /**
   * @param {string} topic
   * @param {unknown} [payload]
   */
  function emit(topic, payload) {
    const set = subscribers.get(topic);
    if (!set?.size) return;
    for (const fn of [...set]) {
      try {
        fn(payload);
      } catch {
        /* 單一訂閱例外不擴散 */
      }
    }
  }

  return { on, emit };
}
