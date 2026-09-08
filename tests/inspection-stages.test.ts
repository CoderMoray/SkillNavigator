import { describe, expect, it } from "vitest";
import { formatInspectionStageProgress, resolveInspectionStageStates } from "../apps/web/lib/inspection-stages";

describe("resolveInspectionStageStates", () => {
  it("marks completed, failed, and pending stages", () => {
    expect(
      resolveInspectionStageStates(["skillspector", "virustotal"], ["virustotal"])
    ).toEqual([
      { stage: "skillspector", label: "SkillSpector", status: "completed", statusLabel: "已完成" },
      { stage: "virustotal", label: "VirusTotal", status: "failed", statusLabel: "失败" },
      { stage: "halucatch", label: "HaluCatch", status: "pending", statusLabel: "待审查" },
    ]);
  });
});

describe("formatInspectionStageProgress", () => {
  it("joins stage labels for plain-text output", () => {
    expect(formatInspectionStageProgress(["skillspector"], ["virustotal"])).toBe(
      "SkillSpector：已完成 · VirusTotal：失败 · HaluCatch：待审查"
    );
  });
});
