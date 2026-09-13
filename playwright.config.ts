import { defineConfig, devices } from '@playwright/test';

// `npm run dev`가 떠 있으면 그 서버를 그대로 쓰고, 없으면 여기서 직접 띄운다.
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
  },
  webServer: [
    { command: 'npx tsx server/index.ts', url: 'http://127.0.0.1:3001/api/health', reuseExistingServer: true, timeout: 30_000 },
    { command: 'npx vite --port 5173 --strictPort', url: 'http://localhost:5173', reuseExistingServer: true, timeout: 30_000 },
  ],
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
});
