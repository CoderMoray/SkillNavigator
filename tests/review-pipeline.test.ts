import { describe, expect, it } from "vitest";
import { resolveReviewStagesToRun } from "../packages/review-engine/src/review-pipeline.js";

describe("resolveReviewStagesToRun", () => {
  it("runs only failed stages when some stages already completed", () => {
    expect(
      resolveReviewStagesToRun({
        configuredStages: ["halucatch", "skillspector", "virustotal"],
        completedStages: ["skillspector", "virustotal"],
        failedStages: ["virustotal"],
      })
    ).toEqual(["halucatch", "virustotal"]);
  });

  it("honors explicit stage requests within the remaining work", () => {
    expect(
      resolveReviewStagesToRun({
        configuredStages: ["halucatch", "skillspector", "virustotal"],
        completedStages: ["skillspector"],
        failedStages: ["virustotal"],
        requestedStages: ["virustotal"],
      })
    ).toEqual(["virustotal"]);
  });
});
