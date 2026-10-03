import { McpServer } from '@modelcontextprotocol/server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';

serveStdio(() => new McpServer({ name: 'centurion', version: '0.1.0' }));
