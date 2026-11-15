import { defineConfig } from '@playwright/test';
import nextEnvironment from '@next/env';
nextEnvironment.loadEnvConfig(process.cwd());

export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: false,
  workers: 1,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: 'list',
  webServer: {
    command: 'npm run build && npm run start -- --hostname 127.0.0.1 --port 3002',
    url: 'http://127.0.0.1:3002',
    timeout: 120_000,
    reuseExistingServer: false,
    env: {
      SMTP_HOST: '127.0.0.1',
      SMTP_PORT: '3025',
      SMTP_USER: 'test',
      SMTP_PASSWORD: 'test',
      SMTP_FROM: 'marketplace@example.test',
      SMTP_SECURE: 'false',
      SMTP_ALLOW_INSECURE_LOCAL: 'true',
      MARKETPLACE_SMTP_TEST: 'true',
      NEXT_PUBLIC_SITE_URL: 'http://127.0.0.1:3002',
    },
  },
  use: {
    baseURL: 'http://127.0.0.1:3002',
    viewport: { width: 1440, height: 1000 },
    launchOptions: {
      executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
});
