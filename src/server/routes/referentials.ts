import type { FastifyInstance } from 'fastify';
import { listReferentials } from '../domain/referentials';
import type { Runtime } from '../runtime';

export function registerReferentialRoutes(app: FastifyInstance, runtime: Runtime): void {
  app.get('/api/referentials', async () =>
    runtime.gate.runRead(() => listReferentials(runtime.db.db)),
  );
}
