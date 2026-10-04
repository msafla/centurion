import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { PageInputSchema } from '../../shared/schemas';
import { AppError, parseInput } from '../http/errors';
import { dispatchMcp } from '../mcp/dispatch';
import type { McpToolName } from '../mcp/policy';
import { getMcpPolicy, updateMcpPolicy } from '../mcp/policy-store';
import { approveProposal, listProposals, rejectProposal } from '../mcp/proposals';
import type { Runtime } from '../runtime';
import { writeBackendInfo } from '../storage/runtime-files';

const DispatchBody = z.object({ tool: z.string(), arguments: z.unknown().optional() }).strict();

const McpPolicyPatch = z
  .object({
    read_enabled: z.boolean().optional(),
    exports_enabled: z.boolean().optional(),
    write_create_enabled: z.boolean().optional(),
    write_update_enabled: z.boolean().optional(),
    write_set_occurrence_enabled: z.boolean().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, { message: 'empty_patch' });

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

  // UI-only routes: not reachable through the MCP dispatch allowlist.
  app.get('/api/mcp-proposals', async (request) =>
    runtime.gate.runRead(() => {
      const { page, page_size } = parseInput(PageInputSchema, request.query);
      return listProposals(runtime, page, page_size);
    }),
  );

  app.post('/api/mcp-proposals/:proposalId/approve', async (request) => {
    const { proposalId } = request.params as { proposalId: string };
    return approveProposal(runtime, app, proposalId);
  });

  app.post('/api/mcp-proposals/:proposalId/reject', async (request) => {
    const { proposalId } = request.params as { proposalId: string };
    return runtime.gate.runExclusive(() => rejectProposal(runtime, proposalId));
  });

  app.get('/api/mcp-policy', async () =>
    runtime.gate.runRead(() => getMcpPolicy(runtime.db.db)),
  );

  app.put('/api/mcp-policy', async (request) => {
    const patch = parseInput(McpPolicyPatch, request.body);
    return runtime.gate.runExclusive(() => {
      const policy = updateMcpPolicy(runtime.db.db, patch, runtime.clock.nowUtc());
      // Refresh the adapter bootstrap so the new permissions apply immediately.
      writeBackendInfo(runtime.dataDir, {
        origin: runtime.config.canonicalOrigin,
        epoch: runtime.engineEpoch,
        policy,
      });
      return policy;
    });
  });
}
