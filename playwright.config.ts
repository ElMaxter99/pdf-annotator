import { defineConfig } from '@playwright/test';

/**
 * End-to-end tests run against the production build:
 *   npm run build && npm run e2e
 * Set PW_CHROMIUM to use an already installed Chromium instead of Playwright's own.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  fullyParallel: true,
  workers: process.env['CI'] ? 2 : undefined,
  retries: process.env['CI'] ? 1 : 0,
  reporter: process.env['CI'] ? [['github'], ['list']] : 'list',
  use: {
    baseURL: 'http://localhost:4300',
    viewport: { width: 1720, height: 900 },
    launchOptions: process.env['PW_CHROMIUM']
      ? { executablePath: process.env['PW_CHROMIUM'] }
      : {},
  },
  webServer: {
    command: 'node e2e/static-server.mjs dist/pdf-annotator/browser',
    url: 'http://localhost:4300',
    reuseExistingServer: !process.env['CI'],
  },
});
