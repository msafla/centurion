import { AsyncLocalStorage } from 'node:async_hooks';

export type PrivateContext = {
  source: 'mcp';
  operationId: string;
  proposalId?: string;
};

/**
 * Private, unforgeable request context. It can only be created by
 * `runWithPrivateContext` inside the backend process; no header or body can
 * set it. Guards and audit writers read the source from here.
 */
export const privateContext = new AsyncLocalStorage<PrivateContext>();

export function runWithPrivateContext<T>(context: PrivateContext, fn: () => T): T {
  return privateContext.run(context, fn);
}

export function currentSource(): 'api' | 'mcp' {
  return privateContext.getStore()?.source ?? 'api';
}
