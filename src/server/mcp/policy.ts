import { z } from 'zod';
import {
  ControlListFilterSchema,
  FilterInputSchema,
  ReferentialSlugSchema,
  type FilterInput,
} from '../../shared/schemas';
import { AppError, parseInput } from '../http/errors';


export const READ_ONLY_TOOLS = [
  'list_plans',
  'get_plan',
  'list_controls',
  'get_control',
  'list_occurrences',
  'get_summary',
  'get_trends',
  'list_clauses',
] as const;

export const EXPORT_TOOLS = ['export_controls_csv', 'generate_report_pdf'] as const;

export const READ_TOOLS = [...READ_ONLY_TOOLS, ...EXPORT_TOOLS] as const;

export const WRITE_TOOLS = ['create_control', 'update_control_metadata', 'set_occurrence'] as const;

export type ReadTool = (typeof READ_TOOLS)[number];
export type WriteTool = (typeof WRITE_TOOLS)[number];
export type McpToolName = ReadTool | WriteTool;
export const ALL_TOOLS: McpToolName[] = [...READ_TOOLS, ...WRITE_TOOLS];

const PlanId = z.string().uuid();
const Pagination = {
  page: z.number().int().min(1).default(1),
  page_size: z.number().int().min(1).max(100).default(50),
};

const ListPlansArgs = z.object({ page: Pagination.page.optional(), page_size: Pagination.page_size.optional() }).strict();
const GetPlanArgs = z.object({ plan_id: PlanId }).strict();
const ListControlsArgs = z
  .object({
    plan_id: PlanId,
    filters: ControlListFilterSchema.optional(),
    page: Pagination.page.optional(),
    page_size: Pagination.page_size.optional(),
  })
  .strict();
const GetControlArgs = z.object({ plan_id: PlanId, control_id: z.string().uuid() }).strict();
const ListOccurrencesArgs = z
  .object({
    plan_id: PlanId,
    filters: FilterInputSchema.optional(),
    page: Pagination.page.optional(),
    page_size: Pagination.page_size.optional(),
  })
  .strict();
const SummaryArgs = z.object({ plan_id: PlanId, filters: FilterInputSchema.optional() }).strict();
const TrendsArgs = z.object({ filters: FilterInputSchema.optional() }).strict();
const ListClausesArgs = z.object({ referential: ReferentialSlugSchema.optional() }).strict();
const ExportArgs = z.object({ plan_id: PlanId, filters: FilterInputSchema.optional() }).strict();

export type ResolvedCall =
  | { kind: 'api'; method: 'GET'; url: string }
  | { kind: 'artifact'; artifact: 'csv' | 'pdf'; planId: string; filter: FilterInput }
  | { kind: 'proposal'; tool: WriteTool; planId: string; payload: unknown }
  | { kind: 'consult'; tool: WriteTool; proposalId: string };

function query(params: Record<string, unknown>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : '';
}

function filterQuery(filter: FilterInput | undefined, page: number, pageSize: number): string {
  return query({ ...(filter ?? {}), page, page_size: pageSize });
}

export function resolveTool(tool: string, args: unknown): ResolvedCall {
  if (!ALL_TOOLS.includes(tool as McpToolName)) {
    throw new AppError(422, 'unknown_tool', 'Unknown tool');
  }

  switch (tool as McpToolName) {
    case 'list_plans': {
      const parsed = parseInput(ListPlansArgs, args);
      return { kind: 'api', method: 'GET', url: `/api/plans${query({ page: parsed.page, page_size: parsed.page_size })}` };
    }
    case 'get_plan': {
      const parsed = parseInput(GetPlanArgs, args);
      return { kind: 'api', method: 'GET', url: `/api/plans/${parsed.plan_id}` };
    }
    case 'list_controls': {
      const parsed = parseInput(ListControlsArgs, args);
      return {
        kind: 'api',
        method: 'GET',
        url: `/api/plans/${parsed.plan_id}/controls${filterQuery(
          parsed.filters as FilterInput | undefined,
          parsed.page ?? 1,
          parsed.page_size ?? 50,
        )}`,
      };
    }
    case 'get_control': {
      const parsed = parseInput(GetControlArgs, args);
      return { kind: 'api', method: 'GET', url: `/api/plans/${parsed.plan_id}/controls/${parsed.control_id}` };
    }
    case 'list_occurrences': {
      const parsed = parseInput(ListOccurrencesArgs, args);
      return {
        kind: 'api',
        method: 'GET',
        url: `/api/plans/${parsed.plan_id}/occurrences${filterQuery(
          parsed.filters,
          parsed.page ?? 1,
          parsed.page_size ?? 50,
        )}`,
      };
    }
    case 'get_summary': {
      const parsed = parseInput(SummaryArgs, args);
      return {
        kind: 'api',
        method: 'GET',
        url: `/api/plans/${parsed.plan_id}/summary${query({ ...(parsed.filters ?? {}) })}`,
      };
    }
    case 'get_trends': {
      const parsed = parseInput(TrendsArgs, args);
      return { kind: 'api', method: 'GET', url: `/api/trends${query({ ...(parsed.filters ?? {}) })}` };
    }
    case 'list_clauses': {
      const parsed = parseInput(ListClausesArgs, args);
      return { kind: 'api', method: 'GET', url: `/api/clauses${query({ referential: parsed.referential })}` };
    }
    case 'export_controls_csv':
    case 'generate_report_pdf': {
      const parsed = parseInput(ExportArgs, args);
      return {
        kind: 'artifact',
        artifact: tool === 'export_controls_csv' ? 'csv' : 'pdf',
        planId: parsed.plan_id,
        filter: parsed.filters ?? {},
      };
    }
    default: {
      const record = (args ?? {}) as Record<string, unknown>;
      if (typeof record.proposal_id === 'string') {
        return { kind: 'consult', tool: tool as WriteTool, proposalId: record.proposal_id };
      }
      if (typeof record.plan_id !== 'string') {
        throw new AppError(422, 'validation_error', 'plan_id is required');
      }
      return { kind: 'proposal', tool: tool as WriteTool, planId: record.plan_id, payload: args };
    }
  }
}
