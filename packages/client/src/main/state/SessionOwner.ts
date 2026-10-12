/** Owns one published session, and every initialization that may still finish. */
export class SessionOwner<T extends { dispose(): Promise<void> }> {
  private generation = 0;
  private current: { id: string; session: T } | undefined;
  private pending: { id: string; promise: Promise<T> } | undefined;
  private operations = new Set<Promise<unknown>>();
  private stopped = false;

  get connectionId() {
    return this.pending?.id ?? this.current?.id;
  }

  async get(): Promise<T> {
    if (this.pending) return this.pending.promise;
    if (this.current) return this.current.session;
    throw new Error("Connect to a database first.");
  }

  connect(id: string, initialize: () => Promise<T>): Promise<T> {
    if (this.stopped)
      return Promise.reject(new Error("Application is shutting down."));
    const generation = ++this.generation;
    const promise = (async () => {
      const session = await initialize();
      if (generation !== this.generation) {
        await session.dispose();
        throw new Error("Connection initialization was superseded.");
      }
      const previous = this.current;
      this.current = { id, session };
      this.pending = undefined;
      if (previous) await previous.session.dispose();
      // Disposal can overlap another switch/disconnect.
      if (generation !== this.generation)
        throw new Error("Connection was superseded.");
      return session;
    })();
    this.pending = { id, promise };
    this.track(promise);
    void promise.catch(() => {
      if (generation === this.generation) this.pending = undefined;
    });
    return promise;
  }

  disconnect(id?: string): Promise<void> {
    if (id && this.current?.id !== id && this.pending?.id !== id)
      return Promise.resolve();
    const cancelled = !id || this.pending?.id === id;
    if (cancelled || (!this.pending && this.current?.id === id)) {
      ++this.generation;
      this.pending = undefined;
    }
    const previous = !id || this.current?.id === id ? this.current : undefined;
    if (previous) this.current = undefined;
    const cleanup = previous?.session.dispose() ?? Promise.resolve();
    this.track(cleanup);
    // Also wait for superseded initializations to release their resources.
    return cancelled
      ? Promise.allSettled([...this.operations]).then(() => cleanup)
      : cleanup;
  }

  async shutdown(): Promise<void> {
    this.stopped = true;
    await this.disconnect();
  }

  private track(promise: Promise<unknown>) {
    this.operations.add(promise);
    void promise.then(
      () => this.operations.delete(promise),
      () => this.operations.delete(promise)
    );
  }
}
