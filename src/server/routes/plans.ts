import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { PageInputSchema, optionalText, requiredText } from '../../shared/schemas';
import { planInScope } from '../db/scoping';
import { cloneYear, createPlan, listPlans, toPlanDto, updatePlan } from '../domain/plans';
import { parseInput } from '../http/errors';
import type { MutationDeps } from '../db/database';
import type { Runtime } from '../runtime';

const PlanCreateSchema = z
  .object({
    year: z.number().int().min(2000).max(2100),
    name: requiredText(160),
    perimeter: optionalText(1000),
  })
  .strict();

const PlanPatchSchema = z
  .object({
    name: requiredText(160).optional(),
    perimeter: optionalText(1000).optional(),
  })
  .strict()
  .refine((value) => value.name !== undefined || value.perimeter !== undefined, {
    message: 'empty_patch',
  });

function deps(runtime: Runtime): MutationDeps {
  return { db: runtime.db, clock: runtime.clock };
}

export function registerPlanRoutes(app: FastifyInstance, runtime: Runtime): void {
  app.get('/api/plans', async (request) =>
    runtime.gate.runRead(() => {
      const { page, page_size } = parseInput(PageInputSchema, request.query);
      return listPlans(runtime.db.db, page, page_size);
    }),
  );

  app.post('/api/plans', async (request, reply) => {
    const input = parseInput(PlanCreateSchema, request.body);
    const dto = await runtime.gate.runExclusive(() => createPlan(deps(runtime), input, 'api'));
    return reply.status(201).send(dto);
  });

  app.get('/api/plans/:planId', async (request) =>
    runtime.gate.runRead(() => {
      const { planId } = request.params as { planId: string };
      return toPlanDto(planInScope(runtime.db.db, planId));
    }),
  );

  app.patch('/api/plans/:planId', async (request) => {
    const { planId } = request.params as { planId: string };
    const patch = parseInput(PlanPatchSchema, request.body);
    return runtime.gate.runExclusive(() => updatePlan(deps(runtime), planId, patch, 'api'));
  });

  app.post('/api/plans/:planId/clone', async (request, reply) => {
    const { planId } = request.params as { planId: string };
    const result = await runtime.gate.runExclusive(() => cloneYear(deps(runtime), planId, 'api'));
    return reply.status(201).send(result);
  });
}
