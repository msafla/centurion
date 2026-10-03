import type { FastifyInstance } from 'fastify';
import { planInScope } from '../db/scoping';
import { buildReport, buildSummary } from '../domain/report';
import { OccurrenceQuerySchema, toFilter } from '../http/filters';
import { parseInput } from '../http/errors';
import type { Runtime } from '../runtime';

export function registerReportingRoutes(app: FastifyInstance, runtime: Runtime): void {
  app.get('/api/plans/:planId/summary', async (request) =>
    runtime.gate.runRead(() => {
      const { planId } = request.params as { planId: string };
      planInScope(runtime.db.db, planId);
      const query = parseInput(OccurrenceQuerySchema, request.query);
      return buildSummary(runtime.db.db, planId, toFilter(query));
    }),
  );

  app.get('/api/plans/:planId/report', async (request) =>
    runtime.gate.runRead(() => {
      const { planId } = request.params as { planId: string };
      planInScope(runtime.db.db, planId);
      const query = parseInput(OccurrenceQuerySchema, request.query);
      return buildReport(
        runtime.db.db,
        runtime.clock,
        planId,
        toFilter(query),
        query.page,
        query.page_size,
      );
    }),
  );
}
