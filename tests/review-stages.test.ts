import { describe, expect, it } from "vitest";
import { formatReviewStageProgress, resolveReviewStageStates } from "../apps/web/lib/review-stages";

describe("resolveReviewStageStates", () => {
  it("marks completed, failed, and pending stages", () => {
    expect(
      resolveReviewStageStates(["halucatch", "virustotal"], ["virustotal"])
    ).toEqual([
      { stage: "halucatch", label: "HaluCatch", status: "completed", statusLabel: "已完成" },
      { stage: "skillspector", label: "SkillSpector", status: "pending", statusLabel: "待审查" },
      { stage: "virustotal", label: "VirusTotal", status: "failed", statusLabel: "失败" },
    ]);
  });
});

describe("formatReviewStageProgress", () => {
  it("joins stage labels for plain-text output", () => {
    expect(formatReviewStageProgress(["halucatch"], ["skillspector"])).toBe(
      "HaluCatch：已完成 · SkillSpector：失败 · VirusTotal：待审查"
    );
  });
});
