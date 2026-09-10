import { afterEach, describe, expect, test, vi } from "vitest";
import {
  inspectAndEvaluateSkillSnapshot,
  interruptedStagesFromStatuses,
} from "@skill-platform/inspection-engine";
import type { FunctionalEvaluationReport } from "@skill-platform/evaluator";

afterEach(() => {
  vi.unstubAllEnvs();
});

/**
 * Environment problems must surface as retryable stage failures, never as
 * fabricated findings or degraded provider results in the review report.
 */

const baseSnapshot = () => ({
  manifest: {
    slug: "stage-failure-demo",
    name: "Stage Failure Demo",
    description: "用于验证 review stage 失败语义的示例：当环境依赖缺失时如何暴露。",
    version: "1.0.0",
    tags: ["test"],
    "allowed-tools": ["Read"],
  },
  contentHash: "stage-failure-content-hash",
  readme:
    "# stage-failure-demo\n\n这是一个用于验证 review stage 失败语义的示例，包含足够长的说明文字以便通过 manifest 基础检查。",
  files: [
    { path: "SKILL.md", content: "# demo\n\n这是一个审查失败语义测试。\n" },
  ],
});

const halucatchAdapterEvaluation = (): FunctionalEvaluationReport => ({
  id: "eval_placeholder",
  provider: "halucatch-adapter",
  status: "passed",
  score: 100,
  tasksTotal: 5,
  tasksPassed: 5,
  taskResults: [],
  findings: [],
  createdAt: new Date().toISOString(),
});

describe("review stage failures do not masquerade as findings", () => {
  test("SkillSpector python missing -> interrupted stage only, no skillspector-unavailable finding", async () => {
    vi.stubEnv("HALUCATCH_ENABLED", "false"); // isolate SkillSpector
    vi.stubEnv("SKILLSPECTOR_ENABLED", "true");
    vi.stubEnv("SKILLSPECTOR_PYTHON", "/nonexistent-python-for-test");

    const { inspection, stageStatuses } = await inspectAndEvaluateSkillSnapshot(
      baseSnapshot(),
      undefined,
      halucatchAdapterEvaluation()
    );

    expect(interruptedStagesFromStatuses(stageStatuses)).toContain("skillspector");
    expect(
      inspection.findings.some((finding) => finding.id === "skillspector-unavailable")
    ).toBe(false);
    expect(inspection.skillSpector).toBeUndefined();

    vi.unstubAllEnvs();
  });

  test("HaluCatch python missing -> interrupted stage only, no inspection-halucatch-unavailable finding", async () => {
    vi.stubEnv("HALUCATCH_ENABLED", "true");
    vi.stubEnv("HALUCATCH_PYTHON", "/nonexistent-python-for-test");
    vi.stubEnv("SKILLSPECTOR_ENABLED", "false");
    vi.stubEnv("VIRUSTOTAL_ENABLED", "false");

    const { inspection, evaluation, stageStatuses } = await inspectAndEvaluateSkillSnapshot(baseSnapshot());

    expect(interruptedStagesFromStatuses(stageStatuses)).toContain("halucatch");
    expect(
      inspection.findings.some((finding) => finding.id === "inspection-halucatch-unavailable")
    ).toBe(false);
    expect(evaluation.provider).toBe("static-taskset"); // placeholder, not a fake adapter result

    vi.unstubAllEnvs();
  });
});
