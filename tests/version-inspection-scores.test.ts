import { describe, expect, test } from "vitest";
import {
  displayInspectionScore,
  formatHaluCatchInspectionScore,
  formatSkillSpectorInspectionScore,
  formatVersionInspectionScoresSummary,
  formatVirusTotalInspectionScore,
  resolveVersionInspectionScoreParts
} from "../apps/web/lib/version-inspection-scores";
import type { FunctionalEvaluationReport, InspectionReport } from "../apps/web/lib/types";

const baseInspection = (overrides: Partial<InspectionReport> = {}): InspectionReport => ({
  id: "inspection_test",
  skillSlug: "demo",
  skillName: "Demo",
  version: "1.0.0",
  contentHash: "abc",
  verdict: "published",
  scores: { qualityScore: 100, securityScore: 100, reliabilityScore: 100 },
  findings: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  ...overrides
});

const baseEvaluation = (overrides: Partial<FunctionalEvaluationReport> = {}): FunctionalEvaluationReport => ({
  id: "eval_test",
  provider: "halucatch-adapter",
  status: "passed",
  score: 85,
  tasksTotal: 5,
  tasksPassed: 4,
  taskResults: [],
  findings: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  ...overrides
});

describe("version inspection scores", () => {
  test("formats SkillSpector safety score from riskScore", () => {
    expect(
      formatSkillSpectorInspectionScore(
        baseInspection({
          skillSpector: {
            provider: "skillspector-static",
            riskScore: 10,
            riskSeverity: "LOW",
            recommendation: "SAFE",
            scanMode: "static-only"
          }
        })
      )
    ).toBe("90/100");
  });

  test("formats VirusTotal passed engines over total", () => {
    expect(
      formatVirusTotalInspectionScore(
        baseInspection({
          virusTotal: {
            provider: "virustotal",
            sha256: "a".repeat(64),
            status: "completed",
            malicious: 1,
            suspicious: 0,
            harmless: 70,
            undetected: 5,
            totalEngines: 76
          }
        })
      )
    ).toBe("75/76");
  });

  test("returns placeholders when scan data is unavailable", () => {
    expect(formatSkillSpectorInspectionScore(undefined)).toBe("?/100");
    expect(formatVirusTotalInspectionScore(undefined)).toBe("?/?");
    expect(formatHaluCatchInspectionScore(undefined)).toBe("?/100");
    expect(displayInspectionScore("?/100")).toBe("—");
    expect(displayInspectionScore("90/100")).toBe("90/100");
  });

  test("builds summary matching skillnav status format", () => {
    const parts = resolveVersionInspectionScoreParts(
      baseInspection({
        skillSpector: {
          provider: "skillspector-static",
          riskScore: 15,
          riskSeverity: "LOW",
          recommendation: "SAFE",
          scanMode: "static-only"
        },
        virusTotal: {
          provider: "virustotal",
          sha256: "b".repeat(64),
          status: "completed",
          malicious: 0,
          suspicious: 0,
          harmless: 74,
          undetected: 0,
          totalEngines: 74
        }
      }),
      baseEvaluation({ score: 62 })
    );

    expect(parts).toEqual({
      skillSpector: "85/100",
      virusTotal: "74/74",
      haluCatch: "62/100"
    });
    expect(formatVersionInspectionScoresSummary(
      baseInspection({
        skillSpector: {
          provider: "skillspector-static",
          riskScore: 15,
          riskSeverity: "LOW",
          recommendation: "SAFE",
          scanMode: "static-only"
        },
        virusTotal: {
          provider: "virustotal",
          sha256: "b".repeat(64),
          status: "completed",
          malicious: 0,
          suspicious: 0,
          harmless: 74,
          undetected: 0,
          totalEngines: 74
        }
      }),
      baseEvaluation({ score: 62 })
    )).toBe("SkillSpector: 85/100 · VirusTotal: 74/74 · HaluCatch: 62/100");
  });
});
