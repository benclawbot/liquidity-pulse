import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30000,
  fullyParallel: false,
  retries: 0,
  use: {
    baseURL: 'http://127.0.0.1:8000',
    headless: true,
    launchOptions: {
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    },
  },
  webServer: {
    command: 'cd .. && .venv/bin/python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000',
    port: 8000,
    reuseExistingServer: true,
    timeout: 120000,
  },
});
