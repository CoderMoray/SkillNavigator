import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { loadSeedArtifact, validateSeedArtifact } from "../scripts/seed-artifact.mjs";

describe("seed-artifact helpers", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), "skillnav-seed-artifact-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  const snapshot = { contentHash: "a".repeat(64) };

  test("loadSeedArtifact returns null when the file is absent", () => {
    expect(loadSeedArtifact("skillnav-skill", dir)).toBeNull();
  });

  test("loadSeedArtifact returns { error } for malformed JSON / wrong shape", () => {
    writeFileSync(path.join(dir, "skillnav-skill.json"), "{not json");
    expect(loadSeedArtifact("skillnav-skill", dir)).toHaveProperty("error");

    writeFileSync(path.join(dir, "skillnav-skill.json"), JSON.stringify({ skill: "other" }));
    expect(loadSeedArtifact("skillnav-skill", dir)).toHaveProperty("error");
  });

  test("loadSeedArtifact reads a valid artifact", () => {
    const artifact = { skill: "skillnav-skill", contentHash: snapshot.contentHash, inspection: {} };
    writeFileSync(path.join(dir, "skillnav-skill.json"), JSON.stringify(artifact));
    expect(loadSeedArtifact("skillnav-skill", dir)).toEqual(artifact);
  });

  test("validateSeedArtifact accepts a matching contentHash", () => {
    const artifact = { skill: "skillnav-skill", contentHash: snapshot.contentHash };
    expect(validateSeedArtifact(artifact, snapshot)).toEqual({ ok: true });
  });

  test("validateSeedArtifact rejects a stale contentHash with a regeneration hint", () => {
    const artifact = { skill: "skillnav-skill", contentHash: "b".repeat(64) };
    const result = validateSeedArtifact(artifact, snapshot);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("seed-inspection.mjs");
    }
  });

  test("validateSeedArtifact rejects a missing artifact and artifact errors", () => {
    expect(validateSeedArtifact(null, snapshot).ok).toBe(false);
    expect(validateSeedArtifact({ error: "broken" }, snapshot).ok).toBe(false);
  });
});
