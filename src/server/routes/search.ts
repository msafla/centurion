import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requiredText } from '../../shared/schemas';
import { parseInput } from '../http/errors';
import type { Runtime } from '../runtime';

const SearchSchema = z.object({ q: requiredText(120) }).strict();

export function registerSearchRoutes(app: FastifyInstance, runtime: Runtime): void {
  app.get('/api/search', async (request) =>
    runtime.gate.runRead(() => {
      const { q } = parseInput(SearchSchema, request.query);
      const escaped = q.replace(/[\\%_]/g, (match) => `\\${match}`);
      const pattern = `%${escaped}%`;
      const rows = runtime.db.db
        .prepare(
          `SELECT c.id AS control_id, c.plan_id AS plan_id, p.year AS plan_year, p.name AS plan_name,
                  c.code, c.title, c.status
           FROM controls c JOIN plans p ON p.id = c.plan_id
           WHERE c.status IN ('active','archived')
             AND (c.code LIKE ? ESCAPE '\\' OR c.title LIKE ? ESCAPE '\\' OR c.description LIKE ? ESCAPE '\\')
           ORDER BY p.year DESC, c.code
           LIMIT 50`,
        )
        .all(pattern, pattern, pattern);
      return rows;
    }),
  );
}