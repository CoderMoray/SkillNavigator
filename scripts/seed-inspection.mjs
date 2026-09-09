#!/usr/bin/env node
/**
 * Pre-generate the seed inspection artifact for an official Skill.
 *
 * Run ONCE on a machine that has: network access, a configured
 * VIRUSTOTAL_API_KEY (VT lookup costs one quota unit; the resulting summary
 * and report link are frozen into the artifact so setup never calls the API
 * again), and the vendored SkillSpector runtime (check `npm run
 * verify:review-deps`).
 *
 * The artifact is written to examples/seed-inspections/<slug>.json and must
 * be committed. From then on, setup/bootstrap links it verbatim — the only
 * thing that still runs live at seed time is HaluCatch (offline, vendored).
 *
 * Usage:
 *   node_modules/.bin/tsx scripts/seed-inspection.mjs --skill skillnav-skill
 *   node_modules/.bin/tsx scripts/seed-inspection.mjs --skill demo-skill
 *
 * For skillnav-skill the artifact freezes scores/verdict: review the printed
 * findings before committing and confirm there are no unexpected ones (or fix
 * the Skill content and re-run). Re-run this script whenever the Skill
 * content changes — bootstrap refuses to link an artifact whose contentHash
 * no longer matches the package.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mkdirSync, writeFileSync } from "node:fs";
import { readSkillPackage } from "@skill-platform/skill-spec";
import { inspectAndEvaluateSkillSnapshot } from "@skill-platform/inspection-engine";
import { loadDotEnvIfPresent } from "@skill-platform/storage";
import { SEED_ARTIFACT_DIR } from "./seed-artifact.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

const TARGETS = {
  "skillnav-skill": path.join(repoRoot, "examples", "skillnav-skill"),
  "demo-skill": path.join(repoRoot, "examples", "demo-skill"),
};

function parseArgs() {
  const idx = process.argv.indexOf("--skill");
  const slug = idx >= 0 ? process.argv[idx + 1]?.trim() : undefined;
  if (!slug || !TARGETS[slug]) {
    console.error(`Usage: tsx scripts/seed-inspection.mjs --skill <${Object.keys(TARGETS).join("|")}>`);
    process.exit(2);
  }
  return slug;
}

async function main() {
  loadDotEnvIfPresent();
  const slug = parseArgs();

  if (slug === "skillnav-skill" && !process.env.VIRUSTOTAL_API_KEY?.trim()) {
    console.error("❌ VIRUSTOTAL_API_KEY is not set — the VT lookup costs one quota unit and needs a key.");
    console.error("   Set it in .env (or the DOTENV_FILE) and re-run.");
    process.exit(1);
  }

  const snapshot = await readSkillPackage(TARGETS[slug]);
  console.log(`Inspecting ${slug} (contentHash ${snapshot.contentHash.slice(0, 12)}…)...`);

  const { inspection, evaluation, failedStages } = await inspectAndEvaluateSkillSnapshot(snapshot);

  console.log(`  verdict: ${inspection.verdict}`);
  console.log(`  evaluation provider: ${evaluation?.provider ?? "(none)"}`);
  if (failedStages.length > 0) {
    console.log(`  ⚠️  stage failures: ${failedStages.map((f) => `${f.stage}: ${f.message}`).join(" | ")}`);
  }
  if (inspection.findings.length === 0) {
    console.log("  findings: none");
  } else {
    console.log("  findings (review these before committing the artifact):");
    for (const finding of inspection.findings) {
      console.log(`    - [${finding.severity}] ${finding.id}: ${finding.title}`);
    }
  }
  console.log(`  virustotal: ${inspection.virusTotal ? inspection.virusTotal.analysisUrl : "(not run)"}`);

  const artifact =
    slug === "skillnav-skill"
      ? {
          skill: slug,
          contentHash: snapshot.contentHash,
          generatedAt: new Date().toISOString(),
          generator: {
            note: "Full inspection frozen (platform rules + SkillSpector + scores/verdict). HaluCatch re-runs live at seed time; VT never runs at seed time.",
          },
          virusTotal: inspection.virusTotal,
          inspection,
        }
      : {
          skill: slug,
          contentHash: snapshot.contentHash,
          generatedAt: new Date().toISOString(),
          generator: {
            note: "VT summary/link only. SkillSpector + HaluCatch re-run live at seed time.",
          },
          virusTotal: inspection.virusTotal,
        };

  mkdirSync(SEED_ARTIFACT_DIR, { recursive: true });
  const outFile = path.join(SEED_ARTIFACT_DIR, `${slug}.json`);
  writeFileSync(outFile, `${JSON.stringify(artifact, null, 2)}\n`);
  console.log(`✅ Artifact written: ${path.relative(repoRoot, outFile)}`);
  console.log("   Review the findings above, then commit the artifact.");
}

await main();
