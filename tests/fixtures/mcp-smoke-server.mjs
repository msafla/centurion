import { McpServer } from '@modelcontextprotocol/server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { z } from 'zod';

serveStdio(() => {
  const server = new McpServer({ name: 'centurion-smoke', version: '1.0.0' });
  server.registerTool(
    'echo',
    {
      description: 'Echo the provided text back to the caller.',
      inputSchema: z.object({ text: z.string() }),
    },
    async ({ text }) => ({ content: [{ type: 'text', text: `echo:${text}` }] }),
  );
  return server;
});
