import { defineConfig, devices } from '@playwright/test';

// Its own port, so tests can run while `npm start` (port 4317) is serving the app.
const PORT = 4327;

export default defineConfig({
  testDir: 'tests/e2e',
  use: { baseURL: `http://localhost:${PORT}` },
  webServer: {
    command: `node scripts/serve.mjs ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    stdout: 'ignore',
    stderr: 'ignore',
  },
  projects: [
    { name: 'iphone-webkit', use: { ...devices['iPhone 15'] }, testIgnore: /offline/ },
    { name: 'offline-chromium', use: { ...devices['Pixel 7'] }, testMatch: /offline/ },
  ],
});
