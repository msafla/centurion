import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import { controlInPlan } from '../db/scoping';
import { createClause, listClauses, setControlClauses } from '../domain/clauses';
import { parseInput } from '../http/errors';
import type { Runtime } from '../runtime';

const ClauseCreateSchema = z
  .object({
    referential_slug: z.string().nullable().optional(),
    code: z.string().min(1).max(80),
    title: z.string().min(1).max(240),
  })
  .strict();

const ControlClauseSchema = z
  .object({
    clause_ids: z.array(z.string().uuid()).max(200),
  })
  .strict();

export function registerClauseRoutes(app: FastifyInstance, runtime: Runtime): void {
  app.get('/api/clauses', async (request) => {
    const query = request.query as { referential?: string };
    return runtime.gate.runRead(() => listClauses(runtime.db.db, query.referential || undefined));
  });

  app.post('/api/clauses', async (request, reply) => {
    const input = parseInput(ClauseCreateSchema, request.body);
    const dto = await runtime.gate.runExclusive(() =>
      createClause(runtime.db.db, {
        referentialSlug: input.referential_slug ?? null,
        code: input.code,
        title: input.title,
        nowUtc: runtime.clock.nowUtc(),
      }),
    );
    return reply.status(201).send(dto);
  });

  app.put('/api/plans/:planId/controls/:controlId/clauses', async (request) => {
    const { planId, controlId } = request.params as { planId: string; controlId: string };
    const input = parseInput(ControlClauseSchema, request.body);
    return runtime.gate.runExclusive(() => {
      controlInPlan(runtime.db.db, planId, controlId);
      setControlClauses(runtime.db.db, controlId, input.clause_ids, runtime.clock.nowUtc());
      return { control_id: controlId, clause_ids: input.clause_ids };
    });
  });
}
