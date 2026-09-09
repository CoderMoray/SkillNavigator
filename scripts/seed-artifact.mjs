/**
 * Seed inspection artifact helpers, shared by the pre-generation CLI
 * (scripts/seed-inspection.mjs) and the bootstrap entry
 * (scripts/bootstrap-admin.mjs).
 *
 * An artifact pins the offline seed data for one official Skill:
 *   - skillnav-skill: a full InspectionReport (platform rules + SkillSpector
 *     findings + scores/verdict) plus the VirusTotal summary/link, generated
 *     once on a machine with network + SkillSpector available. setup() links
 *     it verbatim — SkillSpector/VT never re-run at seed time.
 *   - demo-skill: only the VirusTotal summary/link (SkillSpector + HaluCatch
 *     run live during setup; running VT there would burn API quota).
 *
 * Artifacts live OUTSIDE the skill packages (examples/seed-inspections/) so
 * they never enter the package zip and never affect the contentHash.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const SEED_ARTIFACT_DIR = path.resolve(__dirname, "..", "examples", "seed-inspections");

export function seedArtifactPath(slug, dir = SEED_ARTIFACT_DIR) {
  return path.join(dir, `${slug}.json`);
}

/**
 * Load an artifact by slug. Returns:
 *   - null                        -> artifact file does not exist
 *   - { error }                   -> file exists but is unreadable/malformed
 *   - artifact object             -> { skill, contentHash, generatedAt, virusTotal, inspection? }
 */
export function loadSeedArtifact(slug, dir = SEED_ARTIFACT_DIR) {
  const file = seedArtifactPath(slug, dir);
  if (!existsSync(file)) {
    return null;
  }
  try {
    const artifact = JSON.parse(readFileSync(file, "utf8"));
    if (!artifact || artifact.skill !== slug || typeof artifact.contentHash !== "string") {
      return { error: `invalid artifact shape in ${file}` };
    }
    return artifact;
  } catch (error) {
    return { error: `failed to parse ${file}: ${error instanceof Error ? error.message : String(error)}` };
  }
}

/**
 * Bind an artifact to a snapshot. Returns { ok: true } or { ok: false, reason }.
 * The contentHash check is the safety rail: any change to the Skill content
 * invalidates the frozen inspection / VT link until it is regenerated.
 */
export function validateSeedArtifact(artifact, snapshot) {
  if (!artifact) {
    return { ok: false, reason: "artifact missing" };
  }
  if (artifact.error) {
    return { ok: false, reason: artifact.error };
  }
  if (artifact.contentHash !== snapshot.contentHash) {
    return {
      ok: false,
      reason: `artifact contentHash ${String(artifact.contentHash).slice(0, 12)}… does not match current snapshot ${String(
        snapshot.contentHash
      ).slice(0, 12)}… — the Skill content changed; regenerate with scripts/seed-inspection.mjs`,
    };
  }
  return { ok: true };
}
