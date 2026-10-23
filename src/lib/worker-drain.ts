/** Tracks work already admitted; shutdown never cancels or resets its claims. */
export class WorkerDrain {
  stopping = false;
  private active = new Set<Promise<unknown>>();
  run<T>(work: () => Promise<T>, alreadyAdmitted = false): Promise<T> {
    if (this.stopping && !alreadyAdmitted) return Promise.reject(new Error("worker_draining"));
    const task = Promise.resolve().then(work);
    this.active.add(task);
    void task.then(() => this.active.delete(task), () => this.active.delete(task));
    return task;
  }
  async close(): Promise<void> {
    this.stopping = true;
    while (this.active.size) await Promise.allSettled([...this.active]);
  }
  get pending(): number { return this.active.size; }
}
