import { existsSync } from 'node:fs';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyInstance } from 'fastify';
import type { Clock } from './clock';
import type { Config } from './config';
import { registerErrorHandler } from './http/errors';
import { registerGuards } from './http/guards';
import { registerSecurityHeaders } from './http/headers';
import { registerBackupRoutes } from './routes/backups';
import { registerControlRoutes } from './routes/controls';
import { registerPlanRoutes } from './routes/plans';
import type { Runtime } from './runtime';

export type AppDeps = {
  config: Config;
  clock: Clock;
  runtime?: Runtime;
};

export async function buildApp(deps: AppDeps): Promise<FastifyInstance> {
  const { config } = deps;
  const app = Fastify({
    logger: false,
    trustProxy: false,
    bodyLimit: config.bodyLimitBytes,
  });

  registerSecurityHeaders(app, config);
  registerGuards(app, config);
  registerErrorHandler(app);

  app.get('/health', async () => ({ status: 'ok', schema_version: config.schemaVersion }));

  if (deps.runtime) {
    registerBackupRoutes(app, deps.runtime);
    registerPlanRoutes(app, deps.runtime);
    registerControlRoutes(app, deps.runtime);
  }

  if (existsSync(config.webDistDir)) {
    await app.register(fastifyStatic, { root: config.webDistDir, wildcard: false });
    app.get('/assets/*', (request, reply) =>
      reply.sendFile(decodeURIComponent(String((request.params as Record<string, unknown>)['*']))),
    );
    app.get('/fonts/*', (request, reply) =>
      reply.sendFile(decodeURIComponent(String((request.params as Record<string, unknown>)['*']))),
    );
  }

  return app;
}
