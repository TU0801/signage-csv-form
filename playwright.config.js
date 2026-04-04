// @ts-check
const { defineConfig, devices } = require('@playwright/test');

const isRemote = !!process.env.BASE_URL;
const baseURL = process.env.BASE_URL || 'http://localhost:8080';

module.exports = defineConfig({
  testDir: './tests',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 1,
  workers: process.env.CI ? 4 : 6,
  timeout: 60000,
  reporter: 'html',
  use: {
    baseURL,
    trace: 'on-first-retry',
    navigationTimeout: 30000,
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
