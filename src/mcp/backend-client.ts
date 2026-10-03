import { request as httpRequest } from 'node:http';
import { readBackendInfo, readToken } from '../server/storage/runtime-files';

export class McpBackendError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'McpBackendError';
    this.code = code;
  }
}

type HttpResult = { status: number; text: string };

/**
 * POSTs JSON over loopback with `node:http`, so the internal call carries no
 * browser `Origin` or `Sec-Fetch-*` metadata. It never opens SQLite and never
 * accepts a URL from a tool argument.
 */
function postJson(origin: string, token: string, body: unknown): Promise<HttpResult> {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const request = httpRequest(
      new URL('/internal/mcp/dispatch', origin),
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'content-length': Buffer.byteLength(payload),
          'x-centurion-mcp-token': token,
        },
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('end', () =>
          resolve({ status: response.statusCode ?? 0, text: Buffer.concat(chunks).toString('utf8') }),
        );
      },
    );
    request.on('error', () => reject(new McpBackendError('backend_unavailable', 'Backend is unreachable')));
    request.write(payload);
    request.end();
  });
}

export class BackendClient {
  constructor(private readonly dataDir: string) {}

  async dispatch(tool: string, args: unknown): Promise<unknown> {
    const info = readBackendInfo(this.dataDir);
    if (!info) throw new McpBackendError('backend_unavailable', 'Backend is not running');
    const token = readToken(this.dataDir);
    if (!token) throw new McpBackendError('backend_unavailable', 'Backend token is missing');

    const response = await postJson(info.origin, token, { tool, arguments: args });
    let data: { error?: { code?: string; message?: string } };
    try {
      data = JSON.parse(response.text) as typeof data;
    } catch {
      throw new McpBackendError('backend_error', 'Invalid backend response');
    }
    if (response.status >= 400) {
      throw new McpBackendError(
        data.error?.code ?? 'backend_error',
        data.error?.message ?? 'Backend error',
      );
    }
    return data;
  }

  writeEnabled(): boolean {
    return readBackendInfo(this.dataDir)?.mcp_write_enabled === true;
  }
}
