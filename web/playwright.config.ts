import { defineConfig, devices } from '@playwright/test';

const webPort = Number(process.env.PLAYWRIGHT_WEB_PORT ?? '3007');
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${webPort}`;
const useWebServer = process.env.PLAYWRIGHT_USE_WEBSERVER !== '0';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 120_000,
  workers: 1,
  fullyParallel: false,
  retries: 0,
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: useWebServer
    ? {
        command: `pnpm exec next dev -p ${webPort}`,
        port: webPort,
        reuseExistingServer: false,
        env: {
          ...process.env,
          API_PROXY_TARGET: process.env.API_PROXY_TARGET ?? 'https://openraccoon.com',
          NEXT_PUBLIC_WS_URL: process.env.NEXT_PUBLIC_WS_URL ?? 'https://openraccoon.com',
        },
        timeout: 120_000,
      }
    : undefined,
});
