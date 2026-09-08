import { describe, expect, it } from "vitest";
import {
  buildSkillInspectionFailureFromError,
  buildSkillInspectionFailureFromStages,
  DEFAULT_SKILL_INSPECTION_STATUS,
  formatSkillInspectionFailureSummary,
  isSkillInspectionStatus,
  skillInspectionStageLabel,
  skillInspectionStatusLabel,
  SKILL_INSPECTION_STAGES,
  SKILL_INSPECTION_STATUSES,
} from "@skill-platform/storage";

describe("skill inspection status", () => {
  it("exposes the expected lifecycle values", () => {
    expect(SKILL_INSPECTION_STATUSES).toEqual(["inspecting", "completed", "failed"]);
    expect(SKILL_INSPECTION_STAGES).toEqual(["skillspector", "virustotal", "halucatch"]);
    expect(DEFAULT_SKILL_INSPECTION_STATUS).toBe("completed");
  });

  it("validates known statuses and labels them in zh-CN", () => {
    expect(isSkillInspectionStatus("inspecting")).toBe(true);
    expect(isSkillInspectionStatus("completed")).toBe(true);
    expect(isSkillInspectionStatus("failed")).toBe(true);
    expect(isSkillInspectionStatus("published")).toBe(false);
    expect(skillInspectionStatusLabel("inspecting")).toBe("审查中");
    expect(skillInspectionStatusLabel("completed")).toBe("审查完成");
    expect(skillInspectionStatusLabel("failed")).toBe("审查失败");
  });

  it("builds failure info from pipeline stage errors", () => {
    const failure = buildSkillInspectionFailureFromStages([
      { stage: "skillspector", message: "SkillSpector timed out after 60000ms." },
      { stage: "virustotal", message: "VirusTotal upload timed out." },
    ]);

    expect(failure.stages).toEqual(["skillspector", "virustotal"]);
    expect(failure.message).toContain("SkillSpector");
    expect(failure.message).toContain("VirusTotal");
    expect(formatSkillInspectionFailureSummary(failure)).toContain(
      `${skillInspectionStageLabel("skillspector")}、${skillInspectionStageLabel("virustotal")}`
    );
  });

  it("infers failure stages from unexpected errors when possible", () => {
    const failure = buildSkillInspectionFailureFromError(
      new Error("SkillSpector process exited with code 1")
    );

    expect(failure.stages).toEqual(["skillspector"]);
    expect(failure.message).toContain("SkillSpector");
  });
});
