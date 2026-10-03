import type { FastifyInstance, FastifyReply } from 'fastify';
import type { ZodError, ZodType } from 'zod';
import type { ErrorBody } from '../../shared/schemas';

export class AppError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly fields: Record<string, string[]>;

  constructor(
    statusCode: number,
    code: string,
    message: string,
    fields: Record<string, string[]> = {},
  ) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.fields = fields;
  }

  toBody(): ErrorBody {
    return { error: { code: this.code, message: this.message, fields: this.fields } };
  }
}

export function zodFields(error: ZodError): Record<string, string[]> {
  const fields: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.length > 0 ? issue.path.map(String).join('.') : '_';
    const list = fields[key] ?? [];
    list.push(issue.message);
    fields[key] = list;
  }
  return fields;
}

export function parseInput<T>(schema: ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new AppError(422, 'validation_error', 'Invalid input', zodFields(result.error));
  }
  return result.data;
}

export function jsonError(reply: FastifyReply, statusCode: number, code: string, message: string) {
  return reply.status(statusCode).send({ error: { code, message, fields: {} } } satisfies ErrorBody);
}

const METHOD_CANDIDATES = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'] as const;

function allowedMethodsFor(app: FastifyInstance, pathname: string): string[] {
  const allowed: string[] = [];
  for (const method of METHOD_CANDIDATES) {
    try {
      if (app.hasRoute({ method, url: pathname })) allowed.push(method);
    } catch {
      // ignore
    }
  }
  return allowed;
}

export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof AppError) {
      return reply.status(error.statusCode).send(error.toBody());
    }

    const fastifyError = error as { statusCode?: number; code?: string };
    const status = fastifyError.statusCode ?? 500;
    if (status === 400) return jsonError(reply, 400, 'bad_request', 'Malformed request body');
    if (status === 413) return jsonError(reply, 413, 'payload_too_large', 'Request body too large');
    if (status === 415) {
      return jsonError(reply, 415, 'unsupported_media_type', 'Unsupported content type');
    }
    if (status >= 400 && status < 500) {
      return jsonError(reply, status, fastifyError.code ?? 'request_error', 'Request rejected');
    }

    request.log.error({ request_id: request.id, code: 'internal_error' });
    return jsonError(reply, 500, 'internal_error', 'Unexpected server error');
  });

  app.setNotFoundHandler((request, reply) => {
    const pathname = request.url.split('?')[0] ?? request.url;
    const allowed = allowedMethodsFor(app, pathname);
    if (allowed.length > 0 && !allowed.includes(request.method)) {
      reply.header('Allow', allowed.join(', '));
      return jsonError(reply, 405, 'method_not_allowed', 'Method not allowed');
    }
    return jsonError(reply, 404, 'not_found', 'Resource not found');
  });
}
