import type { FastifyInstance } from 'fastify';
import { planInScope } from '../db/scoping';
import { buildReport, buildSummary } from '../domain/report';
import { OccurrenceQuerySchema, toFilter } from '../http/filters';
import { parseInput } from '../http/errors';
import { buildCsv } from '../reports/csv';
import { PDF_MAX_ROWS, buildReportPdf } from '../reports/report-pdf';
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

  app.get('/api/plans/:planId/exports/controls.csv', async (request, reply) => {
    const { planId } = request.params as { planId: string };
    const result = runtime.gate.runRead(() => {
      const plan = planInScope(runtime.db.db, planId);
      const query = parseInput(OccurrenceQuerySchema, request.query);
      return { csv: buildCsv(runtime.db.db, planId, toFilter(query)), year: plan.year };
    });
    reply.header('content-type', 'text/csv; charset=utf-8');
    reply.header('content-disposition', `attachment; filename="controls-${result.year}.csv"`);
    reply.header('cache-control', 'no-store');
    return reply.send(result.csv);
  });

  app.get('/api/plans/:planId/exports/report.pdf', async (request, reply) => {
    const { planId } = request.params as { planId: string };
    const snapshot = runtime.gate.runRead(() => {
      const plan = planInScope(runtime.db.db, planId);
      const query = parseInput(OccurrenceQuerySchema, request.query);
      return {
        report: buildReport(
          runtime.db.db,
          runtime.clock,
          planId,
          toFilter(query),
          1,
          PDF_MAX_ROWS + 1,
        ),
        year: plan.year,
      };
    });
    const pdf = await buildReportPdf(snapshot.report);
    reply.header('content-type', 'application/pdf');
    reply.header('content-disposition', `attachment; filename="report-${snapshot.year}.pdf"`);
    reply.header('cache-control', 'no-store');
    return reply.send(Buffer.from(pdf));
  });
}
