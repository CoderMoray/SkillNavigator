#!/usr/bin/env node
/**
 * Production bootstrap helper (tsx): make sure the configured administrator
 * owns the official skillnav-skill in the registry — idempotently.
 *
 * Core logic lives in bootstrap-admin-core.mjs (unit-tested without pulling
 * storage / inspection-engine into Vitest).
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readSkillPackage } from "@skill-platform/skill-spec";
import { inspectSkillSnapshot } from "@skill-platform/inspection-engine";
import {
  createAuthStoreFromEnv,
  createRegistryStoreFromEnv,
  loadDotEnvIfPresent,
} from "@skill-platform/storage";
import {
  DEMO_SLUG,
  OFFICIAL_SLUG,
  parseAdminConfig,
  runBootstrap,
} from "./bootstrap-admin-core.mjs";

export { DEMO_SLUG, OFFICIAL_SLUG, generatePassword, parseAdminConfig, runBootstrap } from "./bootstrap-admin-core.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const OFFICIAL_SKILL_DIR = path.join(repoRoot, "examples", "skillnav-skill");

async function defaultReadPackage(skillDir) {
  return readSkillPackage(skillDir);
}

async function defaultInspect(snapshot) {
  return inspectSkillSnapshot(snapshot);
}

async function main() {
  loadDotEnvIfPresent(path.join(repoRoot, ".env"));

  process.env.SKILLSPECTOR_ENABLED = "false";
  process.env.VIRUSTOTAL_ENABLED = "false";

  let authStore;
  let registryStore;
  try {
    authStore = createAuthStoreFromEnv();
    registryStore = createRegistryStoreFromEnv();
  } catch (error) {
    console.log(
      JSON.stringify({
        action: "error",
        code: "store-init",
        message: String(error instanceof Error ? error.message : error),
      })
    );
    return;
  }

  try {
    const admin = parseAdminConfig(process.env);
    const result = await runBootstrap(
      {
        authStore,
        registryStore,
        skillDir: OFFICIAL_SKILL_DIR,
        readPackage: defaultReadPackage,
        inspectSnapshot: defaultInspect,
      },
      admin ?? {}
    );
    console.log(JSON.stringify(result));
  } catch (error) {
    console.error(error instanceof Error ? error.stack : String(error));
    console.log(
      JSON.stringify({
        action: "error",
        code: "bootstrap-failed",
        message: `Admin bootstrap failed: ${error instanceof Error ? error.message : String(error)}`,
      })
    );
  }
}

const isCli = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  await main();
}
