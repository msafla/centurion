import { z } from 'zod';
import { describe, expect, it } from 'vitest';
import { AppError } from '../../src/server/http/errors';
import { McpLimiter } from '../../src/server/mcp/limits';
import { ALL_TOOLS, READ_TOOLS, resolveTool, WRITE_TOOLS } from '../../src/server/mcp/policy';
import type { Runtime } from '../../src/server/runtime';
import { projectMcpOutput, sanitizeText } from '../../src/mcp/sanitize';

const runtime = { mcpWriteEnabled: false } as unknown as Runtime;

describe('MCP policy', () => {
  it('exposes exactly the eight read tools and no write tool in read mode', () => {
    expect(READ_TOOLS).toHaveLength(8);
    expect(READ_TOOLS).toEqual([
      'list_plans',
      'get_plan',
      'list_controls',
      'get_control',
      'list_occurrences',
      'get_summary',
      'export_controls_csv',
      'generate_report_pdf',
    ]);
    expect(WRITE_TOOLS).toHaveLength(3);
    expect(ALL_TOOLS).toHaveLength(11);
  });

  it('rejects unknown tools and unknown arguments', () => {
    expect(() => resolveTool('shell', {}, runtime)).toThrow(AppError);
    expect(() => resolveTool('list_plans', { unexpected: 1 }, runtime)).toThrow(AppError);
  });

  it('maps read tools to the same API routes', () => {
    expect(resolveTool('list_plans', {}, runtime)).toEqual({
      kind: 'api',
      method: 'GET',
      url: '/api/plans?page=1&page_size=50',
    });
    expect(resolveTool('get_plan', { plan_id: '123e4567-e89b-42d3-a456-426614174000' }, runtime)).toEqual(
      { kind: 'api', method: 'GET', url: '/api/plans/123e4567-e89b-42d3-a456-426614174000' },
    );
  });

  it('refuses write tools when the backend flag is off', () => {
    try {
      resolveTool('create_control', { plan_id: 'x' }, runtime);
      expect.unreachable('write tool should be refused');
    } catch (error) {
      expect((error as AppError).code).toBe('write_disabled');
    }
  });
});

describe('MCP projection', () => {
  it('removes invisible characters and flags sanitized fields', () => {
    expect(sanitizeText('a\u200bb\uFE0fc\u{E0001}d')).toBe('abcd');
    expect(sanitizeText('ligne 1\nligne 2')).toBe('ligne 1 ligne 2');
  });

  it('validates output and reports changed fields', () => {
    const schema = z.object({ title: z.string() });
    const result = projectMcpOutput({ title: 'ok\u200b' }, schema);
    expect(result.data).toEqual({ title: 'ok' });
    expect(result.sanitized_fields).toEqual(['title']);
    expect(() => projectMcpOutput({ title: 1 }, schema)).toThrow('mcp_output_schema_mismatch');
  });
});

describe('MCP limits', () => {
  it('limits calls, exports and opens a circuit after repeated 5xx', () => {
    const limiter = new McpLimiter();
    for (let index = 0; index < 120; index += 1) {
      limiter.check('call', 1000);
      limiter.release(false, 1000);
    }
    expect(() => limiter.check('call', 1000)).toThrow(AppError);

    const exportLimiter = new McpLimiter();
    for (let index = 0; index < 5; index += 1) {
      exportLimiter.check('export', 1000);
      exportLimiter.release(false, 1000);
    }
    expect(() => exportLimiter.check('export', 1000)).toThrow(AppError);

    const circuit = new McpLimiter();
    for (let index = 0; index < 10; index += 1) {
      circuit.check('call', 1000);
      circuit.release(true, 1000);
    }
    expect(() => circuit.check('call', 2000)).toThrow(/circuit/i);
    expect(() => circuit.check('call', 20000)).not.toThrow();
  });
});
