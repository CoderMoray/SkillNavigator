import { describe, expect, it } from "vitest";
import {
  DEFAULT_SKILL_REVIEW_STATUS,
  isSkillReviewStatus,
  skillReviewStatusLabel,
  SKILL_REVIEW_STATUSES,
} from "@skill-platform/storage";

describe("skill review status", () => {
  it("exposes the expected lifecycle values", () => {
    expect(SKILL_REVIEW_STATUSES).toEqual(["reviewing", "completed", "failed"]);
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
});
