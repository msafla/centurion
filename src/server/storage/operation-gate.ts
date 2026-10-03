import { AsyncLocalStorage } from 'node:async_hooks';
import { AppError } from '../http/errors';

/**
 * Serializes exclusive mutations and maintenance windows. Re-entrant within the
 * same async context so an approval that already holds the gate can inject the
 * target business route without acquiring it twice.
 */
export class OperationGate {
  private tail: Promise<unknown> = Promise.resolve();
  private maintenanceActive = false;
  private readonly held = new AsyncLocalStorage<boolean>();

  isMaintenance(): boolean {
    return this.maintenanceActive;
  }

  runExclusive<T>(fn: () => Promise<T> | T): Promise<T> {
    if (this.held.getStore()) {
      return Promise.resolve(fn());
    }
    const run = this.tail.then(() => this.held.run(true, fn));
    this.tail = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  runMaintenance<T>(fn: () => Promise<T> | T): Promise<T> {
    return this.runExclusive(async () => {
      this.maintenanceActive = true;
      try {
        return await fn();
      } finally {
        this.maintenanceActive = false;
      }
    });
  }

  runRead<T>(fn: () => T): T {
    if (this.maintenanceActive) {
      throw new AppError(503, 'maintenance_in_progress', 'Maintenance in progress');
    }
    return fn();
  }
}
