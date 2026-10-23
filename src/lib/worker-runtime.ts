/** Worker image and startup must stay on the tested, patched Node 24 line. */
export function assertWorkerRuntime(version: string): void {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match || Number(match[1]) !== 24 || Number(match[2]) < 22 ||
      (Number(match[2]) === 22 && Number(match[3]) < 1)) {
    throw new Error("worker_runtime_unsupported: requires Node 24.22.1 or later in major 24");
  }
}
