import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.e2e.ts",
  timeout: 45_000,
  expect: {
    timeout: 10_000
  },
  fullyParallel: false,
  reporter: [["list"], ["html", { open: "never" }]],
  // 自动托管被测服务：跑 e2e 无需手动起 API/Web；本地已起时复用。
  // 前置要求：本地 PG（含种子数据）与系统 Chrome，同 dev 环境。
  webServer: [
    {
      command: "npm run dev:api",
      url: "http://127.0.0.1:3000/health",
      timeout: 60_000,
      reuseExistingServer: true
    },
    {
      command: "npm run dev:web",
      url: "http://127.0.0.1:3001/",
      timeout: 120_000,
      reuseExistingServer: true
    }
  ],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://127.0.0.1:3001",
    channel: "chrome",
    headless: true,
    screenshot: "only-on-failure",
    trace: "retain-on-failure"
  }
});
