import { McpServer } from '@modelcontextprotocol/server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { defaultDataDir } from '../server/config';
import { BackendClient } from './backend-client';
import { AdapterLimiter } from './rate-limit';
import { registerReadTools, registerWriteTools } from './tools';

const envDataDir = process.env.CENTURION_DATA_DIR;
const dataDir = envDataDir && envDataDir.trim() !== '' ? envDataDir : defaultDataDir(process.env);

const client = new BackendClient(dataDir);
const limiter = new AdapterLimiter();

serveStdio(() => {
  const server = new McpServer({ name: 'centurion', version: '0.1.0' });
  registerReadTools(server, client, limiter);
  if (client.writeEnabled() && process.env.CENTURION_MCP_WRITE === '1') {
    registerWriteTools(server, client, limiter);
  }
  return server;
});
