import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  CivilDateSchema,
  CodeSchema,
  CreateControlInputSchema,
  ReferentielSchema,
  ScheduleSchema,
  UpdateMetadataInputSchema,
} from '../../shared/schemas';
import {
  applySchedulePreview,
  createSchedulePreview,
} from '../domain/schedule-preview';
import type { MutationDeps } from '../db/database';
import { planInScope } from '../db/scoping';
import {
  createControl,
  duplicateControl,
  getControlDto,
  listControls,
  updateControlMetadata,
} from '../domain/controls';
import { parseInput } from '../http/errors';
import type { Runtime } from '../runtime';

const BooleanQuery = z.enum(['true', 'false']).transform((value) => value === 'true');
const normalizedQuery = (max: number) =>
  z
    .string()
    .transform((value) => value.normalize('NFC').trim())
    .pipe(z.string().max(max));

const ControlListQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    page_size: z.coerce.number().int().min(1).max(100).default(50),
    status: z.enum(['active', 'archived', 'all']).optional(),
    referentiel: ReferentielSchema.optional(),
    domain: normalizedQuery(80).optional(),
    owner_name: normalizedQuery(120).optional(),
    automated: BooleanQuery.optional(),
    search: normalizedQuery(200).optional(),
  })
  .strict();

const DuplicateSchema = z.object({ new_code: CodeSchema }).strict();

const ScheduleChangeSchema = z
  .object({
    schedule: ScheduleSchema,
    active_from: CivilDateSchema.nullable(),
    active_to: CivilDateSchema.nullable(),
    effective_date: CivilDateSchema,
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.active_from && value.active_to && value.active_from > value.active_to) {
      ctx.addIssue({ code: 'custom', message: 'active_window_inverted', path: ['active_to'] });
    }
  });

const ApplySchema = z.object({ preview_id: z.string().uuid() }).strict();
const UpdatePatchSchema = UpdateMetadataInputSchema.refine(
  (value) => Object.keys(value).length > 0,
  { message: 'empty_patch' },
);

function deps(runtime: Runtime): MutationDeps {
  return { db: runtime.db, clock: runtime.clock };
}

export function registerControlRoutes(app: FastifyInstance, runtime: Runtime): void {
  app.get('/api/plans/:planId/controls', async (request) =>
    runtime.gate.runRead(() => {
      const { planId } = request.params as { planId: string };
      planInScope(runtime.db.db, planId);
      const query = parseInput(ControlListQuerySchema, request.query);
      return listControls(
        runtime.db.db,
        planId,
        {
          status: query.status,
          referentiel: query.referentiel,
          domain: query.domain,
          owner_name: query.owner_name,
          automated: query.automated,
          search: query.search,
        },
        query.page,
        query.page_size,
      );
    }),
  );

  app.post('/api/plans/:planId/controls', async (request, reply) => {
    const { planId } = request.params as { planId: string };
    const input = parseInput(CreateControlInputSchema, request.body);
    const result = await runtime.gate.runExclusive(() =>
      createControl(deps(runtime), planId, input, 'api'),
    );
    return reply.status(201).send(result);
  });

  app.get('/api/plans/:planId/controls/:controlId', async (request) =>
    runtime.gate.runRead(() => {
      const { planId, controlId } = request.params as { planId: string; controlId: string };
      return getControlDto(runtime.db.db, planId, controlId);
    }),
  );

  app.patch('/api/plans/:planId/controls/:controlId', async (request) => {
    const { planId, controlId } = request.params as { planId: string; controlId: string };
    const patch = parseInput(UpdatePatchSchema, request.body);
    return runtime.gate.runExclusive(() =>
      updateControlMetadata(deps(runtime), planId, controlId, patch, 'api'),
    );
  });

  app.post('/api/plans/:planId/controls/:controlId/duplicate', async (request, reply) => {
    const { planId, controlId } = request.params as { planId: string; controlId: string };
    const { new_code } = parseInput(DuplicateSchema, request.body);
    const result = await runtime.gate.runExclusive(() =>
      duplicateControl(deps(runtime), planId, controlId, new_code, 'api'),
    );
    return reply.status(201).send(result);
  });

  app.post('/api/plans/:planId/controls/:controlId/schedule-preview', async (request, reply) => {
    const { planId, controlId } = request.params as { planId: string; controlId: string };
    const input = parseInput(ScheduleChangeSchema, request.body);
    const preview = await runtime.gate.runExclusive(() =>
      createSchedulePreview(runtime, planId, controlId, input, 'api'),
    );
    return reply.status(201).send(preview);
  });

  app.post('/api/plans/:planId/controls/:controlId/schedule-apply', async (request) => {
    const { planId, controlId } = request.params as { planId: string; controlId: string };
    const { preview_id } = parseInput(ApplySchema, request.body);
    return runtime.gate.runExclusive(() =>
      applySchedulePreview(runtime, planId, controlId, preview_id, 'api'),
    );
  });
}
