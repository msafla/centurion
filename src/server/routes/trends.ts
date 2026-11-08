import type { FastifyInstance } from 'fastify';
import { FilterInputSchema } from '../../shared/schemas';
import { buildTrend } from '../domain/report';
import { parseInput } from '../http/errors';
import type { Runtime } from '../runtime';

export function registerTrendRoutes(app: FastifyInstance, runtime: Runtime): void {
  app.get('/api/trends', async (request) =>
    runtime.gate.runRead(() => {
      const filter = parseInput(FilterInputSchema, request.query ?? {});
      return buildTrend(runtime.db.db, filter);
    }),
  );
}