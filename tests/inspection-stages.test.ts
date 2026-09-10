import { describe, expect, it } from "vitest";
import { formatInspectionStageProgress, resolveInspectionStageStates } from "../apps/web/lib/inspection-stages";

describe("resolveInspectionStageStates", () => {
  it("reads persisted stage statuses", () => {
    expect(
      resolveInspectionStageStates({
        skillspector: "passed",
        virustotal: "interrupted",
        halucatch: "processing",
      })
    ).toEqual([
      { stage: "skillspector", label: "SkillSpector", status: "passed", statusLabel: "通过" },
      { stage: "virustotal", label: "VirusTotal", status: "interrupted", statusLabel: "中断" },
      { stage: "halucatch", label: "HaluCatch", status: "processing", statusLabel: "审查中" },
    ]);
  });

  it("defaults missing stages to processing", () => {
    expect(resolveInspectionStageStates({ skillspector: "passed" })).toEqual([
      { stage: "skillspector", label: "SkillSpector", status: "passed", statusLabel: "通过" },
      { stage: "virustotal", label: "VirusTotal", status: "processing", statusLabel: "审查中" },
      { stage: "halucatch", label: "HaluCatch", status: "processing", statusLabel: "审查中" },
    ]);
  });
});

describe("formatInspectionStageProgress", () => {
  it("joins stage labels for plain-text output", () => {
    expect(
      formatInspectionStageProgress({
        skillspector: "passed",
        virustotal: "interrupted",
        halucatch: "processing",
      })
    ).toBe("SkillSpector: passed · VirusTotal: interrupted · HaluCatch: processing");
  });
});
