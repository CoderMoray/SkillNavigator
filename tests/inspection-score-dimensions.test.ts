import { describe, expect, test } from "vitest";
import { inspectSkillSnapshot } from "@skill-platform/inspection-engine";
import type { FunctionalEvaluationReport } from "@skill-platform/evaluator";
import type { SkillSnapshot } from "@skill-platform/skill-spec";

const snapshot: SkillSnapshot = {
  manifest: {
    slug: "score-dimensions",
    name: "Score dimensions",
    description: "Use when you need a stable fixture for review score tests.",
    version: "1.0.0",
    license: "MIT-0",
    tags: ["testing"]
  },
  readme:
    "# Score dimensions\n\nUse this documented workflow to produce a consistent result. Expected output: a concise summary with clear constraints and acceptance criteria.",
  files: [
    {
      path: "SKILL.md",
      content:
        "---\nslug: score-dimensions\nname: Score dimensions\ndescription: Use when you need a stable fixture for review score tests.\nversion: 1.0.0\nlicense: MIT-0\ntags:\n  - testing\n---\n# Score dimensions\n\nExpected output: a concise summary with clear constraints and acceptance criteria.\n",
      size: 300,
      sha256: "skill-md"
    },
    {
      path: "tests/basic.json",
      content: '{"name":"basic"}',
      size: 16,
      sha256: "test-json"
    },
    {
      path: "examples/output.md",
      content: "# Example\n\nA concise summary.",
      size: 30,
      sha256: "example-md"
    }
  ],
  contentHash: "score-dimensions-hash",
  createdAt: "2026-01-01T00:00:00.000Z"
};

function evaluation(score: number): FunctionalEvaluationReport {
  return {
    id: `evaluation-${score}`,
    provider: "halucatch-adapter",
    status: score >= 80 ? "passed" : "failed",
    score,
    tasksTotal: 5,
    tasksPassed: score >= 80 ? 5 : 0,
    taskResults: [],
    findings: [],
    createdAt: "2026-01-01T00:00:00.000Z"
  };
}

describe("review score dimensions", () => {
  test("persists placeholder scores while findings and evaluation drive verdict and UI elsewhere", async () => {
    const previous = process.env.SKILLSPECTOR_ENABLED;
    const previousLicenseValidation = process.env.SKILL_LICENSE_VALIDATION_ENABLED;
    process.env.SKILLSPECTOR_ENABLED = "false";
    process.env.SKILL_LICENSE_VALIDATION_ENABLED = "true";
    try {
      const lowReliability = await inspectSkillSnapshot(snapshot, undefined, evaluation(62));
      const highReliability = await inspectSkillSnapshot(snapshot, undefined, evaluation(90));
      const missingLicenseAndTags = await inspectSkillSnapshot(
        {
          ...snapshot,
          manifest: {
            ...snapshot.manifest,
            license: undefined,
            tags: []
          }
        },
        undefined,
        evaluation(90)
      );
      const privacyFallback = await inspectSkillSnapshot(
        {
          ...snapshot,
          files: snapshot.files.map((file) =>
            file.path === "SKILL.md"
              ? { ...file, content: `${file.content}\nprintenv` }
              : file
          )
        },
        undefined,
        evaluation(90)
      );

      expect(lowReliability.scores).toEqual({ qualityScore: 100, securityScore: 100, reliabilityScore: 100 });
      expect(highReliability.scores).toEqual(lowReliability.scores);
      expect(missingLicenseAndTags.scores).toEqual(lowReliability.scores);
      expect(privacyFallback.scores).toEqual(lowReliability.scores);
      expect(privacyFallback.findings.some((finding) => finding.category === "privacy")).toBe(true);
      expect(lowReliability.scores).not.toHaveProperty("complianceScore");
      expect(lowReliability.scores).not.toHaveProperty("overallScore");
    } finally {
      if (previousLicenseValidation === undefined) {
        delete process.env.SKILL_LICENSE_VALIDATION_ENABLED;
      } else {
        process.env.SKILL_LICENSE_VALIDATION_ENABLED = previousLicenseValidation;
      }
      if (previous === undefined) {
        delete process.env.SKILLSPECTOR_ENABLED;
      } else {
        process.env.SKILLSPECTOR_ENABLED = previous;
      }
    }
  });
});
