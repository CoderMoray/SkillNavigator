import { describe, expect, it } from "vitest";
import {
  buildSkillReviewFailureFromError,
  buildSkillReviewFailureFromStages,
  DEFAULT_SKILL_REVIEW_STATUS,
  formatSkillReviewFailureSummary,
  isSkillReviewStatus,
  skillReviewStageLabel,
  skillReviewStatusLabel,
  SKILL_REVIEW_STAGES,
  SKILL_REVIEW_STATUSES,
} from "@skill-platform/storage";

describe("skill review status", () => {
  it("exposes the expected lifecycle values", () => {
    expect(SKILL_REVIEW_STATUSES).toEqual(["reviewing", "completed", "failed"]);
    expect(SKILL_REVIEW_STAGES).toEqual(["halucatch", "skillspector", "virustotal"]);
    expect(DEFAULT_SKILL_REVIEW_STATUS).toBe("completed");
  });

  it("validates known statuses and labels them in zh-CN", () => {
    expect(isSkillReviewStatus("reviewing")).toBe(true);
    expect(isSkillReviewStatus("completed")).toBe(true);
    expect(isSkillReviewStatus("failed")).toBe(true);
    expect(isSkillReviewStatus("published")).toBe(false);
    expect(skillReviewStatusLabel("reviewing")).toBe("审查中");
    expect(skillReviewStatusLabel("completed")).toBe("审查完成");
    expect(skillReviewStatusLabel("failed")).toBe("审查失败");
  });

  it("builds failure info from pipeline stage errors", () => {
    const failure = buildSkillReviewFailureFromStages([
      { stage: "skillspector", message: "SkillSpector timed out after 60000ms." },
      { stage: "virustotal", message: "VirusTotal upload timed out." },
    ]);

    expect(failure.stages).toEqual(["skillspector", "virustotal"]);
    expect(failure.message).toContain("SkillSpector");
    expect(failure.message).toContain("VirusTotal");
    expect(formatSkillReviewFailureSummary(failure)).toContain(
      `${skillReviewStageLabel("skillspector")}、${skillReviewStageLabel("virustotal")}`
    );
  });

  it("infers failure stages from unexpected errors when possible", () => {
    const failure = buildSkillReviewFailureFromError(
      new Error("SkillSpector process exited with code 1")
    );

    expect(failure.stages).toEqual(["skillspector"]);
    expect(failure.message).toContain("SkillSpector");
  });
});
