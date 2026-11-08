import { randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { occurrenceInPlan, planInScope } from '../db/scoping';
import { listEvidence, getEvidence, deleteEvidence, insertEvidence } from '../domain/evidence';
import type { Runtime } from '../runtime';

const ALLOWED_TYPES = new Set(['application/pdf', 'image/png', 'image/jpeg', 'text/plain']);
const MAX_BYTES = 5 * 1024 * 1024;

function evidenceDir(runtime: Runtime): string {
  return join(runtime.dataDir, 'evidence');
}

function safeName(name: string): string {
  const base = basename(name).replace(/[^\w.\-()+ ]/g, '_').slice(0, 160);
  return base || 'piece-jointe';
}

export function registerEvidenceRoutes(app: FastifyInstance, runtime: Runtime): void {
  app.get('/api/plans/:planId/occurrences/:occurrenceId/evidence', async (request) => {
    const { planId, occurrenceId } = request.params as { planId: string; occurrenceId: string };
    return runtime.gate.runRead(() => {
      planInScope(runtime.db.db, planId);
      occurrenceInPlan(runtime.db.db, planId, occurrenceId);
      return listEvidence(runtime.db.db, occurrenceId);
    });
  });

  app.post('/api/plans/:planId/occurrences/:occurrenceId/evidence', async (request, reply) => {
    const { planId, occurrenceId } = request.params as { planId: string; occurrenceId: string };
    occurrenceInPlan(runtime.db.db, planId, occurrenceId);

    const file = await request.file();
    if (!file) return reply.status(422).send({ error: 'missing_file' });
    if (!ALLOWED_TYPES.has(file.mimetype)) {
      await file.file.resume();
      return reply.status(415).send({ error: 'unsupported_media_type' });
    }

    const chunks: Buffer[] = [];
    for await (const chunk of file.file) {
      chunks.push(chunk as Buffer);
    }
    const buffer = Buffer.concat(chunks);
    const truncated = (file.file as { truncated?: boolean }).truncated === true;
    if (truncated || buffer.byteLength === 0 || buffer.byteLength > MAX_BYTES) {
      return reply.status(413).send({ error: 'file_too_large' });
    }

    const { createHash } = await import('node:crypto');
    const sha256 = createHash('sha256').update(buffer).digest('hex');
    const dto = await runtime.gate.runExclusive(async () => {
      const storedName = `${randomUUID()}.bin`;
      const directory = evidenceDir(runtime);
      await mkdir(directory, { recursive: true });
      await writeFile(join(directory, storedName), buffer);
      try {
        return insertEvidence(runtime.db.db, {
          occurrenceId,
          originalName: safeName(file.filename),
          storedName,
          mimeType: file.mimetype,
          sizeBytes: buffer.byteLength,
          sha256,
          nowUtc: runtime.clock.nowUtc(),
        });
      } catch (error) {
        await rm(join(directory, storedName), { force: true });
        throw error;
      }
    });
    return reply.status(201).send(dto);
  });

  app.get('/api/plans/:planId/occurrences/:occurrenceId/evidence/:evidenceId/download', async (request, reply) => {
    const { planId, occurrenceId, evidenceId } = request.params as {
      planId: string;
      occurrenceId: string;
      evidenceId: string;
    };
    const evidence = runtime.gate.runRead(() => {
      planInScope(runtime.db.db, planId);
      occurrenceInPlan(runtime.db.db, planId, occurrenceId);
      return getEvidence(runtime.db.db, evidenceId);
    });
    if (!evidence || evidence.occurrence_id !== occurrenceId) {
      return reply.status(404).send({ error: 'not_found' });
    }

    const path = join(evidenceDir(runtime), evidence.stored_name);
    const stream = createReadStream(path);
    return reply
      .type(evidence.mime_type)
      .header('Content-Disposition', `attachment; filename="${evidence.original_name.replace(/"/g, '')}"`)
      .send(stream);
  });

  app.delete('/api/plans/:planId/occurrences/:occurrenceId/evidence/:evidenceId', async (request, reply) => {
    const { planId, occurrenceId, evidenceId } = request.params as {
      planId: string;
      occurrenceId: string;
      evidenceId: string;
    };
    const evidence = runtime.gate.runRead(() => {
      planInScope(runtime.db.db, planId);
      occurrenceInPlan(runtime.db.db, planId, occurrenceId);
      return getEvidence(runtime.db.db, evidenceId);
    });
    if (!evidence || evidence.occurrence_id !== occurrenceId) {
      return reply.status(404).send({ error: 'not_found' });
    }
    await runtime.gate.runExclusive(() => deleteEvidence(runtime.db.db, evidenceId));
    await rm(join(evidenceDir(runtime), evidence.stored_name), { force: true });
    return reply.status(204).send();
  });
}
