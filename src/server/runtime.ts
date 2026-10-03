import { randomUUID } from 'node:crypto';
import type { Clock } from './clock';
import type { Config } from './config';
import type { DatabaseHandle } from './db/database';
import type { OperationGate } from './storage/operation-gate';

/**
 * Mutable process-owned runtime. The database handle and engine epoch change
 * on restore, so routes read them through this object rather than a value
 * captured at build time.
 */
export class Runtime {
  constructor(
    readonly config: Config,
    readonly clock: Clock,
    readonly dataDir: string,
    readonly gate: OperationGate,
    public db: DatabaseHandle,
    public engineEpoch: string,
  ) {}

  replaceDatabase(handle: DatabaseHandle): void {
    this.db = handle;
  }

  renewEpoch(): string {
    this.engineEpoch = randomUUID();
    return this.engineEpoch;
  }
}
