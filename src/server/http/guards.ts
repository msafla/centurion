import type { FastifyInstance } from 'fastify';
import type { Config } from '../config';
import { privateContext } from '../context';
import { AppError } from './errors';

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Protects the browser boundary. This does not isolate other local processes
 * (they can forge headers); it blocks hostile web pages and cross-site
 * navigations against the loopback API.
 */
export function registerGuards(app: FastifyInstance, config: Config): void {
  app.addHook('onRequest', async (request) => {
    // In-process dispatch carries an unforgeable private context; no header or
    // body can create it, so it bypasses the browser boundary.
    if (privateContext.getStore()) return;

    const host = request.headers.host;
    if (!host || !config.allowedHosts.includes(host)) {
      throw new AppError(403, 'host_not_allowed', 'Host not allowed');
    }

    const origin = request.headers.origin;
    const secFetchSite = request.headers['sec-fetch-site'];

    if (secFetchSite === 'cross-site') {
      throw new AppError(403, 'cross_site_forbidden', 'Cross-site request forbidden');
    }
    if (typeof origin === 'string' && origin !== 'null' && !config.allowedOrigins.includes(origin)) {
      throw new AppError(403, 'origin_not_allowed', 'Origin not allowed');
    }

    const isApi = request.url.startsWith('/api');
    if (isApi && MUTATING_METHODS.has(request.method)) {
      if (typeof origin !== 'string' || origin === '' || origin === 'null') {
        throw new AppError(403, 'origin_required', 'Origin required for mutations');
      }
      if (!config.allowedOrigins.includes(origin)) {
        throw new AppError(403, 'origin_not_allowed', 'Origin not allowed');
      }
      if (request.headers['x-centurion-request'] !== '1') {
        throw new AppError(403, 'request_header_required', 'Missing X-Centurion-Request header');
      }
      if (request.method !== 'DELETE') {
        const contentType = request.headers['content-type'] ?? '';
        const accepted =
          contentType.startsWith('application/json') || contentType.startsWith('multipart/form-data');
        if (!accepted) {
          throw new AppError(415, 'unsupported_media_type', 'Unsupported content type');
        }
      }
    }
  });
}
