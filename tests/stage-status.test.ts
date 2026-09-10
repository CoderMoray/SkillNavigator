import { describe, expect, it } from "vitest";
import {
  interruptedStagesFromStatuses,
  isPipelineIncomplete,
  resolveAggregateStatusFromStageStatuses,
  resolveHaluCatchStageStatus,
  resolvePipelineInspectionStatus,
  resolveSkillSpectorStageStatus,
  resolveVirusTotalStageStatus,
} from "@skill-platform/inspection-engine";
import {
  isStageRetryable,
  isTerminalStageStatus,
} from "../packages/inspection-engine/src/stage-status.js";

const ALL_STAGES = ["skillspector", "virustotal", "halucatch"] as const;

describe("resolvePipelineInspectionStatus", () => {
  it("returns completed when no stages are configured", () => {
    expect(resolvePipelineInspectionStatus({}, [])).toBe("completed");
  });

  it("returns inspecting when any configured stage is processing or missing", () => {
    expect(
      resolvePipelineInspectionStatus(
        { skillspector: "processing", virustotal: "passed", halucatch: "done" },
        ALL_STAGES
      )
    ).toBe("inspecting");
    expect(
      resolvePipelineInspectionStatus({ skillspector: "passed" }, ALL_STAGES)
    ).toBe("inspecting");
  });

  it("returns interrupted when any configured stage is interrupted", () => {
    expect(
      resolvePipelineInspectionStatus(
        { skillspector: "passed", virustotal: "interrupted", halucatch: "done" },
        ALL_STAGES
      )
    ).toBe("interrupted");
    expect(isPipelineIncomplete(
      { skillspector: "passed", virustotal: "interrupted", halucatch: "done" },
      ALL_STAGES
    )).toBe(true);
  });

  it("returns completed when all configured stages are terminal, including rejected", () => {
    expect(
      resolvePipelineInspectionStatus(
        { skillspector: "rejected", virustotal: "passed", halucatch: "done" },
        ALL_STAGES
      )
    ).toBe("completed");
    expect(
      resolvePipelineInspectionStatus(
        { skillspector: "passed", virustotal: "passed", halucatch: "done" },
        ALL_STAGES
      )
    ).toBe("completed");
  });
});

describe("interruptedStagesFromStatuses", () => {
  it("lists only interrupted stages", () => {
    expect(
      interruptedStagesFromStatuses({
        skillspector: "passed",
        virustotal: "interrupted",
        halucatch: "processing",
      })
    ).toEqual(["virustotal"]);
  });
});

describe("resolveAggregateStatusFromStageStatuses", () => {
  it("prefers inspecting while in flight", () => {
    expect(
      resolveAggregateStatusFromStageStatuses({
        inFlight: true,
        configuredStages: [...ALL_STAGES],
        stageStatuses: { skillspector: "passed", virustotal: "passed", halucatch: "done" },
      })
    ).toBe("inspecting");
  });

  it("returns interrupted before rejected", () => {
    expect(
      resolveAggregateStatusFromStageStatuses({
        inFlight: false,
        configuredStages: [...ALL_STAGES],
        stageStatuses: {
          skillspector: "rejected",
          virustotal: "interrupted",
          halucatch: "done",
        },
      })
    ).toBe("interrupted");
  });

  it("returns rejected when pipeline finished with rejected stages", () => {
    expect(
      resolveAggregateStatusFromStageStatuses({
        inFlight: false,
        configuredStages: [...ALL_STAGES],
        stageStatuses: {
          skillspector: "rejected",
          virustotal: "passed",
          halucatch: "done",
        },
        verdict: "rejected",
      })
    ).toBe("rejected");
  });
});

describe("stage terminal and retry semantics", () => {
  it("marks halucatch done as terminal but not passed", () => {
    expect(isTerminalStageStatus("halucatch", "done")).toBe(true);
    expect(isTerminalStageStatus("halucatch", "passed")).toBe(false);
  });

  it("treats processing and interrupted stages as retryable", () => {
    expect(isStageRetryable("virustotal", "processing")).toBe(true);
    expect(isStageRetryable("virustotal", "interrupted")).toBe(true);
    expect(isStageRetryable("virustotal", "passed")).toBe(false);
    expect(isStageRetryable("virustotal", undefined)).toBe(true);
  });
});

describe("resolve*StageStatus helpers", () => {
  it("maps integration failures to interrupted", () => {
    expect(resolveSkillSpectorStageStatus([], true)).toBe("interrupted");
    expect(resolveVirusTotalStageStatus([], true)).toBe("interrupted");
    expect(resolveHaluCatchStageStatus(true)).toBe("interrupted");
  });

  it("maps successful scans without reject findings to passed/done", () => {
    expect(resolveSkillSpectorStageStatus([], false)).toBe("passed");
    expect(resolveVirusTotalStageStatus([], false)).toBe("passed");
    expect(resolveHaluCatchStageStatus(false)).toBe("done");
  });
});
