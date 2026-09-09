import { describe, expect, test } from "vitest";
import {
  HALUCATCH_CODE_ENGINEERED_WEIGHTS,
  HALUCATCH_DIMENSIONS,
  HALUCATCH_METHODOLOGY_WEIGHTS,
  normalizeHaluCatchSkillType,
  resolveHaluCatchDimensionWeights,
  weightedHaluCatchScore
} from "@skill-platform/evaluator";

const MIN_WEIGHT = 0.1;

function assertProfile(weights: Readonly<Record<string, number>>): void {
  const total = HALUCATCH_DIMENSIONS.reduce((sum, dimension) => sum + weights[dimension.key], 0);
  expect(total).toBeCloseTo(1, 5);
  for (const dimension of HALUCATCH_DIMENSIONS) {
    expect(weights[dimension.key]).toBeGreaterThanOrEqual(MIN_WEIGHT);
  }
}

describe("HaluCatch dimension weights", () => {
  test("code-engineered profile emphasizes code and foundation", () => {
    assertProfile(HALUCATCH_CODE_ENGINEERED_WEIGHTS);
    expect(HALUCATCH_CODE_ENGINEERED_WEIGHTS.code).toBe(0.3);
    expect(HALUCATCH_CODE_ENGINEERED_WEIGHTS.foundation).toBe(0.2);
  });

  test("methodology profile emphasizes rules and guardrails", () => {
    assertProfile(HALUCATCH_METHODOLOGY_WEIGHTS);
    expect(HALUCATCH_METHODOLOGY_WEIGHTS.rules).toBe(0.3);
    expect(HALUCATCH_METHODOLOGY_WEIGHTS.guardrails).toBe(0.3);
    expect(HALUCATCH_METHODOLOGY_WEIGHTS.code).toBe(MIN_WEIGHT);
  });

  test("resolveHaluCatchDimensionWeights maps skill types", () => {
    expect(resolveHaluCatchDimensionWeights("code-engineered")).toEqual(HALUCATCH_CODE_ENGINEERED_WEIGHTS);
    expect(resolveHaluCatchDimensionWeights("methodology")).toEqual(HALUCATCH_METHODOLOGY_WEIGHTS);
    expect(resolveHaluCatchDimensionWeights("unknown")).toEqual(HALUCATCH_METHODOLOGY_WEIGHTS);
  });

  test("normalizeHaluCatchSkillType accepts common aliases", () => {
    expect(normalizeHaluCatchSkillType("code-engineered")).toBe("code-engineered");
    expect(normalizeHaluCatchSkillType("code_engineered")).toBe("code-engineered");
    expect(normalizeHaluCatchSkillType("methodology")).toBe("methodology");
    expect(normalizeHaluCatchSkillType("")).toBe("unknown");
  });

  test("weightedHaluCatchScore applies profile-specific weights", () => {
    const dimensionScores = {
      foundation: 80,
      code: 60,
      rules: 70,
      guardrails: 90,
      complexity: 50
    };

    const codeEngineered = weightedHaluCatchScore(dimensionScores, "code-engineered");
    const methodology = weightedHaluCatchScore(dimensionScores, "methodology");

    expect(codeEngineered).toBe(
      Math.round(
        80 * HALUCATCH_CODE_ENGINEERED_WEIGHTS.foundation +
          60 * HALUCATCH_CODE_ENGINEERED_WEIGHTS.code +
          70 * HALUCATCH_CODE_ENGINEERED_WEIGHTS.rules +
          90 * HALUCATCH_CODE_ENGINEERED_WEIGHTS.guardrails +
          50 * HALUCATCH_CODE_ENGINEERED_WEIGHTS.complexity
      )
    );
    expect(methodology).toBe(
      Math.round(
        80 * HALUCATCH_METHODOLOGY_WEIGHTS.foundation +
          60 * HALUCATCH_METHODOLOGY_WEIGHTS.code +
          70 * HALUCATCH_METHODOLOGY_WEIGHTS.rules +
          90 * HALUCATCH_METHODOLOGY_WEIGHTS.guardrails +
          50 * HALUCATCH_METHODOLOGY_WEIGHTS.complexity
      )
    );
    expect(codeEngineered).not.toBe(methodology);
  });
});
