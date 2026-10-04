import type { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
import {
  ConformiteSchema,
  ControlDtoSchema,
  ControlListFilterSchema,
  type ControlDto,
  FilterInputSchema,
  type OccurrenceDto,
  OccurrenceStateSchema,
  PlanDtoSchema,
} from '../shared/schemas';
import type { BackendClient } from './backend-client';
import { McpBackendError } from './backend-client';
import type { AdapterLimiter } from './rate-limit';
import { projectMcpOutput } from './sanitize';

const MAX_RESULT_BYTES = 512 * 1024;

const RateSchema = z.object({
  numerator: z.number(),
  denominator: z.number(),
  value: z.number().nullable(),
});

const ControlSummarySchema = z.object({
  id: z.string(),
  code: z.string(),
  title: z.string(),
  referentials: z.array(z.string()),
  automated: z.boolean(),
  status: z.enum(['active', 'archived']),
});

const OccurrenceSummarySchema = z.object({
  id: z.string(),
  control_id: z.string(),
  occurrence_date: z.string(),
  state: OccurrenceStateSchema,
  code: z.string(),
  title: z.string(),
  referentials: z.array(z.string()),
  automated: z.boolean(),
  fait: z.boolean().nullable(),
  conformite: ConformiteSchema.nullable(),
});

const PageSchema = <T extends z.ZodType>(item: T) =>
  z.object({ items: z.array(item), page: z.number(), page_size: z.number(), total: z.number() });

const ArtifactSchema = z.object({
  export_id: z.string(),
  filename: z.string(),
  mime_type: z.string(),
  size_bytes: z.number(),
  expires_at: z.string(),
});

const ReferentialSummarySchema = z.object({
  referential: z.object({ slug: z.string(), label: z.string() }),
  counts: z.record(z.string(), z.number()),
  realization_rate: RateSchema,
  conformity_rate: RateSchema,
});

const SummarySchema = z.object({
  counts: z.record(z.string(), z.number()),
  realization_rate: RateSchema,
  conformity_rate: RateSchema,
  automation_rate: RateSchema,
  by_referentiel: z.array(ReferentialSummarySchema),
});

const PaginationInput = { page: z.number().int().min(1).optional(), page_size: z.number().int().min(1).max(100).optional() };

const ProposalSchema = z.object({
  id: z.string(),
  tool: z.string(),
  plan_id: z.string(),
  target_id: z.string().nullable(),
  state: z.string(),
  expires_at: z.string(),
  diff: z.object({ before: z.unknown(), after: z.unknown() }),
  result: z.unknown().nullable(),
});

const WriteInput = z
  .object({
    plan_id: z.string().uuid().optional(),
    control_id: z.string().uuid().optional(),
    occurrence_id: z.string().uuid().optional(),
    input: z.unknown().optional(),
    proposal_id: z.string().uuid().optional(),
  })
  .strict();

function controlSummary(control: ControlDto) {
  return {
    id: control.id,
    code: control.code,
    title: control.title,
    referentials: control.referentials,
    automated: control.automated,
    status: control.status,
  };
}

function occurrenceSummary(occurrence: OccurrenceDto) {
  return {
    id: occurrence.id,
    control_id: occurrence.control_id,
    occurrence_date: occurrence.occurrence_date,
    state: occurrence.state,
    code: occurrence.control.code,
    title: occurrence.control.title,
    referentials: occurrence.control.referentials,
    automated: occurrence.control.automated,
    fait: occurrence.realization?.fait ?? null,
    conformite: occurrence.realization?.conformite ?? null,
  };
}

function envelope(data: unknown, sanitizedFields: string[]) {
  const body = {
    status: 'ok',
    data_origin: 'centurion_data',
    trust: 'untrusted_data',
    data,
    ...(sanitizedFields.length > 0 ? { sanitized_fields: sanitizedFields } : {}),
  };
  const text = JSON.stringify(body);
  if (Buffer.byteLength(text, 'utf8') > MAX_RESULT_BYTES) {
    throw new Error('result_too_large');
  }
  return { content: [{ type: 'text' as const, text }] };
}

function errorResult(error: unknown) {
  const code =
    error instanceof McpBackendError
      ? error.code
      : error instanceof Error
        ? error.message
        : 'error';
  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify({ status: 'error', error: { code, message: 'Request failed' } }),
      },
    ],
    isError: true,
  };
}

type Handler = () => Promise<ReturnType<typeof envelope>>;

async function guard(handler: Handler) {
  try {
    return await handler();
  } catch (error) {
    return errorResult(error);
  }
}

export function registerReadTools(
  server: McpServer,
  client: BackendClient,
  limiter: AdapterLimiter,
): void {
  server.registerTool(
    'list_plans',
    {
      description: 'List the annual plans, most recent first.',
      inputSchema: z.object(PaginationInput).strict(),
    },
    async (args) =>
      guard(async () => {
        limiter.check(false);
        const raw = await client.dispatch('list_plans', args);
        const { data, sanitized_fields } = projectMcpOutput(raw, PageSchema(PlanDtoSchema));
        return envelope(data, sanitized_fields);
      }),
  );

  server.registerTool(
    'get_plan',
    {
      description: 'Get one plan by id.',
      inputSchema: z.object({ plan_id: z.string().uuid() }).strict(),
    },
    async (args) =>
      guard(async () => {
        limiter.check(false);
        const raw = await client.dispatch('get_plan', args);
        const { data, sanitized_fields } = projectMcpOutput(raw, PlanDtoSchema);
        return envelope(data, sanitized_fields);
      }),
  );

  server.registerTool(
    'list_controls',
    {
      description: 'List controls of a plan as bounded summaries.',
      inputSchema: z
        .object({ plan_id: z.string().uuid(), filters: ControlListFilterSchema.optional(), ...PaginationInput })
        .strict(),
    },
    async (args) =>
      guard(async () => {
        limiter.check(false);
        const raw = (await client.dispatch('list_controls', args)) as {
          items: ControlDto[];
          page: number;
          page_size: number;
          total: number;
        };
        const transformed = { ...raw, items: raw.items.map(controlSummary) };
        const { data, sanitized_fields } = projectMcpOutput(
          transformed,
          PageSchema(ControlSummarySchema),
        );
        return envelope(data, sanitized_fields);
      }),
  );

  server.registerTool(
    'get_control',
    {
      description: 'Get the full definition of one control.',
      inputSchema: z.object({ plan_id: z.string().uuid(), control_id: z.string().uuid() }).strict(),
    },
    async (args) =>
      guard(async () => {
        limiter.check(false);
        const raw = await client.dispatch('get_control', args);
        const { data, sanitized_fields } = projectMcpOutput(raw, ControlDtoSchema);
        return envelope(data, sanitized_fields);
      }),
  );

  server.registerTool(
    'list_occurrences',
    {
      description: 'List occurrences of a plan as bounded summaries.',
      inputSchema: z
        .object({ plan_id: z.string().uuid(), filters: FilterInputSchema.optional(), ...PaginationInput })
        .strict(),
    },
    async (args) =>
      guard(async () => {
        limiter.check(false);
        const raw = (await client.dispatch('list_occurrences', args)) as {
          items: OccurrenceDto[];
          page: number;
          page_size: number;
          total: number;
        };
        const transformed = { ...raw, items: raw.items.map(occurrenceSummary) };
        const { data, sanitized_fields } = projectMcpOutput(
          transformed,
          PageSchema(OccurrenceSummarySchema),
        );
        return envelope(data, sanitized_fields);
      }),
  );

  server.registerTool(
    'get_summary',
    {
      description: 'Get aggregate counts and rates for a plan.',
      inputSchema: z.object({ plan_id: z.string().uuid(), filters: FilterInputSchema.optional() }).strict(),
    },
    async (args) =>
      guard(async () => {
        limiter.check(false);
        const raw = await client.dispatch('get_summary', args);
        const { data, sanitized_fields } = projectMcpOutput(raw, SummarySchema);
        return envelope(data, sanitized_fields);
      }),
  );

  server.registerTool(
    'export_controls_csv',
    {
      description:
        'Generate a bounded CSV artifact of filtered occurrences and return its metadata. This writes a file under the instance data directory.',
      inputSchema: z.object({ plan_id: z.string().uuid(), filters: FilterInputSchema.optional() }).strict(),
      annotations: { readOnlyHint: false },
    },
    async (args) =>
      guard(async () => {
        limiter.check(true);
        const raw = await client.dispatch('export_controls_csv', args);
        const { data, sanitized_fields } = projectMcpOutput(raw, ArtifactSchema);
        return envelope(data, sanitized_fields);
      }),
  );

  server.registerTool(
    'generate_report_pdf',
    {
      description:
        'Generate a bounded PDF report artifact and return its metadata. This writes a file under the instance data directory.',
      inputSchema: z.object({ plan_id: z.string().uuid(), filters: FilterInputSchema.optional() }).strict(),
      annotations: { readOnlyHint: false },
    },
    async (args) =>
      guard(async () => {
        limiter.check(true);
        const raw = await client.dispatch('generate_report_pdf', args);
        const { data, sanitized_fields } = projectMcpOutput(raw, ArtifactSchema);
        return envelope(data, sanitized_fields);
      }),
  );
}

function proposalEnvelope(raw: unknown) {
  const record = raw as { status?: string; data_origin?: string; trust?: string; data: unknown };
  const { data, sanitized_fields } = projectMcpOutput(record.data, ProposalSchema);
  const body = {
    status: record.status ?? 'ok',
    data_origin: 'centurion_data',
    trust: 'untrusted_data',
    data,
    ...(sanitized_fields.length > 0 ? { sanitized_fields } : {}),
  };
  const text = JSON.stringify(body);
  if (Buffer.byteLength(text, 'utf8') > MAX_RESULT_BYTES) throw new Error('result_too_large');
  return { content: [{ type: 'text' as const, text }] };
}

/**
 * Write tools are exposed only when the backend flag and the adapter flag are
 * both set. Their first call creates a proposal; it never mutates business data.
 */
export function registerWriteTools(
  server: McpServer,
  client: BackendClient,
  limiter: AdapterLimiter,
): void {
  const write = (tool: string, description: string) => {
    server.registerTool(
      tool,
      {
        description,
        inputSchema: WriteInput,
        annotations: { readOnlyHint: false },
      },
      async (args) =>
        guard(async () => {
          limiter.check(false);
          const raw = await client.dispatch(tool, args);
          return proposalEnvelope(raw);
        }),
    );
  };

  write(
    'create_control',
    'Propose creating a control. Returns a proposal that must be approved in the CENTURION UI before any data changes. Pass { proposal_id } to consult a proposal of this tool.',
  );
  write(
    'update_control_metadata',
    'Propose updating a control definition (code, planning and status are refused). Returns a proposal approved in the CENTURION UI. Pass { proposal_id } to consult it.',
  );
  write(
    'set_occurrence',
    'Propose recording an occurrence outcome. Returns a proposal approved in the CENTURION UI. Pass { proposal_id } to consult it.',
  );
}
