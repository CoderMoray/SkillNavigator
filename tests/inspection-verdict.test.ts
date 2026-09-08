import { describe, expect, test } from "vitest";
import {
  calculateInspectionVerdict,
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

describe("calculateInspectionVerdict", () => {
  test("rejects SkillSpector high severity findings", () => {
    const verdict = calculateInspectionVerdict([
      finding({ id: "skillspector-ss01-skill-md-0", severity: "high" })
    ]);
    expect(verdict).toBe("rejected");
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

  test("marks other SkillSpector findings as needs-inspection", () => {
    const verdict = calculateInspectionVerdict([
      finding({ id: "skillspector-ss03-skill-md-0", severity: "medium", confidence: 0.5 })
    ]);
    expect(verdict).toBe("needs-inspection");
  });

  test("rejects VirusTotal high severity findings", () => {
    expect(
      shouldRejectVirusTotalFinding(
        finding({ id: "virustotal-malicious-deadbeef-kaspersky", severity: "high" })
      )
    ).toBe(true);
  });

  test("marks VirusTotal medium findings as needs-inspection", () => {
    const verdict = calculateInspectionVerdict([
      finding({ id: "virustotal-suspicious-deadbeef-elastic", severity: "medium" })
    ]);
    expect(verdict).toBe("needs-inspection");
  });

  test("marks platform high findings as needs-inspection instead of rejecting", () => {
    const verdict = calculateInspectionVerdict([
      finding({ id: "environment-dump-skill-md", severity: "high", category: "privacy" })
    ]);
    expect(verdict).toBe("needs-inspection");
  });

  test("returns published when there are no findings", () => {
    expect(calculateInspectionVerdict([])).toBe("published");
  });

  test("rejects publish when SkillSpector is unavailable", () => {
    const verdict = calculateInspectionVerdict([
      finding({ id: "skillspector-unavailable", severity: "high" })
    ]);
    expect(verdict).toBe("rejected");
  });

  test("rejects publish when VirusTotal scan fails", () => {
    const verdict = calculateInspectionVerdict([
      finding({ id: "virustotal-scan-failed", severity: "high" })
    ]);
    expect(verdict).toBe("rejected");
  });

  test("rejects publish when HaluCatch is unavailable", () => {
    const verdict = calculateInspectionVerdict([
      finding({ id: "inspection-halucatch-unavailable", severity: "high", category: "reliability" })
    ]);
    expect(verdict).toBe("rejected");
  });
});
