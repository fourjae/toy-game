import { defineConfig, devices } from '@playwright/test';

// `npm run dev`가 떠 있으면 그 서버를 그대로 쓰고, 없으면 여기서 직접 띄운다.
// 설치된 Playwright 브라우저 버전이 다른 환경(예: 클라우드 샌드박스)에서는
// PW_CHROMIUM_PATH=/opt/pw-browsers/chromium 처럼 실행 파일을 직접 지정할 수 있다.
const launchOptions = process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {};

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
    launchOptions,
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
