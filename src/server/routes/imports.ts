import { rmSync } from 'node:fs';
import type { FastifyInstance } from 'fastify';
import { ImportMappingInputSchema, PageInputSchema } from '../../shared/schemas';
import { planInScope } from '../db/scoping';
import { applyImport } from '../imports/apply';
import { parseCsv } from '../imports/parse-csv';
import { parseXlsx } from '../imports/parse-xlsx';
import { computePreview, getImportPreview, loadImportRun, readImportBuffer } from '../imports/preview';
import { importFilePath, storeUpload } from '../imports/upload';
import { AppError, parseInput } from '../http/errors';
import type { Runtime } from '../runtime';

export function registerImportRoutes(app: FastifyInstance, runtime: Runtime): void {
  app.post('/api/plans/:planId/imports', async (request, reply) => {
    const { planId } = request.params as { planId: string };
    planInScope(runtime.db.db, planId);
    const file = await request.file();
    if (!file) throw new AppError(422, 'file_required', 'A file is required');
    const buffer = await file.toBuffer();
    const response = await storeUpload(runtime, planId, file.filename, buffer);
    return reply.status(201).send(response);
  });

  app.put('/api/plans/:planId/imports/:importId/mapping', async (request) => {
    const { planId, importId } = request.params as { planId: string; importId: string };
    const mapping = parseInput(ImportMappingInputSchema, request.body);
    return runtime.gate.runExclusive(async () => {
      const plan = planInScope(runtime.db.db, planId);
      const run = loadImportRun(runtime.db.db, planId, importId);
      if (run.status === 'applied' || run.status === 'cancelled') {
        throw new AppError(409, 'import_consumed', 'Import already consumed');
      }
      if (run.engine_epoch !== runtime.engineEpoch) {
        throw new AppError(409, 'import_stale', 'Import belongs to a previous epoch');
      }
      if (Date.parse(run.expires_at) <= Date.parse(runtime.clock.nowUtc())) {
        throw new AppError(409, 'import_expired', 'Import expired');
      }

      const buffer = readImportBuffer(runtime, importId);
      const isXlsx = run.original_filename.toLowerCase().endsWith('.xlsx');
      let rows: string[][];
      if (isXlsx) {
        if (!mapping.sheet) throw new AppError(422, 'sheet_required', 'A sheet is required for XLSX');
        rows = (await parseXlsx(buffer, mapping.sheet)).rows;
      } else {
        rows = parseCsv(buffer.toString('utf8'), mapping.separator ?? ';');
      }

      computePreview(runtime, plan, importId, mapping, rows);
      return getImportPreview(runtime, planId, importId, 1, 50);
    });
  });

  app.get('/api/plans/:planId/imports/:importId/preview', async (request) =>
    runtime.gate.runRead(() => {
      const { planId, importId } = request.params as { planId: string; importId: string };
      planInScope(runtime.db.db, planId);
      const { page, page_size } = parseInput(PageInputSchema, request.query);
      return getImportPreview(runtime, planId, importId, page, page_size);
    }),
  );

  app.post('/api/plans/:planId/imports/:importId/apply', async (request) => {
    const { planId, importId } = request.params as { planId: string; importId: string };
    return runtime.gate.runExclusive(() => applyImport(runtime, planId, importId));
  });

  app.delete('/api/plans/:planId/imports/:importId', async (request, reply) => {
    const { planId, importId } = request.params as { planId: string; importId: string };
    return runtime.gate.runExclusive(() => {
      const run = loadImportRun(runtime.db.db, planId, importId);
      if (run.status === 'applied') {
        throw new AppError(409, 'import_consumed', 'Applied import cannot be cancelled');
      }
      rmSync(importFilePath(runtime.dataDir, importId), { force: true });
      runtime.db.db
        .prepare("UPDATE import_runs SET status = 'cancelled', updated_at = ? WHERE id = ?")
        .run(runtime.clock.nowUtc(), importId);
      return reply.status(204).send();
    });
  });
}
