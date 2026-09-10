import { describe, expect, it } from "vitest";
import {
  buildSkillInspectionFailureFromError,
  buildSkillInspectionFailureFromStages,
  classifyInspectionFailureStatus,
  isInspectionInFlight,
  resolveInspectionAggregateStatus,
  DEFAULT_SKILL_INSPECTION_STATUS,
  formatSkillInspectionFailureSummary,
  isSkillInspectionStatus,
  normalizeSkillInspectionStatus,
  skillInspectionStageLabel,
  skillInspectionStatusLabel,
  SKILL_INSPECTION_STAGES,
  SKILL_INSPECTION_STATUSES,
} from "@skill-platform/storage";

describe("skill inspection status", () => {
  it("exposes the expected lifecycle values", () => {
    expect(SKILL_INSPECTION_STATUSES).toEqual(["inspecting", "completed", "interrupted", "rejected"]);
    expect(SKILL_INSPECTION_STAGES).toEqual(["skillspector", "virustotal", "halucatch"]);
    expect(DEFAULT_SKILL_INSPECTION_STATUS).toBe("completed");
  });

  it("validates known statuses and labels them in zh-CN", () => {
    expect(isSkillInspectionStatus("inspecting")).toBe(true);
    expect(isSkillInspectionStatus("completed")).toBe(true);
    expect(isSkillInspectionStatus("interrupted")).toBe(true);
    expect(isSkillInspectionStatus("rejected")).toBe(true);
    expect(isSkillInspectionStatus("published")).toBe(false);
    expect(skillInspectionStatusLabel("inspecting")).toBe("审查中");
    expect(skillInspectionStatusLabel("completed")).toBe("审查完成");
    expect(skillInspectionStatusLabel("interrupted")).toBe("审查中断");
    expect(skillInspectionStatusLabel("rejected")).toBe("审查拒绝");
  });

  it("normalizes legacy failed values", () => {
    expect(normalizeSkillInspectionStatus("failed")).toBe("interrupted");
  });

  it("treats in-flight inspection as inspecting until ended", () => {
    expect(
      isInspectionInFlight({
        inspectionStatus: "inspecting",
        inspectionStartedAt: "2026-09-08T00:00:00.000Z",
      })
    ).toBe(true);
    expect(
      resolveInspectionAggregateStatus({
        inspectionStatus: "inspecting",
        inspectionStartedAt: "2026-09-08T00:00:00.000Z",
      })
    ).toBe("inspecting");
    expect(
      resolveInspectionAggregateStatus({
        inspectionStatus: "completed",
        inspectionStartedAt: "2026-09-08T00:00:00.000Z",
        inspectionEndedAt: "2026-09-08T00:05:00.000Z",
        verdict: "published",
      })
    ).toBe("completed");
    expect(
      resolveInspectionAggregateStatus({
        inspectionStatus: "completed",
        inspectionStartedAt: "2026-09-08T00:00:00.000Z",
        inspectionEndedAt: "2026-09-08T00:05:00.000Z",
        verdict: "rejected",
      })
    ).toBe("rejected");
    expect(
      resolveInspectionAggregateStatus({
        inspectionStatus: "interrupted",
        inspectionStartedAt: "2026-09-08T00:00:00.000Z",
        inspectionEndedAt: "2026-09-08T00:01:00.000Z",
      })
    ).toBe("interrupted");
    expect(
      resolveInspectionAggregateStatus({
        inspectionStatus: "completed",
        stageStatuses: {
          skillspector: "passed",
          virustotal: "interrupted",
        },
      })
    ).toBe("interrupted");
    expect(
      resolveInspectionAggregateStatus({
        inspectionStatus: "completed",
        stageStatuses: {
          skillspector: "rejected",
          virustotal: "passed",
          halucatch: "done",
        },
      })
    ).toBe("rejected");
  });

  it("classifies pipeline failures as interrupted (inspection did not complete)", () => {
    expect(
      classifyInspectionFailureStatus({
        stages: [],
        message: "审查任务因服务重启中断，请重试未完成或失败的审查环节。",
      })
    ).toBe("interrupted");
    expect(
      classifyInspectionFailureStatus({
        stages: ["virustotal"],
        message: "VirusTotal scan timed out",
      })
    ).toBe("interrupted");
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
