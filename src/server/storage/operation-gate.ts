import { AppError } from '../http/errors';

/**
 * Serializes exclusive mutations and maintenance windows. Reads are refused
 * while a maintenance window is active so an installation never exposes a
 * half-swapped database.
 */
export class OperationGate {
  private tail: Promise<unknown> = Promise.resolve();
  private maintenanceActive = false;

  isMaintenance(): boolean {
    return this.maintenanceActive;
  }

  runExclusive<T>(fn: () => Promise<T> | T): Promise<T> {
    const run = this.tail.then(() => fn());
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
