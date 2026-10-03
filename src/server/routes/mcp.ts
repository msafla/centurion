import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { AppError, parseInput } from '../http/errors';
import { dispatchMcp } from '../mcp/dispatch';
import type { McpToolName } from '../mcp/policy';
import type { Runtime } from '../runtime';

const DispatchBody = z.object({ tool: z.string(), arguments: z.unknown().optional() }).strict();

export function registerMcpRoutes(app: FastifyInstance, runtime: Runtime): void {
  app.post('/internal/mcp/dispatch', async (request) => {
    // Internal route: never reachable from a browser.
    if (request.headers.origin !== undefined) {
      throw new AppError(403, 'origin_forbidden', 'Origin is not allowed on the internal dispatch');
    }
    for (const key of Object.keys(request.headers)) {
      if (key.toLowerCase().startsWith('sec-fetch-')) {
        throw new AppError(403, 'fetch_metadata_forbidden', 'Fetch metadata is not allowed');
      }
    }
    const token = request.headers['x-centurion-mcp-token'];
    if (!runtime.mcpToken || token !== runtime.mcpToken) {
      throw new AppError(403, 'invalid_token', 'Invalid MCP token');
    }
    const body = parseInput(DispatchBody, request.body);
    return dispatchMcp(app, runtime, body.tool as McpToolName, body.arguments ?? {});
  });
}
