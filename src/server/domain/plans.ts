import { randomUUID } from 'node:crypto';
import type { Clock } from '../clock';
import type { DatabaseHandle } from '../db/database';

/**
 * Creates the current-year plan only when the database has no plan at all.
 * An existing older plan is never silently followed by a new year.
 */
export function bootstrapPlanIfEmpty(handle: DatabaseHandle, clock: Clock): string | null {
  const count = handle.db.prepare('SELECT COUNT(*) AS c FROM plans').get() as { c: number };
  if (count.c > 0) return null;

  const year = Number(clock.todayParis().slice(0, 4));
  const now = clock.nowUtc();
  const id = randomUUID();
  handle.db
    .prepare(
      `INSERT INTO plans (id, year, name, perimeter, data_revision, created_at, updated_at)
       VALUES (?, ?, ?, '', 0, ?, ?)`,
    )
    .run(id, year, `Plan annuel ${year}`, now, now);
  return id;
}
