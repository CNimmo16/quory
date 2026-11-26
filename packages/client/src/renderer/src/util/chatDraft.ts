/** Keep typing updates local to the composer while allowing chat requests to
 * clear the draft and the launch screen to seed it for retries. */
export function createChatDraft() {
  let value = "";
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => value,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    set(next: string) {
      if (value === next) return;
      value = next;
      listeners.forEach((listener) => listener());
    },
  };
}

export type ChatDraft = ReturnType<typeof createChatDraft>;
