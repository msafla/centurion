import { z } from 'zod';
import {
  CivilDateSchema,
  ConformiteSchema,
  type FilterInput,
  OccurrenceStateSchema,
  ReferentielSchema,
} from '../../shared/schemas';

const BooleanQuery = z.enum(['true', 'false']).transform((value) => value === 'true');
const normalized = (max: number) =>
  z
    .string()
    .transform((value) => value.normalize('NFC').trim())
    .pipe(z.string().max(max));

export const OccurrenceQuerySchema = z
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

export type OccurrenceQuery = z.infer<typeof OccurrenceQuerySchema>;

export function toFilter(query: OccurrenceQuery): FilterInput {
  return {
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
  };
}
