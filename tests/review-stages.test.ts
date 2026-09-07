import { describe, expect, it } from "vitest";
import { formatReviewStageProgress, resolveReviewStageStates } from "../apps/web/lib/review-stages";

describe("resolveReviewStageStates", () => {
  it("marks completed, failed, and pending stages", () => {
    expect(
      resolveReviewStageStates(["skillspector", "virustotal"], ["virustotal"])
    ).toEqual([
      { stage: "skillspector", label: "SkillSpector", status: "completed", statusLabel: "已完成" },
      { stage: "virustotal", label: "VirusTotal", status: "failed", statusLabel: "失败" },
      { stage: "halucatch", label: "HaluCatch", status: "pending", statusLabel: "待审查" },
    ]);
  });
});

describe("formatReviewStageProgress", () => {
  it("joins stage labels for plain-text output", () => {
    expect(formatReviewStageProgress(["skillspector"], ["virustotal"])).toBe(
      "SkillSpector：已完成 · VirusTotal：失败 · HaluCatch：待审查"
    );
  });
});
