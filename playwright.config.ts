import { defineConfig } from '@playwright/test';

const e2eDataDir = `./data/e2e-${Date.now()}`;
process.env.CENTURION_E2E_DIR = e2eDataDir;

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:4317',
    headless: true,
  },
  webServer: {
    command: 'node dist/server/index.js',
    url: 'http://127.0.0.1:4317/health',
    reuseExistingServer: false,
    timeout: 30_000,
    env: {
      CENTURION_DATA_DIR: e2eDataDir,
    },
  },
});
