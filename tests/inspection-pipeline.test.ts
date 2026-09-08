import { describe, expect, it } from "vitest";
import { resolveInspectionStagesToRun } from "../packages/inspection-engine/src/inspection-pipeline.js";

describe("resolveInspectionStagesToRun", () => {
  it("runs only failed stages when some stages already completed", () => {
    expect(
      resolveInspectionStagesToRun({
        configuredStages: ["skillspector", "virustotal", "halucatch"],
        completedStages: ["skillspector", "virustotal"],
        failedStages: ["virustotal"],
      })
    ).toEqual(["virustotal", "halucatch"]);
  });

  it("honors explicit stage requests within the remaining work", () => {
    expect(
      resolveInspectionStagesToRun({
        configuredStages: ["skillspector", "virustotal", "halucatch"],
        completedStages: ["skillspector"],
        failedStages: ["virustotal"],
        requestedStages: ["virustotal"],
      })
    ).toEqual(["virustotal"]);
  });
});
