import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { PageInputSchema } from '../../shared/schemas';
import { createBackup } from '../backups/backup';
import { listManifests, toBackupDto } from '../backups/catalog';
import { createRestorePreview, restoreBackup } from '../backups/restore';
import { parseInput } from '../http/errors';
import type { Runtime } from '../runtime';

export function registerBackupRoutes(app: FastifyInstance, runtime: Runtime): void {
  app.get('/api/backups', async (request) =>
    runtime.gate.runRead(() => {
      const { page, page_size } = parseInput(PageInputSchema, request.query);
      const all = listManifests(runtime.dataDir).map(toBackupDto);
      const start = (page - 1) * page_size;
      return {
        items: all.slice(start, start + page_size),
        page,
        page_size,
        total: all.length,
      };
    }),
  );

  app.post('/api/backups', async (_request, reply) => {
    const dto = await runtime.gate.runExclusive(() => createBackup(runtime, 'manual'));
    return reply.status(201).send(dto);
  });

  app.post('/api/backups/:backupId/restore-preview', async (request, reply) => {
    const { backupId } = request.params as { backupId: string };
    const preview = await runtime.gate.runExclusive(() => createRestorePreview(runtime, backupId));
    return reply.status(201).send(preview);
  });

  app.post('/api/backups/:backupId/restore', async (request) => {
    const body = parseInput(
      z.object({ preview_id: z.string().uuid() }).strict(),
      request.body,
    );
    return restoreBackup(runtime, body.preview_id);
  });
}
