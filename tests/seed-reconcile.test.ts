import { describe, expect, test } from "vitest";
import { inferStageStatuses, reconcileSkillStageStatuses } from "../scripts/seed-reconcile.mjs";

/**
 * Minimal RegistryStore fake. `backfillInspectionStageStatuses` mirrors the real
 * contract: only absent stages are written and the stages actually patched are
 * returned.
 */
class FakeRegistryStore {
  constructor(skill) {
    this.skill = skill;
    this.calls = [];
  }

  async getSkill(slug) {
    return slug === this.skill?.slug ? this.skill : undefined;
  }

  async backfillInspectionStageStatuses(slug, version, stageStatuses) {
    this.calls.push({ slug, version, stageStatuses });
    const entry = this.skill.versions[version];
    const merged = { ...(entry.inspectionStageStatuses ?? {}) };
    const applied = [];
    for (const [stage, value] of Object.entries(stageStatuses)) {
      if (value && !merged[stage]) {
        merged[stage] = value;
        applied.push(stage);
      }
    }
    entry.inspectionStageStatuses = merged;
    return applied;
  }
}

const fullInspection = () => ({
  verdict: "published",
  scores: { qualityScore: 90, securityScore: 95, reliabilityScore: 88 },
  findings: [],
  virusTotal: { status: "completed", malicious: 0, suspicious: 0, totalEngines: 74 },
});

function skillFixture(entryOverrides = {}) {
  return {
    slug: "skillnav-skill",
    latestVersion: "1.0.0",
    inspectionStatus: "completed",
    versions: {
      "1.0.0": {
        version: "1.0.0",
        status: "published",
        inspectionStatus: "completed",
        inspection: fullInspection(),
        evaluation: { provider: "halucatch-adapter", score: 80 },
        ...entryOverrides,
      },
    },
  };
}

describe("inferStageStatuses", () => {
  test("derives all three stages from a complete report", () => {
    expect(inferStageStatuses(skillFixture().versions["1.0.0"])).toEqual({
      skillspector: "passed",
      virustotal: "passed",
      halucatch: "done",
    });
  });

  test("skips stages that have no data to infer from", () => {
    const entry = { inspection: { verdict: "published", scores: { securityScore: 90 }, findings: [] } };
    expect(inferStageStatuses(entry)).toEqual({ skillspector: "passed" });
  });

  test("leaves detections without a reject-level finding unresolved", () => {
    const entry = {
      inspection: { ...fullInspection(), virusTotal: { status: "completed", malicious: 3, suspicious: 0 } },
    };
    expect(inferStageStatuses(entry).virustotal).toBeUndefined();
  });

  test("treats a failed / missing VirusTotal lookup as no data", () => {
    const entry = { inspection: { ...fullInspection(), virusTotal: { status: "not_found" } } };
    expect(inferStageStatuses(entry).virustotal).toBeUndefined();
  });
});

describe("reconcileSkillStageStatuses", () => {
  test("fills the missing stages and leaves inspectionStatus alone", async () => {
    const store = new FakeRegistryStore(skillFixture());

    const result = await reconcileSkillStageStatuses(store, "skillnav-skill");

    expect(store.calls).toHaveLength(1);
    expect(store.calls[0].stageStatuses).toEqual({
      skillspector: "passed",
      virustotal: "passed",
      halucatch: "done",
    });
    expect(result.patched).toEqual([
      "skillnav-skill@1.0.0.skillspector=passed",
      "skillnav-skill@1.0.0.virustotal=passed",
      "skillnav-skill@1.0.0.halucatch=done",
    ]);
    expect(result.unresolved).toEqual([]);
    // Recomputing this could turn a correct "completed" into "inspecting".
    expect(store.skill.versions["1.0.0"].inspectionStatus).toBe("completed");
  });

  test("never overwrites an existing stage value", async () => {
    const store = new FakeRegistryStore(
      skillFixture({ inspectionStageStatuses: { skillspector: "rejected", halucatch: "done" } })
    );

    const result = await reconcileSkillStageStatuses(store, "skillnav-skill");

    expect(result.patched).toEqual(["skillnav-skill@1.0.0.virustotal=passed"]);
    expect(store.skill.versions["1.0.0"].inspectionStageStatuses).toEqual({
      skillspector: "rejected",
      halucatch: "done",
      virustotal: "passed",
    });
  });

  test("is idempotent", async () => {
    const store = new FakeRegistryStore(skillFixture());

    await reconcileSkillStageStatuses(store, "skillnav-skill");
    const second = await reconcileSkillStageStatuses(store, "skillnav-skill");

    expect(second.patched).toEqual([]);
    expect(store.calls).toHaveLength(1);
  });

  test("dry-run reports without writing", async () => {
    const store = new FakeRegistryStore(skillFixture());

    const result = await reconcileSkillStageStatuses(store, "skillnav-skill", { dryRun: true });

    expect(store.calls).toEqual([]);
    expect(result.patched).toHaveLength(3);
    expect(result.patched[0]).toContain("(dry-run)");
  });

  test("reports stages it cannot infer instead of guessing", async () => {
    const store = new FakeRegistryStore(
      skillFixture({
        inspection: { verdict: "published", scores: { securityScore: 90 }, findings: [] },
      })
    );

    const result = await reconcileSkillStageStatuses(store, "skillnav-skill");

    expect(result.patched).toEqual([
      "skillnav-skill@1.0.0.skillspector=passed",
      "skillnav-skill@1.0.0.halucatch=done",
    ]);
    expect(result.unresolved).toEqual(["skillnav-skill@1.0.0.virustotal"]);
  });

  test("skips versions with no inspection data at all", async () => {
    const store = new FakeRegistryStore(skillFixture({ inspection: undefined, evaluation: undefined }));

    const result = await reconcileSkillStageStatuses(store, "skillnav-skill");

    expect(result.patched).toEqual([]);
    expect(result.skipped).toEqual(["skillnav-skill@1.0.0"]);
  });

  test("reports a missing skill", async () => {
    const store = new FakeRegistryStore(skillFixture());

    const result = await reconcileSkillStageStatuses(store, "other-skill");

    expect(result.found).toBe(false);
    expect(result.patched).toEqual([]);
  });
});
