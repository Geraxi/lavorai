import { AsyncLocalStorage } from "node:async_hooks";
export const emailContext = new AsyncLocalStorage<{ kind: string; to: string; returnProviderErrors?: boolean; deadlineAt?: number }>();
