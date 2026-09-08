import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";
import { inspectSkillSnapshot } from "@skill-platform/inspection-engine";
import type { FunctionalEvaluationReport } from "@skill-platform/evaluator";
import { readSkillPackage } from "@skill-platform/skill-spec";

const pythonCommand =
  process.env.SKILLSPECTOR_PYTHON ??
  (process.platform === "win32" ? "python" : "python3");
const canRunSkillSpector =
  process.env.SKILLSPECTOR_ENABLED?.toLowerCase() !== "false" &&
  spawnSync(pythonCommand, ["--version"], { stdio: "ignore" }).status === 0;

function evaluation(score: number): FunctionalEvaluationReport {
  return {
    id: `evaluation-${score}`,
    provider: "static-taskset",
    status: score >= 80 ? "passed" : "failed",
    score,
    tasksTotal: 1,
    tasksPassed: score >= 80 ? 1 : 0,
    taskResults: [],
    findings: [],
    createdAt: "2026-01-01T00:00:00.000Z"
  };
}

describe("SkillSpector security review adapter", () => {
  const run = canRunSkillSpector ? test : test.skip;

  run(
    "attaches SkillSpector static scan summary and security findings",
    async () => {
      const snapshot = await readSkillPackage(resolve("examples/demo-skill"));
      const report = await inspectSkillSnapshot(snapshot, undefined, evaluation(80));

      expect(report.skillSpector).toBeDefined();
      expect(report.skillSpector?.provider).toBe("skillspector-static");
      expect(report.skillSpector?.scanMode).toBe("static-only");
      expect(report.skillSpector?.riskScore).toBeGreaterThanOrEqual(0);
      expect(report.skillSpector?.riskScore).toBeLessThanOrEqual(100);
      expect(report.scores.securityScore).toBe(100);
      expect(report.findings.some((finding) => finding.id === "skillspector-unavailable")).toBe(false);
    },
    60_000
  );
});
