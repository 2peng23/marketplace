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
  use: {
    baseURL: process.env.TEST_BASE_URL || 'http://127.0.0.1:3001',
    viewport: { width: 1440, height: 1000 },
    launchOptions: {
      executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
});
