#!/usr/bin/env node
/**
 * Fail when a committed seed artifact no longer matches its Skill package.
 *
 * Each artifact in examples/seed-inspections/ pins the Skill's contentHash, and
 * bootstrap refuses to link one that has drifted. Without this check the drift
 * stays invisible until somebody else runs `npm run setup` — long after whoever
 * edited the Skill has moved on, and with no obvious link back to the edit.
 *
 * It is cheap and offline: it only re-reads each package and compares hashes.
 * Run it locally before committing a Skill change, or let CI do it on every
 * change under examples/.
 *
 * Usage:
 *   tsx scripts/verify-seed-artifacts.mjs
 */
import { readSkillPackage } from "@skill-platform/skill-spec";

import { SEED_SKILL_TARGETS, loadSeedArtifact, validateSeedArtifact } from "./seed-artifact.mjs";

/** @type {{ slug: string, message: string }[]} */
const failures = [];

for (const [slug, packageDir] of Object.entries(SEED_SKILL_TARGETS)) {
  const artifact = loadSeedArtifact(slug);
  if (artifact === null) {
    failures.push({
      slug,
      message: `${slug}: no artifact at examples/seed-inspections/${slug}.json`,
    });
    continue;
  }

  let snapshot;
  try {
    snapshot = await readSkillPackage(packageDir);
  } catch (error) {
    failures.push({
      slug,
      message: `${slug}: cannot read the package — ${error instanceof Error ? error.message : String(error)}`,
    });
    continue;
  }

  const result = validateSeedArtifact(artifact, snapshot);
  if (!result.ok) {
    failures.push({ slug, message: `${slug}: ${result.reason}` });
    continue;
  }
  console.log(
    `✅ ${slug}: artifact matches package (contentHash ${snapshot.contentHash.slice(0, 12)}…)`
  );
}

if (failures.length > 0) {
  console.error("");
  for (const { message } of failures) {
    console.error(`❌ ${message}`);
  }
  console.error("");
  console.error("A seed artifact is stale: the Skill content changed without regenerating it.");
  console.error("Regenerate on a machine with network, VIRUSTOTAL_API_KEY and SkillSpector (one");
  console.error("VirusTotal quota unit per run), then commit the artifact with the Skill change:");
  console.error("");
  for (const { slug } of failures) {
    console.error(
      `  VIRUSTOTAL_WAIT_FOR_ANALYSIS=true VIRUSTOTAL_ANALYSIS_TIMEOUT_MS=600000 \\\n` +
        `    tsx scripts/seed-inspection.mjs --skill ${slug}`
    );
  }
  process.exit(1);
}

console.log(`All ${Object.keys(SEED_SKILL_TARGETS).length} seed artifacts match their Skill packages.`);
