import { createHash, randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  ControlMetadataSchema,
  CreateControlInputSchema,
  StatusInputSchema,
  UpdateMetadataInputSchema,
} from '../../shared/schemas';
import { MAX_PENDING_PROPOSALS, PREVIEW_TTL_MS } from '../../shared/limits';
import { runWithPrivateContext } from '../context';
import { planInScope } from '../db/scoping';
import { controlInPlan, occurrenceInPlan } from '../db/scoping';
import { metadataOf } from '../domain/controls';
import { toRealizationDto } from '../domain/realizations';
import { generateDates } from '../domain/schedule';
import { AppError, parseInput } from '../http/errors';
import type { Runtime } from '../runtime';

export type WriteTool = 'create_control' | 'update_control_metadata' | 'set_occurrence';

export type ProposalRow = {
  id: string;
  plan_id: string;
  tool: WriteTool;
  normalized_arguments_json: string;
  diff_json: string;
  base_plan_revision: number;
  arguments_hash: string;
  engine_epoch: string;
  state: 'pending' | 'applied' | 'rejected' | 'expired';
  expires_at: string;
  result_json: string | null;
  created_at: string;
  updated_at: string;
};

export type ProposalDto = {
  id: string;
  tool: WriteTool;
  plan_id: string;
  target_id: string | null;
  state: ProposalRow['state'];
  expires_at: string;
  diff: { before: unknown; after: unknown };
  result: unknown | null;
};

const CreateArgs = z
  .object({ plan_id: z.string().uuid(), input: CreateControlInputSchema })
  .strict();
const UpdateArgs = z
  .object({
    plan_id: z.string().uuid(),
    control_id: z.string().uuid(),
    input: UpdateMetadataInputSchema.refine((value) => Object.keys(value).length > 0, {
      message: 'empty_patch',
    }),
  })
  .strict();
const SetArgs = z
  .object({ plan_id: z.string().uuid(), occurrence_id: z.string().uuid(), input: StatusInputSchema })
  .strict();

function hash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function toDto(row: ProposalRow): ProposalDto {
  const diff = JSON.parse(row.diff_json) as {
    before: unknown;
    after: unknown;
    target_id?: string | null;
  };
  return {
    id: row.id,
    tool: row.tool,
    plan_id: row.plan_id,
    target_id: diff.target_id ?? null,
    state: row.state,
    expires_at: row.expires_at,
    diff: { before: diff.before, after: diff.after },
    result: row.result_json ? (JSON.parse(row.result_json) as unknown) : null,
  };
}

type Prepared = {
  payload: unknown;
  targetId: string | null;
  diff: { before: unknown; after: unknown };
};

function prepare(runtime: Runtime, tool: WriteTool, args: unknown): { planId: string; prepared: Prepared } {
  const db = runtime.db.db;
  if (tool === 'create_control') {
    const parsed = parseInput(CreateArgs, args);
    const plan = planInScope(db, parsed.plan_id);
    const dates = generateDates(plan.year, parsed.input.schedule, {
      active_from: parsed.input.active_from,
      active_to: parsed.input.active_to,
    });
    return {
      planId: parsed.plan_id,
      prepared: {
        payload: parsed.input,
        targetId: null,
        diff: {
          before: null,
          after: {
            definition: parsed.input,
            calendar: { count: dates.length, sample: dates.slice(0, 100), truncated: dates.length > 100 },
          },
        },
      },
    };
  }

  if (tool === 'update_control_metadata') {
    const parsed = parseInput(UpdateArgs, args);
    const control = controlInPlan(db, parsed.plan_id, parsed.control_id);
    if (control.status === 'archived') {
      throw new AppError(409, 'control_archived', 'Archived control cannot be edited');
    }
    const before = metadataOf(db, control);
    const merged = parseInput(ControlMetadataSchema, { ...before, ...parsed.input });
    return {
      planId: parsed.plan_id,
      prepared: {
        payload: merged,
        targetId: parsed.control_id,
        diff: { before, after: merged },
      },
    };
  }

  const parsed = parseInput(SetArgs, args);
  const occurrence = occurrenceInPlan(db, parsed.plan_id, parsed.occurrence_id);
  if (occurrence.state === 'superseded') {
    throw new AppError(409, 'occurrence_superseded', 'Superseded occurrence cannot be filled');
  }
  if (parsed.input.completed_date > runtime.clock.todayParis()) {
    throw new AppError(422, 'completed_date_in_future', 'Completed date is in the future');
  }
  const existing = db
    .prepare('SELECT * FROM realizations WHERE occurrence_id = ?')
    .get(parsed.occurrence_id) as
    | Parameters<typeof toRealizationDto>[0]
    | undefined;
  return {
    planId: parsed.plan_id,
    prepared: {
      payload: parsed.input,
      targetId: parsed.occurrence_id,
      diff: {
        before: existing ? toRealizationDto(existing) : null,
        after: parsed.input,
      },
    },
  };
}

export function createProposal(runtime: Runtime, tool: WriteTool, args: unknown): ProposalDto {
  const { planId, prepared } = prepare(runtime, tool, args);
  const plan = planInScope(runtime.db.db, planId);
  const argumentsHash = hash(prepared.payload);

  const duplicate = runtime.db.db
    .prepare(
      `SELECT * FROM mcp_proposals
        WHERE tool = ? AND plan_id = ? AND arguments_hash = ? AND base_plan_revision = ?
          AND engine_epoch = ? AND state = 'pending'`,
    )
    .get(tool, planId, argumentsHash, plan.data_revision, runtime.engineEpoch) as
    | ProposalRow
    | undefined;
  if (duplicate) return toDto(duplicate);

  const pending = (
    runtime.db.db
      .prepare("SELECT COUNT(*) AS n FROM mcp_proposals WHERE state = 'pending'")
      .get() as { n: number }
  ).n;
  if (pending >= MAX_PENDING_PROPOSALS) {
    throw new AppError(429, 'proposal_quota_exceeded', 'Too many pending proposals');
  }

  const id = randomUUID();
  const now = runtime.clock.nowUtc();
  const expiresAt = new Date(Date.parse(now) + PREVIEW_TTL_MS).toISOString();
  runtime.db.db
    .prepare(
      `INSERT INTO mcp_proposals
         (id, plan_id, tool, normalized_arguments_json, diff_json, base_plan_revision,
          arguments_hash, engine_epoch, state, expires_at, result_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, NULL, ?, ?)`,
    )
    .run(
      id,
      planId,
      tool,
      JSON.stringify(prepared.payload),
      JSON.stringify({ ...prepared.diff, target_id: prepared.targetId }),
      plan.data_revision,
      argumentsHash,
      runtime.engineEpoch,
      expiresAt,
      now,
      now,
    );
  return toDto(getProposalRow(runtime, id));
}

function getProposalRow(runtime: Runtime, id: string): ProposalRow {
  const row = runtime.db.db.prepare('SELECT * FROM mcp_proposals WHERE id = ?').get(id) as
    | ProposalRow
    | undefined;
  if (!row) throw new AppError(404, 'not_found', 'Proposal not found');
  return row;
}

export function getProposal(runtime: Runtime, id: string): ProposalDto {
  return toDto(getProposalRow(runtime, id));
}

export function listProposals(
  runtime: Runtime,
  page: number,
  pageSize: number,
): { items: ProposalDto[]; page: number; page_size: number; total: number } {
  const total = (
    runtime.db.db.prepare('SELECT COUNT(*) AS n FROM mcp_proposals').get() as { n: number }
  ).n;
  const rows = runtime.db.db
    .prepare('SELECT * FROM mcp_proposals ORDER BY created_at DESC, id LIMIT ? OFFSET ?')
    .all(pageSize, (page - 1) * pageSize) as ProposalRow[];
  return { items: rows.map(toDto), page, page_size: pageSize, total };
}

export function rejectProposal(runtime: Runtime, id: string): ProposalDto {
  const row = getProposalRow(runtime, id);
  if (row.state === 'pending') {
    runtime.db.db
      .prepare("UPDATE mcp_proposals SET state = 'rejected', updated_at = ? WHERE id = ?")
      .run(runtime.clock.nowUtc(), id);
  }
  return toDto(getProposalRow(runtime, id));
}

function targetRoute(row: ProposalRow, payload: Record<string, unknown>): { method: string; url: string; payload: unknown } {
  const diff = JSON.parse(row.diff_json) as { target_id?: string | null };
  const targetId = diff.target_id ?? '';
  if (row.tool === 'create_control') {
    return { method: 'POST', url: `/api/plans/${row.plan_id}/controls`, payload };
  }
  if (row.tool === 'update_control_metadata') {
    return {
      method: 'PATCH',
      url: `/api/plans/${row.plan_id}/controls/${targetId}`,
      payload,
    };
  }
  return {
    method: 'PUT',
    url: `/api/plans/${row.plan_id}/occurrences/${targetId}/status`,
    payload,
  };
}

/**
 * Applies an approved proposal by injecting the exact target business route
 * under the private context (source = mcp, proposal_id). The target route's
 * single synchronous transaction verifies the proposal, mutates, audits and
 * records the consumed result atomically. Replaying an applied proposal returns
 * its stored result without a second mutation.
 */
export async function approveProposal(
  runtime: Runtime,
  app: FastifyInstance,
  id: string,
): Promise<unknown> {
  return runtime.gate.runExclusive(async () => {
    const row = getProposalRow(runtime, id);
    if (row.state === 'applied') return row.result_json ? JSON.parse(row.result_json) : null;
    if (row.state !== 'pending') throw new AppError(409, 'proposal_not_pending', 'Proposal is not pending');
    if (row.engine_epoch !== runtime.engineEpoch) {
      throw new AppError(409, 'proposal_stale', 'Proposal belongs to a previous epoch');
    }
    if (Date.parse(row.expires_at) <= Date.parse(runtime.clock.nowUtc())) {
      throw new AppError(409, 'proposal_expired', 'Proposal expired');
    }
    const plan = planInScope(runtime.db.db, row.plan_id);
    if (row.base_plan_revision !== plan.data_revision) {
      throw new AppError(409, 'proposal_stale', 'Business data changed since proposal');
    }

    const payload = JSON.parse(row.normalized_arguments_json) as Record<string, unknown>;
    if (hash(payload) !== row.arguments_hash) {
      throw new AppError(409, 'proposal_tampered', 'Proposal arguments were altered');
    }

    const target = targetRoute(row, payload);
    const response = await runWithPrivateContext(
      { source: 'mcp', operationId: randomUUID(), proposalId: id },
      async () =>
        await app.inject({
          method: target.method as 'POST' | 'PATCH' | 'PUT',
          url: target.url,
          payload: target.payload as Record<string, unknown>,
          headers: { host: `${runtime.config.host}:${runtime.config.port}` },
        }),
    );
    if (response.statusCode >= 400) {
      const body = response.json() as { error?: { code?: string; message?: string } };
      throw new AppError(
        response.statusCode,
        body.error?.code ?? 'backend_error',
        body.error?.message ?? 'Approval failed',
      );
    }
    return response.json();
  });
}
