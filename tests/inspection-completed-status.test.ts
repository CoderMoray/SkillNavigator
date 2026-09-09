import { describe, expect, test } from "vitest";
import {
  calculateCompletedInspectionStatus,
  shouldRejectSkillSpectorFinding,
  shouldRejectVirusTotalFinding,
  type InspectionFinding
} from "@skill-platform/inspection-engine";

function finding(
  partial: Pick<InspectionFinding, "id" | "severity"> &
    Partial<Pick<InspectionFinding, "confidence" | "category" | "title" | "message" | "recommendation">>
): InspectionFinding {
  return {
    category: partial.category ?? "security",
    title: partial.title ?? "Test finding",
    message: partial.message ?? "Test message",
    recommendation: partial.recommendation ?? "Review this finding.",
    ...partial
  };
}

describe("calculateCompletedInspectionStatus", () => {
  test("rejects SkillSpector high severity findings", () => {
    const status = calculateCompletedInspectionStatus([
      finding({ id: "skillspector-ss01-skill-md-0", severity: "high" })
    ]);
    expect(status).toBe("rejected");
  });

  test("rejects SkillSpector medium findings with confidence >= 90%", () => {
    expect(
      shouldRejectSkillSpectorFinding(
        finding({ id: "skillspector-ss02-skill-md-1", severity: "medium", confidence: 0.9 })
      )
    ).toBe(true);
    expect(
      shouldRejectSkillSpectorFinding(
        finding({ id: "skillspector-ss02-skill-md-2", severity: "medium", confidence: 0.89 })
      )
    ).toBe(false);
  });

  test("marks other SkillSpector findings as completed", () => {
    const status = calculateCompletedInspectionStatus([
      finding({ id: "skillspector-ss03-skill-md-0", severity: "medium", confidence: 0.5 })
    ]);
    expect(status).toBe("completed");
  });

  test("rejects VirusTotal high severity findings", () => {
    expect(
      shouldRejectVirusTotalFinding(
        finding({ id: "virustotal-malicious-deadbeef-kaspersky", severity: "high" })
      )
    ).toBe(true);
  });

  test("marks VirusTotal medium findings as completed", () => {
    const status = calculateCompletedInspectionStatus([
      finding({ id: "virustotal-suspicious-deadbeef-elastic", severity: "medium" })
    ]);
    expect(status).toBe("completed");
  });

  test("marks platform high findings as completed instead of rejecting", () => {
    const status = calculateCompletedInspectionStatus([
      finding({ id: "environment-dump-skill-md", severity: "high", category: "privacy" })
    ]);
    expect(status).toBe("completed");
  });

  test("returns completed when there are no findings", () => {
    expect(calculateCompletedInspectionStatus([])).toBe("completed");
  });

  test("rejects publish when SkillSpector is unavailable", () => {
    const status = calculateCompletedInspectionStatus([
      finding({ id: "skillspector-unavailable", severity: "high" })
    ]);
    expect(status).toBe("rejected");
  });

  test("rejects publish when VirusTotal scan fails", () => {
    const status = calculateCompletedInspectionStatus([
      finding({ id: "virustotal-scan-failed", severity: "high" })
    ]);
    expect(status).toBe("rejected");
  });

  test("rejects publish when HaluCatch is unavailable", () => {
    const status = calculateCompletedInspectionStatus([
      finding({ id: "inspection-halucatch-unavailable", severity: "high", category: "reliability" })
    ]);
    expect(status).toBe("rejected");
  });
});
