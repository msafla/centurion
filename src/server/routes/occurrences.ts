import type { FastifyInstance } from 'fastify';
import { StatusInputSchema } from '../../shared/schemas';
import type { MutationDeps } from '../db/database';
import { planInScope } from '../db/scoping';
import { listOccurrences } from '../domain/queries';
import { setOccurrenceStatus } from '../domain/realizations';
import { OccurrenceQuerySchema, toFilter } from '../http/filters';
import { parseInput } from '../http/errors';
import type { Runtime } from '../runtime';

function deps(runtime: Runtime): MutationDeps {
  return { db: runtime.db, clock: runtime.clock };
}

export function registerOccurrenceRoutes(app: FastifyInstance, runtime: Runtime): void {
  app.get('/api/plans/:planId/occurrences', async (request) =>
    runtime.gate.runRead(() => {
      const { planId } = request.params as { planId: string };
      planInScope(runtime.db.db, planId);
      const query = parseInput(OccurrenceQuerySchema, request.query);
      return listOccurrences(runtime.db.db, planId, toFilter(query), query.page, query.page_size);
    }),
  );

  app.put('/api/plans/:planId/occurrences/:occurrenceId/status', async (request) => {
    const { planId, occurrenceId } = request.params as {
      planId: string;
      occurrenceId: string;
    };
    const input = parseInput(StatusInputSchema, request.body);
    return runtime.gate.runExclusive(() =>
      setOccurrenceStatus(deps(runtime), planId, occurrenceId, input, 'api'),
    );
  });
}
