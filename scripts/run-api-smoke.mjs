#!/usr/bin/env node
/**
 * Run the vitest API smoke tests against an ephemeral dev API.
 *
 * Starts `npm run dev:api`, waits for /health, runs tests/smoke.test.ts,
 * then tears the API down. Prereq: local PG (matching .env) is up.
 *
 * Usage: npm run test:smoke
 */
import { spawn } from "node:child_process";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const healthUrl = "http://127.0.0.1:3000/health";
const apiReadyTimeoutMs = 90_000;

function sleep(ms) {
  return new Promise((done) => setTimeout(done, ms));
}

async function waitForApi(timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(healthUrl);
      if (res.ok) {
        return true;
      }
    } catch {
      // API not up yet.
    }
    await sleep(1000);
  }
  return false;
}

const api = spawn("npm", ["run", "dev:api"], {
  cwd: root,
  stdio: "ignore"
});

let exitCode = 1;
try {
  if (!(await waitForApi(apiReadyTimeoutMs))) {
    console.error(`dev:api did not become healthy at ${healthUrl} within ${apiReadyTimeoutMs / 1000}s`);
  } else {
    console.log("dev:api ready, running tests/smoke.test.ts");
    const vitest = spawn("npx", ["vitest", "run", "tests/smoke.test.ts"], {
      cwd: root,
      stdio: "inherit"
    });
    exitCode = await new Promise((settled) => {
      vitest.on("exit", (code) => settled(code ?? 1));
    });
  }
} finally {
  api.kill("SIGTERM");
}
process.exitCode = exitCode;
