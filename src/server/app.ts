import { existsSync } from 'node:fs';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyInstance } from 'fastify';
import type { Clock } from './clock';
import type { Config } from './config';
import { registerErrorHandler } from './http/errors';
import { registerGuards } from './http/guards';
import { registerSecurityHeaders } from './http/headers';
import { registerBackupRoutes } from './routes/backups';
import { registerClauseRoutes } from './routes/clauses';
import { registerControlRoutes } from './routes/controls';
import { registerEvidenceRoutes } from './routes/evidence';
import { registerImportRoutes } from './routes/imports';
import { registerMcpRoutes } from './routes/mcp';
import { registerOccurrenceRoutes } from './routes/occurrences';
import { registerPlanRoutes } from './routes/plans';
import { registerReferentialRoutes } from './routes/referentials';
import { registerReportingRoutes } from './routes/reporting';
import { registerSearchRoutes } from './routes/search';
import { registerTrendRoutes } from './routes/trends';
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
    await app.register(multipart, {
      limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 10, fieldSize: 16 * 1024 },
    });
    registerBackupRoutes(app, deps.runtime);
    registerClauseRoutes(app, deps.runtime);
    registerPlanRoutes(app, deps.runtime);
    registerReferentialRoutes(app, deps.runtime);
    registerControlRoutes(app, deps.runtime);
    registerOccurrenceRoutes(app, deps.runtime);
    registerEvidenceRoutes(app, deps.runtime);
    registerReportingRoutes(app, deps.runtime);
    registerSearchRoutes(app, deps.runtime);
    registerTrendRoutes(app, deps.runtime);
    registerImportRoutes(app, deps.runtime);
    registerMcpRoutes(app, deps.runtime);
  }

  if (existsSync(config.webDistDir)) {
    // Wildcard serves index.html at `/` and every static file; the explicit
    // asset/font routes are more specific and prefix the managed subfolder.
    await app.register(fastifyStatic, { root: config.webDistDir });
    app.get('/assets/*', (request, reply) =>
      reply.sendFile(
        `assets/${decodeURIComponent(String((request.params as Record<string, unknown>)['*']))}`,
      ),
    );
    app.get('/fonts/*', (request, reply) =>
      reply.sendFile(
        `fonts/${decodeURIComponent(String((request.params as Record<string, unknown>)['*']))}`,
      ),
    );
    for (const path of [
      '/search',
      '/plan',
      '/trends',
      '/references',
      '/archived',
      '/reporting',
      '/import',
      '/settings',
      '/control/:controlId',
    ]) {
      app.get(path, (_request, reply) => reply.sendFile('index.html'));
    }
  }

  return app;
}
