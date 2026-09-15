#!/usr/bin/env node
/**
 * Standalone inspection-stage reconcile entrypoint (tsx).
 *
 * Fills missing per-stage inspection statuses (skillspector / virustotal /
 * halucatch) from the inspection report each row already carries. Never
 * re-publishes, never overwrites an existing stage value, never touches
 * `inspectionStatus`, never touches the network.
 *
 * Usage:
 *   tsx scripts/reconcile-inspection.mjs                          # official slug
 *   tsx scripts/reconcile-inspection.mjs --slug demo-skill
 *   tsx scripts/reconcile-inspection.mjs --slug a --slug b
 *   tsx scripts/reconcile-inspection.mjs --all [--dry-run] [--json]
 *
 * `--all` walks the public registry (every Skill, every version) which is the
 * upgrade path for instances whose historical rows predate the stage model.
 */
import { createRegistryStoreFromEnv, loadDotEnvIfPresent } from "@skill-platform/storage";
import { OFFICIAL_SLUG } from "./bootstrap-admin-core.mjs";
import { reconcileSkillStageStatuses } from "./seed-reconcile.mjs";

function parseArgs(argv) {
  const slugs = [];
  let all = false;
  let dryRun = false;
  let json = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--all") {
      all = true;
    } else if (arg === "--dry-run") {
      dryRun = true;
    } else if (arg === "--json") {
      json = true;
    } else if (arg === "--slug") {
      const value = argv[index + 1];
      if (value) {
        slugs.push(value);
        index += 1;
      }
    } else if (arg.startsWith("--slug=")) {
      slugs.push(arg.slice("--slug=".length));
    }
  }

  if (slugs.length === 0 && !all) {
    slugs.push(OFFICIAL_SLUG);
  }
  return { slugs, all, dryRun, json };
}

async function main() {
  loadDotEnvIfPresent();
  const { slugs, all, dryRun, json } = parseArgs(process.argv.slice(2));

  let registryStore;
  try {
    registryStore = createRegistryStoreFromEnv();
  } catch (error) {
    console.log(
      JSON.stringify({
        action: "error",
        code: "store-init",
        message: error instanceof Error ? error.message : String(error),
      })
    );
    return;
  }

  const targets = [...slugs];
  if (all) {
    const page = await registryStore.search("", []);
    for (const item of page?.items ?? []) {
      const slug = item?.slug;
      if (slug && !targets.includes(slug)) {
        targets.push(slug);
      }
    }
  }

  const results = [];
  for (const slug of targets) {
    results.push(await reconcileSkillStageStatuses(registryStore, slug, { dryRun }));
  }

  const patched = results.flatMap((result) => result.patched);
  const unresolved = results.flatMap((result) => result.unresolved);
  const skipped = results.flatMap((result) => result.skipped);

  if (json) {
    console.log(JSON.stringify({ action: "reconciled", dryRun, results }));
    return;
  }

  console.log(`Scanned ${results.length} skill(s)${dryRun ? " (dry-run)" : ""}.`);
  console.log(`Patched: ${patched.length}${patched.length ? `\n  ${patched.join("\n  ")}` : ""}`);
  if (unresolved.length) {
    console.log(
      `Needs manual attention (no data to infer from): ${unresolved.length}\n  ${unresolved.join("\n  ")}`
    );
  }
  if (skipped.length) {
    console.log(`Skipped (no inspection data at all): ${skipped.length}`);
  }
}

await main();
