#!/usr/bin/env node
/**
 * Bootstrap helper (tsx): seed the registry for both deployment modes.
 *
 * Core logic lives in bootstrap-admin-core.mjs (unit-tested without pulling
 * storage / inspection-engine into Vitest).
 *
 * Mode A — ADMIN_USERNAME / ADMIN_EMAIL / ADMIN_DISPLAY_NAME all set:
 *   make sure the configured administrator owns the official skillnav-skill,
 *   idempotently (never rebuilds an existing account, never clears data).
 *
 * Mode B — no ADMIN_* configured (setup.sh ON_DEV=false):
 *   make sure the shared demo account ('alice', fixed well-known credentials)
 *   owns the demo Skill, idempotently.
 *   ON_DEV=true (or unset): nothing is initialized — {"action":"skipped"}.
 *
 * stdout is one JSON line consumed by scripts/setup.sh.
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
  parseAdminConfig,
  runBootstrap,
  runDemoSeed,
} from "./bootstrap-admin-core.mjs";

export {
  DEMO_SLUG,
  OFFICIAL_SLUG,
  generatePassword,
  parseAdminConfig,
  runBootstrap,
  runDemoSeed,
} from "./bootstrap-admin-core.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const OFFICIAL_SKILL_DIR = path.join(repoRoot, "examples", "skillnav-skill");
const DEMO_SKILL_DIR = path.join(repoRoot, "examples", "demo-skill");

async function defaultReadPackage(skillDir) {
  return readSkillPackage(skillDir);
}

async function defaultInspect(snapshot) {
  return inspectSkillSnapshot(snapshot);
}

async function main() {
  loadDotEnvIfPresent();

  // Seed inspections must run offline and deterministically (both admin and demo
  // paths): SkillSpector / VirusTotal stay disabled; HaluCatch runs from the
  // vendored source.
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

  const admin = parseAdminConfig(process.env);

  if (admin) {
    try {
      const result = await runBootstrap(
        {
          authStore,
          registryStore,
          skillDir: OFFICIAL_SKILL_DIR,
          readPackage: defaultReadPackage,
          inspectSnapshot: defaultInspect,
        },
        admin
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
    return;
  }

  // No ADMIN_* configured.
  const onDev = process.env.ON_DEV?.trim().toLowerCase() !== "false";
  if (onDev) {
    console.log(
      JSON.stringify({
        action: "skipped",
        message:
          "No ADMIN_* configured — development mode initializes no Skill. Set ADMIN_USERNAME / ADMIN_EMAIL / ADMIN_DISPLAY_NAME to seed skillnav-skill, or run with ON_DEV=false to seed the demo Skill.",
      })
    );
    return;
  }

  try {
    const result = await runDemoSeed(
      {
        authStore,
        registryStore,
        skillDir: DEMO_SKILL_DIR,
        readPackage: defaultReadPackage,
        inspectSnapshot: defaultInspect,
      },
      {}
    );
    console.log(JSON.stringify(result));
  } catch (error) {
    console.error(error instanceof Error ? error.stack : String(error));
    console.log(
      JSON.stringify({
        action: "error",
        code: "bootstrap-failed",
        message: `Demo bootstrap failed: ${error instanceof Error ? error.message : String(error)}`,
      })
    );
  }
}

const isCli = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  await main();
}
