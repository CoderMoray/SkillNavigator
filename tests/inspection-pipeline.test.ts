import { describe, expect, it } from "vitest";
import { resolveInspectionStagesToRun } from "../packages/inspection-engine/src/inspection-pipeline.js";

describe("resolveInspectionStagesToRun", () => {
  it("runs only interrupted or missing stages when some stages already finished", () => {
    expect(
      resolveInspectionStagesToRun({
        configuredStages: ["skillspector", "virustotal", "halucatch"],
        stageStatuses: {
          skillspector: "passed",
          virustotal: "interrupted",
        },
      })
    ).toEqual(["virustotal", "halucatch"]);
  });

  it("honors explicit stage requests within the remaining work", () => {
    expect(
      resolveInspectionStagesToRun({
        configuredStages: ["skillspector", "virustotal", "halucatch"],
        stageStatuses: {
          skillspector: "passed",
          virustotal: "interrupted",
        },
        requestedStages: ["virustotal"],
      })
    ).toEqual(["virustotal"]);
  });

  it("skips terminal passed, rejected, and done stages", () => {
    expect(
      resolveInspectionStagesToRun({
        configuredStages: ["skillspector", "virustotal", "halucatch"],
        stageStatuses: {
          skillspector: "rejected",
          virustotal: "passed",
          halucatch: "done",
        },
      })
    ).toEqual([]);
  });
});
