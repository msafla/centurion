import { homedir, platform } from 'node:os';
import { join } from 'node:path';

export type AppMode = 'production' | 'development' | 'demo';

export type Config = {
  mode: AppMode;
  isDev: boolean;
  host: string;
  listenHost: string;
  port: number;
  canonicalOrigin: string;
  devOrigin: string;
  allowedOrigins: string[];
  allowedHosts: string[];
  dataDir: string;
  webDistDir: string;
  schemaVersion: number;
  bodyLimitBytes: number;
};

export function defaultDataDir(env: NodeJS.ProcessEnv = process.env): string {
  const override = env.CENTURION_DATA_DIR;
  if (override && override.trim() !== '') return override;

  switch (platform()) {
    case 'win32': {
      const localAppData = env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local');
      return join(localAppData, 'Centurion');
    }
    case 'darwin':
      return join(homedir(), 'Library', 'Application Support', 'Centurion');
    default: {
      const xdg = env.XDG_DATA_HOME;
      const base = xdg && xdg.trim() !== '' ? xdg : join(homedir(), '.local', 'share');
      return join(base, 'centurion');
    }
  }
}

const ACCEPTED_LISTEN_HOSTS = ['127.0.0.1', '0.0.0.0'] as const;

/**
 * Bind address for the HTTP listener. Distinct from `host`, which stays the
 * canonical 127.0.0.1 used for Origin/Host checks: in a container the socket
 * must bind 0.0.0.0 for the published port to be reachable, while the browser
 * still reaches the app via http://127.0.0.1:4317.
 */
export function resolveListenHost(env: NodeJS.ProcessEnv = process.env): string {
  const raw = env.CENTURION_LISTEN_HOST;
  if (raw === undefined) return '127.0.0.1';
  if ((ACCEPTED_LISTEN_HOSTS as readonly string[]).includes(raw)) return raw;
  throw new Error(
    `invalid CENTURION_LISTEN_HOST ${JSON.stringify(raw)}: only ${ACCEPTED_LISTEN_HOSTS.join(' and ')} are accepted`,
  );
}

export function loadConfig(
  env: NodeJS.ProcessEnv = process.env,
  overrides: Partial<Config> = {},
): Config {
  const mode: AppMode =
    env.CENTURION_DEMO === '1'
      ? 'demo'
      : env.NODE_ENV === 'development' || env.CENTURION_DEV === '1'
        ? 'development'
        : 'production';

  const host = '127.0.0.1';
  const port = 4317;
  const canonicalOrigin = `http://${host}:${port}`;
  const devOrigin = 'http://127.0.0.1:5173';

  return {
    mode,
    isDev: mode === 'development' || mode === 'demo',
    host,
    listenHost: resolveListenHost(env),
    port,
    canonicalOrigin,
    devOrigin,
    allowedOrigins: mode === 'development' ? [canonicalOrigin, devOrigin] : [canonicalOrigin],
    allowedHosts: [`${host}:${port}`],
    dataDir: defaultDataDir(env),
    webDistDir: join(process.cwd(), 'dist', 'web'),
    schemaVersion: 3,
    bodyLimitBytes: 64 * 1024,
    ...overrides,
  };
}
