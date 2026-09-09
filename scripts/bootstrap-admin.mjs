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
import { inspectAndEvaluateSkillSnapshot } from "@skill-platform/inspection-engine";
import {
  createAuthStoreFromEnv,
  createRegistryStoreFromEnv,
  loadDotEnvIfPresent,
} from "@skill-platform/storage";
import { loadSeedArtifact, validateSeedArtifact } from "./seed-artifact.mjs";
import {
  DEMO_SLUG,
  OFFICIAL_SLUG,
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
  return inspectAndEvaluateSkillSnapshot(snapshot);
}

async function main() {
  loadDotEnvIfPresent();

  // VirusTotal never runs at seed time (API quota); the report link/summary
  // comes from the committed seed artifact instead.
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
    // skillnav-skill: SkillSpector results and scores/verdict are frozen in
    // the committed seed artifact; only HaluCatch re-runs live (offline).
    // VT is disabled — the artifact carries the report link.
    process.env.SKILLSPECTOR_ENABLED = "false";
    const artifact = loadSeedArtifact(OFFICIAL_SLUG);
    const inspectSnapshot = async (snapshot) => {
      const live = await defaultInspect(snapshot);
      const check = validateSeedArtifact(artifact, snapshot);
      if (!check.ok) {
        if (!artifact) {
          // Missing artifact: degrade to a live offline scan so setup still
          // works, but make the gap loud — the report then lacks the frozen
          // SkillSpector/VT results.
          console.error(
            "⚠️  No seed inspection artifact for skillnav-skill — falling back to a live offline scan (SkillSpector/VT disabled)."
          );
          console.error("   Generate it with: tsx scripts/seed-inspection.mjs --skill skillnav-skill");
          return live;
        }
        throw new Error(`Seed inspection artifact mismatch: ${check.reason}`);
      }
      console.error("ℹ️  Using the pre-generated seed inspection (SkillSpector + VT link); HaluCatch re-ran live.");
      return { inspection: artifact.inspection, evaluation: live.evaluation };
    };

    try {
      const result = await runBootstrap(
        {
          authStore,
          registryStore,
          skillDir: OFFICIAL_SKILL_DIR,
          readPackage: defaultReadPackage,
          inspectSnapshot,
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

  // Demo seeding: SkillSpector + HaluCatch run live; VT stays disabled (quota)
  // and the artifact's report link is attached to the live inspection instead.
  const demoArtifact = loadSeedArtifact(DEMO_SLUG);
  const demoInspectSnapshot = async (snapshot) => {
    const live = await defaultInspect(snapshot);
    const check = validateSeedArtifact(demoArtifact, snapshot);
    if (check.ok && demoArtifact.virusTotal) {
      live.inspection.virusTotal = demoArtifact.virusTotal;
    } else if (demoArtifact && !check.ok) {
      console.error(`⚠️  demo-skill seed artifact mismatch (${check.reason}) — VT link not attached.`);
    }
    return live;
  };

  try {
    const result = await runDemoSeed(
      {
        authStore,
        registryStore,
        skillDir: DEMO_SKILL_DIR,
        readPackage: defaultReadPackage,
        inspectSnapshot: demoInspectSnapshot,
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
