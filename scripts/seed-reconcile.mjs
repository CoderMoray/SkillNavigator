/**
 * Inspection-stage reconcile: "check and fill the gaps", never re-publish.
 *
 * Rows written before the stage-status model — and versions created through
 * `publishSnapshot` (seed/bootstrap), which never persisted stage statuses —
 * carry no `inspectionStageStatuses`. That leaves `skillnav status` with an
 * empty stage line while `inspectionStatus` says "completed".
 *
 * This helper derives the missing stages from the inspection report and the
 * evaluation the row already carries, using the same engine rules as the live
 * pipeline, then fills only what is absent:
 *
 * - existing values are never overwritten;
 * - `inspectionStatus` is deliberately left untouched (recomputing it from a
 *   partially filled row could turn a correct "completed" into "inspecting");
 * - a stage with no data to infer from is reported, never guessed.
 */
import {
  isSkillSpectorInspectionFinding,
  resolveHaluCatchStageStatus,
  resolveSkillSpectorStageStatus,
  resolveVirusTotalStageStatus,
} from "@skill-platform/inspection-engine";

export const RECONCILABLE_STAGES = ["skillspector", "virustotal", "halucatch"];

function hasSkillSpectorData(inspection, findings) {
  if (findings.some(isSkillSpectorInspectionFinding)) {
    return true;
  }
  const scores = inspection.scores;
  return Boolean(
    scores &&
      (scores.qualityScore !== undefined ||
        scores.securityScore !== undefined ||
        scores.reliabilityScore !== undefined)
  );
}

/** Derive stage statuses from what the row already stores (no network, no engine run). */
export function inferStageStatuses(entry) {
  const inspection =
    entry?.inspection && typeof entry.inspection === "object" ? entry.inspection : {};
  const findings = Array.isArray(inspection.findings) ? inspection.findings : [];
  const inferred = {};

  if (hasSkillSpectorData(inspection, findings)) {
    inferred.skillspector = resolveSkillSpectorStageStatus(findings, false);
  }

  const virustotal = inspection.virusTotal;
  if (
    virustotal &&
    typeof virustotal === "object" &&
    virustotal.status !== "failed" &&
    virustotal.status !== "not_found"
  ) {
    const malicious = Number(virustotal.malicious ?? 0);
    const suspicious = Number(virustotal.suspicious ?? 0);
    if (malicious === 0 && suspicious === 0) {
      inferred.virustotal = "passed";
    } else if (resolveVirusTotalStageStatus(findings, false) === "rejected") {
      inferred.virustotal = "rejected";
    }
    // Detections without a reject-level finding: too ambiguous to fill.
  }

  if (entry?.evaluation) {
    inferred.halucatch = resolveHaluCatchStageStatus(false);
  }

  return inferred;
}

/**
 * Reconcile one Skill (all of its versions).
 *
 * @returns {Promise<{slug: string, found: boolean, patched: string[], unresolved: string[], skipped: string[]}>}
 */
export async function reconcileSkillStageStatuses(registryStore, slug, { dryRun = false } = {}) {
  const skill = await registryStore.getSkill(slug);
  if (!skill) {
    return { slug, found: false, patched: [], unresolved: [], skipped: [] };
  }

  const patched = [];
  const unresolved = [];
  const skipped = [];
  const versions = skill.versions ?? {};

  for (const [version, entry] of Object.entries(versions)) {
    if (!entry || typeof entry !== "object") {
      continue;
    }
    const existing = entry.inspectionStageStatuses ?? {};
    const inferred = inferStageStatuses(entry);

    if (Object.keys(inferred).length === 0) {
      // Nothing at all to infer from (no inspection report / evaluation).
      skipped.push(`${slug}@${version}`);
      continue;
    }

    const missing = {};
    for (const [stage, value] of Object.entries(inferred)) {
      if (value && !existing[stage]) {
        missing[stage] = value;
      }
    }
    for (const stage of RECONCILABLE_STAGES) {
      if (!existing[stage] && !inferred[stage]) {
        unresolved.push(`${slug}@${version}.${stage}`);
      }
    }
    if (Object.keys(missing).length === 0) {
      continue;
    }

    if (dryRun) {
      for (const [stage, value] of Object.entries(missing)) {
        patched.push(`${slug}@${version}.${stage}=${value} (dry-run)`);
      }
      continue;
    }

    const applied = await registryStore.backfillInspectionStageStatuses(slug, version, missing);
    for (const stage of applied) {
      patched.push(`${slug}@${version}.${stage}=${missing[stage]}`);
    }
  }

  return { slug, found: true, patched, unresolved, skipped };
}
