// @ts-check
const { defineConfig, devices } = require('@playwright/test');

const isRemote = !!process.env.BASE_URL;
const baseURL = process.env.BASE_URL || 'http://localhost:8080';

module.exports = defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
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
  ...(isRemote ? {} : {
    webServer: {
      command: 'npx http-server -p 8080',
      url: 'http://localhost:8080',
      reuseExistingServer: !process.env.CI,
    },
  }),
});
