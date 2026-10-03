import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  CivilDateSchema,
  ConformiteSchema,
  OccurrenceStateSchema,
  ReferentielSchema,
  StatusInputSchema,
} from '../../shared/schemas';
import type { MutationDeps } from '../db/database';
import { planInScope } from '../db/scoping';
import { listOccurrences } from '../domain/queries';
import { setOccurrenceStatus } from '../domain/realizations';
import { parseInput } from '../http/errors';
import type { Runtime } from '../runtime';

const BooleanQuery = z.enum(['true', 'false']).transform((value) => value === 'true');
const normalized = (max: number) =>
  z
    .string()
    .transform((value) => value.normalize('NFC').trim())
    .pipe(z.string().max(max));

const OccurrenceQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    page_size: z.coerce.number().int().min(1).max(100).default(50),
    referentiel: ReferentielSchema.optional(),
    domain: normalized(80).optional(),
    owner_name: normalized(120).optional(),
    automated: BooleanQuery.optional(),
    fait: z.enum(['yes', 'no', 'unset']).optional(),
    conformite: ConformiteSchema.optional(),
    state: OccurrenceStateSchema.optional(),
    date_from: CivilDateSchema.optional(),
    date_to: CivilDateSchema.optional(),
    search: normalized(200).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.date_from && value.date_to && value.date_from > value.date_to) {
      ctx.addIssue({ code: 'custom', message: 'date_range_inverted', path: ['date_to'] });
    }
  });

function deps(runtime: Runtime): MutationDeps {
  return { db: runtime.db, clock: runtime.clock };
}

export function registerOccurrenceRoutes(app: FastifyInstance, runtime: Runtime): void {
  app.get('/api/plans/:planId/occurrences', async (request) =>
    runtime.gate.runRead(() => {
      const { planId } = request.params as { planId: string };
      planInScope(runtime.db.db, planId);
      const query = parseInput(OccurrenceQuerySchema, request.query);
      return listOccurrences(
        runtime.db.db,
        planId,
        {
          referentiel: query.referentiel,
          domain: query.domain,
          owner_name: query.owner_name,
          automated: query.automated,
          fait: query.fait,
          conformite: query.conformite,
          state: query.state,
          date_from: query.date_from,
          date_to: query.date_to,
          search: query.search,
        },
        query.page,
        query.page_size,
      );
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
