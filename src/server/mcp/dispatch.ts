import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { runWithPrivateContext } from '../context';
import { buildReport } from '../domain/report';
import { AppError } from '../http/errors';
import { reserveArtifact } from '../reports/artifacts';
import { buildCsv } from '../reports/csv';
import { PDF_MAX_ROWS, buildReportPdf } from '../reports/report-pdf';
import type { Runtime } from '../runtime';
import { type McpToolName, resolveTool } from './policy';

async function generateArtifact(
  runtime: Runtime,
  call: Extract<ReturnType<typeof resolveTool>, { kind: 'artifact' }>,
): Promise<unknown> {
  if (call.artifact === 'csv') {
    const csv = runtime.gate.runRead(() => buildCsv(runtime.db.db, call.planId, call.filter));
    return reserveArtifact(
      runtime,
      `controls-${call.planId}.csv`,
      'text/csv',
      Buffer.from(csv, 'utf8'),
      '.csv',
    );
  }
  const report = runtime.gate.runRead(() =>
    buildReport(runtime.db.db, runtime.clock, call.planId, call.filter, 1, PDF_MAX_ROWS + 1),
  );
  const pdf = await buildReportPdf(report);
  return reserveArtifact(runtime, `report-${call.planId}.pdf`, 'application/pdf', pdf, '.pdf');
}

/**
 * Executes an allowlisted MCP tool against the same `/api` routes through
 * `app.inject`, carrying an unforgeable private context (source = mcp). The
 * adapter never touches SQLite.
 */
export async function dispatchMcp(
  app: FastifyInstance,
  runtime: Runtime,
  tool: McpToolName,
  args: unknown,
): Promise<unknown> {
  const call = resolveTool(tool, args, runtime);
  const kind = call.kind === 'artifact' ? 'export' : call.kind === 'proposal' ? 'write' : 'call';
  runtime.mcpLimiter.check(kind, runtime.clock.monotonicMs());
  let serverError = false;

  try {
    if (call.kind === 'artifact') {
      return await generateArtifact(runtime, call);
    }
    if (call.kind === 'proposal') {
      throw new AppError(501, 'not_implemented', 'Write tool not implemented');
    }
    const response = await runWithPrivateContext({ source: 'mcp', operationId: randomUUID() }, () =>
      app.inject({
        method: call.method,
        url: call.url,
        headers: { host: `${runtime.config.host}:${runtime.config.port}` },
      }),
    );
    if (response.statusCode >= 500) serverError = true;
    if (response.statusCode >= 400) {
      const body = response.json() as { error?: { code?: string; message?: string } };
      throw new AppError(
        response.statusCode,
        body.error?.code ?? 'backend_error',
        body.error?.message ?? 'Backend error',
      );
    }
    return response.json();
  } catch (error) {
    if (error instanceof AppError && error.statusCode >= 500) serverError = true;
    throw error;
  } finally {
    runtime.mcpLimiter.release(serverError, runtime.clock.monotonicMs());
  }
}
