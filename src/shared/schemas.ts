import { z } from 'zod';

/**
 * Shared strict contracts. The server is the only authority for business rules;
 * UI and MCP consume these schemas and never re-implement them.
 */

// ---------------------------------------------------------------------------
// Civil dates (no `new Date('YYYY-MM-DD')`; arithmetic only)
// ---------------------------------------------------------------------------

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const;

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function daysInMonth(year: number, month: number): number {
  if (month === 2 && isLeapYear(year)) return 29;
  return DAYS_IN_MONTH[month - 1] ?? 0;
}

export function isRealCivilDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > daysInMonth(year, month)) return false;
  return true;
}

export const CivilDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, { message: 'invalid_date_format' })
  .refine(isRealCivilDate, { message: 'nonexistent_date' });

export type CivilDate = z.infer<typeof CivilDateSchema>;

// ---------------------------------------------------------------------------
// Text normalization and control-character policy
// ---------------------------------------------------------------------------

export function codePointLength(value: string): number {
  return [...value].length;
}

/**
 * Normalizes CRLF / lone CR to LF. Returns null when a forbidden control
 * character is present. TAB and LF are allowed only when `allowNewlines`.
 */
export function normalizeControls(value: string, allowNewlines: boolean): string | null {
  const normalized = value.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  for (const char of normalized) {
    const code = char.codePointAt(0) ?? 0;
    const isTab = code === 0x09;
    const isLf = code === 0x0a;
    if (isLf) {
      if (!allowNewlines) return null;
      continue;
    }
    if (isTab) {
      if (!allowNewlines) return null;
      continue;
    }
    const isC0 = code <= 0x1f;
    const isDel = code === 0x7f;
    const isC1 = code >= 0x80 && code <= 0x9f;
    if (isC0 || isDel || isC1) return null;
  }
  return normalized;
}

type TextOptions = {
  min: number;
  max: number;
  allowNewlines?: boolean;
};

function textSchema(options: TextOptions) {
  const { min, max, allowNewlines = false } = options;
  return z
    .string()
    .transform((value) => value.normalize('NFC').trim())
    .superRefine((value, ctx) => {
      const normalized = normalizeControls(value, allowNewlines);
      if (normalized === null) {
        ctx.addIssue({ code: 'custom', message: 'forbidden_control_characters' });
        return;
      }
      const length = codePointLength(normalized);
      if (length < min || length > max) {
        ctx.addIssue({ code: 'custom', message: 'invalid_length' });
      }
    })
    .transform((value) => normalizeControls(value, allowNewlines) ?? value);
}

/** 1..max single-line text, no control characters. */
export const requiredText = (max: number) => textSchema({ min: 1, max });

/** 0..max single-line text. */
export const optionalText = (max: number) => textSchema({ min: 0, max });

/** 1..max multiline text (LF and TAB allowed, normalized to LF). */
export const requiredMultiline = (max: number) => textSchema({ min: 1, max, allowNewlines: true });

/** 0..max multiline text (LF and TAB allowed, normalized to LF). */
export const optionalMultiline = (max: number) => textSchema({ min: 0, max, allowNewlines: true });

export const CodeSchema = z
  .string()
  .transform((value) => value.normalize('NFC').trim().toUpperCase())
  .refine((value) => codePointLength(value) >= 1 && codePointLength(value) <= 24, {
    message: 'invalid_length',
  })
  .refine((value) => /^[A-Z0-9][A-Z0-9_-]*$/.test(value), { message: 'invalid_code' });

// ---------------------------------------------------------------------------
// Closed enums
// ---------------------------------------------------------------------------

/** A dynamic referential identifier: normalized lowercase slug. */
export const ReferentialSlugSchema = z
  .string()
  .regex(/^[a-z0-9][a-z0-9_-]*$/, { message: 'invalid_referential_slug' })
  .max(64);
export type ReferentialSlug = z.infer<typeof ReferentialSlugSchema>;

export const ReferentialDtoSchema = z.object({
  id: z.string(),
  slug: z.string(),
  label: z.string(),
});
export type ReferentialDto = z.infer<typeof ReferentialDtoSchema>;

export const ConformiteSchema = z.enum([
  'conforme',
  'partiellement_conforme',
  'non_conforme',
  'non_applicable',
]);
export type Conformite = z.infer<typeof ConformiteSchema>;

export const OccurrenceStateSchema = z.enum(['open', 'completed', 'superseded']);
export type OccurrenceState = z.infer<typeof OccurrenceStateSchema>;

export const FrequencyKindSchema = z.enum([
  'once',
  'monthly',
  'quarterly',
  'semiannual',
  'annual',
  'explicit',
]);
export type FrequencyKind = z.infer<typeof FrequencyKindSchema>;

export const ControlStatusSchema = z.enum(['active', 'archived']);
export type ControlStatus = z.infer<typeof ControlStatusSchema>;

// ---------------------------------------------------------------------------
// GitHub automation URL
// ---------------------------------------------------------------------------

export function isAllowedGithubUrl(value: string): boolean {
  // Reject explicit port, userinfo, lookalike hosts and trailing garbage before parsing.
  if (!/^https:\/\/github\.com(\/|$)/.test(value)) return false;

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:') return false;
  if (url.hostname !== 'github.com') return false;
  if (url.port !== '') return false;
  if (url.username !== '' || url.password !== '') return false;
  if (url.hash !== '') return false;
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0;
    if (code <= 0x1f || code === 0x7f) return false;
  }
  const segments = url.pathname.split('/').filter((segment) => segment.length > 0);
  return segments.length >= 2;
}

export const GithubUrlSchema = z
  .string()
  .transform((value) => value.normalize('NFC').trim())
  .refine((value) => codePointLength(value) >= 1 && codePointLength(value) <= 500, {
    message: 'invalid_length',
  })
  .refine(isAllowedGithubUrl, { message: 'invalid_github_url' });

// ---------------------------------------------------------------------------
// Schedule
// ---------------------------------------------------------------------------

const OnceScheduleSchema = z
  .object({ kind: z.literal('once'), date: CivilDateSchema })
  .strict();

const RecurringScheduleSchema = z
  .object({
    kind: z.enum(['monthly', 'quarterly', 'semiannual', 'annual']),
    anchorDate: CivilDateSchema,
  })
  .strict();

const ExplicitScheduleSchema = z
  .object({ kind: z.literal('explicit'), dates: z.array(CivilDateSchema).min(1).max(366) })
  .strict();

export const ScheduleSchema = z.discriminatedUnion('kind', [
  OnceScheduleSchema,
  RecurringScheduleSchema,
  ExplicitScheduleSchema,
]);
export type Schedule = z.infer<typeof ScheduleSchema>;

// ---------------------------------------------------------------------------
// Control definition and inputs
// ---------------------------------------------------------------------------

const ControlMetadataBase = z
  .object({
    title: requiredText(160),
    description: requiredMultiline(4000),
    referentials: z.array(ReferentialSlugSchema).min(1).max(20),
    reference: requiredText(160),
    domain: requiredText(80),
    owner_name: optionalText(120),
    method: optionalMultiline(2000),
    expected_evidence: optionalMultiline(2000),
    automated: z.boolean(),
    automation_github_url: GithubUrlSchema.nullable(),
  })
  .strict();

type AutomatedUrlValue = { automated: boolean; automation_github_url: string | null };

function automatedUrlRule(
  value: AutomatedUrlValue,
  ctx: z.RefinementCtx,
): void {
  if (!value.automated && value.automation_github_url !== null) {
    ctx.addIssue({
      code: 'custom',
      message: 'url_forbidden_when_not_automated',
      path: ['automation_github_url'],
    });
  }
}

export const ControlMetadataSchema = ControlMetadataBase.superRefine(automatedUrlRule);
export type ControlMetadata = z.infer<typeof ControlMetadataBase>;

export const CreateControlInputSchema = ControlMetadataBase.extend({
  code: CodeSchema,
  schedule: ScheduleSchema,
  active_from: CivilDateSchema.nullable(),
  active_to: CivilDateSchema.nullable(),
}).superRefine((value, ctx) => {
  automatedUrlRule(value, ctx);
  if (value.active_from && value.active_to && value.active_from > value.active_to) {
    ctx.addIssue({ code: 'custom', message: 'active_window_inverted', path: ['active_to'] });
  }
});

export type CreateControlInput = z.infer<typeof CreateControlInputSchema>;

export const UpdateMetadataInputSchema = ControlMetadataBase.partial();
export type UpdateMetadataInput = z.infer<typeof UpdateMetadataInputSchema>;

export const StatusInputSchema = z
  .object({
    fait: z.boolean(),
    conformite: ConformiteSchema,
    completed_date: CivilDateSchema,
    comment: optionalMultiline(4000),
    evidence_ref: optionalText(1000).nullable(),
  })
  .strict()
  .transform((value) => {
    if (!value.fait) {
      return { ...value, conformite: 'non_applicable' as const, evidence_ref: null };
    }
    return value;
  });

export type StatusInput = z.infer<typeof StatusInputSchema>;

export const FilterInputSchema = z
  .object({
    referentiel: ReferentialSlugSchema.optional(),
    domain: requiredText(80).optional(),
    owner_name: optionalText(120).optional(),
    automated: z.boolean().optional(),
    fait: z.enum(['yes', 'no', 'unset']).optional(),
    conformite: ConformiteSchema.optional(),
    state: OccurrenceStateSchema.optional(),
    date_from: CivilDateSchema.optional(),
    date_to: CivilDateSchema.optional(),
    search: optionalText(200).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.date_from && value.date_to && value.date_from > value.date_to) {
      ctx.addIssue({ code: 'custom', message: 'date_range_inverted', path: ['date_to'] });
    }
  });

export type FilterInput = z.infer<typeof FilterInputSchema>;

export const ControlListFilterSchema = z
  .object({
    referentiel: ReferentialSlugSchema.optional(),
    domain: requiredText(80).optional(),
    owner_name: optionalText(120).optional(),
    automated: z.boolean().optional(),
    search: optionalText(200).optional(),
    status: z.enum(['active', 'archived', 'all']).optional(),
  })
  .strict();

export type ControlListFilter = z.infer<typeof ControlListFilterSchema>;

// ---------------------------------------------------------------------------
// Pagination and errors
// ---------------------------------------------------------------------------

export const PageInputSchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    page_size: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict();

export type PageInput = z.infer<typeof PageInputSchema>;

export type Page<T> = { items: T[]; page: number; page_size: number; total: number };

export const ErrorBodySchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    fields: z.record(z.string(), z.array(z.string())),
  }),
});

export type ErrorBody = z.infer<typeof ErrorBodySchema>;

// ---------------------------------------------------------------------------
// Output DTOs
// ---------------------------------------------------------------------------

export const PlanDtoSchema = z.object({
  id: z.string(),
  year: z.number().int(),
  name: z.string(),
  perimeter: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type PlanDto = z.infer<typeof PlanDtoSchema>;

export const ControlDtoSchema = z.object({
  id: z.string(),
  plan_id: z.string(),
  code: z.string(),
  title: z.string(),
  description: z.string(),
  referentials: z.array(z.string()),
  reference: z.string(),
  domain: z.string(),
  owner_name: z.string(),
  method: z.string(),
  expected_evidence: z.string(),
  automated: z.boolean(),
  automation_github_url: z.string().nullable(),
  schedule: ScheduleSchema,
  active_from: CivilDateSchema.nullable(),
  active_to: CivilDateSchema.nullable(),
  status: ControlStatusSchema,
  created_at: z.string(),
  updated_at: z.string(),
});
export type ControlDto = z.infer<typeof ControlDtoSchema>;

export const RealizationDtoSchema = z.object({
  id: z.string(),
  occurrence_id: z.string(),
  completed_date: CivilDateSchema,
  fait: z.boolean(),
  conformite: ConformiteSchema,
  comment: z.string(),
  evidence_ref: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type RealizationDto = z.infer<typeof RealizationDtoSchema>;

export const BackupDtoSchema = z.object({
  id: z.string(),
  reason: z.enum(['manual', 'pre_import', 'pre_schedule_change', 'pre_archive', 'pre_restore']),
  created_at: z.string(),
  sha256: z.string(),
  size_bytes: z.number().int(),
  schema_version: z.number().int(),
});
export type BackupDto = z.infer<typeof BackupDtoSchema>;

export const AuditDtoSchema = z.object({
  id: z.string(),
  entity_type: z.string(),
  entity_id: z.string(),
  action: z.string(),
  at_utc: z.string(),
  source: z.enum(['api', 'mcp', 'import', 'system']),
  before: z.unknown().nullable(),
  after: z.unknown().nullable(),
});
export type AuditDto = z.infer<typeof AuditDtoSchema>;

export const OccurrenceDtoSchema = z.object({
  id: z.string(),
  control_id: z.string(),
  occurrence_date: CivilDateSchema,
  state: OccurrenceStateSchema,
  created_at: z.string(),
  updated_at: z.string(),
  control: ControlDtoSchema,
  realization: RealizationDtoSchema.nullable(),
});
export type OccurrenceDto = z.infer<typeof OccurrenceDtoSchema>;

// ---------------------------------------------------------------------------
// Import mapping
// ---------------------------------------------------------------------------

export const IMPORT_COLUMNS = [
  'code',
  'title',
  'description',
  'referentiel',
  'reference',
  'domain',
  'owner_name',
  'method',
  'expected_evidence',
  'automated',
  'automation_github_url',
  'frequency_kind',
  'anchor_date',
  'explicit_dates',
  'active_from',
  'active_to',
] as const;

export type ImportColumn = (typeof IMPORT_COLUMNS)[number];

export const ImportMappingInputSchema = z
  .object({
    sheet: optionalText(120).optional(),
    separator: z.enum([',', ';']).optional(),
    columns: z.partialRecord(z.enum(IMPORT_COLUMNS), z.number().int().min(0).max(99)),
    effective_date: CivilDateSchema,
  })
  .strict();

export type ImportMappingInput = z.infer<typeof ImportMappingInputSchema>;
