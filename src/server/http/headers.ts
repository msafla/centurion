import type { FastifyInstance } from 'fastify';
import type { Config } from '../config';

const PROD_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "connect-src 'self'",
  "font-src 'self'",
  "img-src 'self' data:",
  "style-src 'self' 'unsafe-inline'",
  "style-src-attr 'unsafe-inline'",
  "object-src 'none'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
].join('; ');

const DEV_CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "connect-src 'self' ws://127.0.0.1:5173 http://127.0.0.1:5173",
  "font-src 'self' data:",
  "img-src 'self' data:",
  "style-src 'self' 'unsafe-inline'",
  "style-src-attr 'unsafe-inline'",
  "object-src 'none'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
].join('; ');

export function registerSecurityHeaders(app: FastifyInstance, config: Config): void {
  app.addHook('onSend', async (request, reply, payload) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('Referrer-Policy', 'no-referrer');
    reply.header('X-Frame-Options', 'DENY');
    reply.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');

    if (
      request.url.startsWith('/api') ||
      request.url.startsWith('/internal') ||
      request.url.startsWith('/exports')
    ) {
      reply.header('Cache-Control', 'no-store');
    }

    const contentType = String(reply.getHeader('content-type') ?? '');
    if (contentType.includes('text/html')) {
      reply.header('Content-Security-Policy', config.isDev ? DEV_CSP : PROD_CSP);
    }

    return payload;
  });
}
