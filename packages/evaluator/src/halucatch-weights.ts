export type HaluCatchDimensionKey = "foundation" | "code" | "rules" | "guardrails" | "complexity";

export type HaluCatchSkillType = "code-engineered" | "methodology" | "unknown";

export interface HaluCatchDimensionDefinition {
  key: HaluCatchDimensionKey;
  name: string;
}

export const HALUCATCH_DIMENSIONS: readonly HaluCatchDimensionDefinition[] = [
  { key: "foundation", name: "地基与数据管线" },
  { key: "code", name: "代码风险" },
  { key: "rules", name: "规则与方法论" },
  { key: "guardrails", name: "解读护栏" },
  { key: "complexity", name: "复杂度与可维护性" }
] as const;

/** 代码/工程型 Skill：强调可执行脚本、代码风险与工程地基。 */
export const HALUCATCH_CODE_ENGINEERED_WEIGHTS: Readonly<Record<HaluCatchDimensionKey, number>> = {
  foundation: 0.2,
  code: 0.3,
  rules: 0.15,
  guardrails: 0.2,
  complexity: 0.15
};

/** 纯方法论型 Skill：强调规则清晰度、解读护栏与流程可执行性。 */
export const HALUCATCH_METHODOLOGY_WEIGHTS: Readonly<Record<HaluCatchDimensionKey, number>> = {
  foundation: 0.15,
  code: 0.1,
  rules: 0.3,
  guardrails: 0.3,
  complexity: 0.15
};

const MIN_WEIGHT = 0.1;

function assertValidWeights(weights: Readonly<Record<HaluCatchDimensionKey, number>>, profile: string): void {
  const total = HALUCATCH_DIMENSIONS.reduce((sum, dimension) => sum + weights[dimension.key], 0);
  if (Math.abs(total - 1) > 0.0001) {
    throw new Error(`HaluCatch ${profile} weights must sum to 1.0, got ${total}`);
  }
  for (const dimension of HALUCATCH_DIMENSIONS) {
    if (weights[dimension.key] < MIN_WEIGHT) {
      throw new Error(
        `HaluCatch ${profile} weight for ${dimension.key} must be at least ${MIN_WEIGHT}, got ${weights[dimension.key]}`
      );
    }
  }
}

assertValidWeights(HALUCATCH_CODE_ENGINEERED_WEIGHTS, "code-engineered");
assertValidWeights(HALUCATCH_METHODOLOGY_WEIGHTS, "methodology");

export function normalizeHaluCatchSkillType(value: string | undefined): HaluCatchSkillType {
  const raw = String(value ?? "").trim().toLowerCase();
  if (raw === "code-engineered" || raw === "code_engineered" || raw === "code") {
    return "code-engineered";
  }
  if (raw === "methodology" || raw === "method") {
    return "methodology";
  }
  return "unknown";
}

export function resolveHaluCatchDimensionWeights(
  skillType: string | undefined
): Readonly<Record<HaluCatchDimensionKey, number>> {
  switch (normalizeHaluCatchSkillType(skillType)) {
    case "code-engineered":
      return HALUCATCH_CODE_ENGINEERED_WEIGHTS;
    case "methodology":
      return HALUCATCH_METHODOLOGY_WEIGHTS;
    default:
      return HALUCATCH_METHODOLOGY_WEIGHTS;
  }
}

export function weightedHaluCatchScore(
  dimensionScores: Readonly<Record<HaluCatchDimensionKey, number>>,
  skillType: string | undefined
): number {
  const weights = resolveHaluCatchDimensionWeights(skillType);
  const total = HALUCATCH_DIMENSIONS.reduce(
    (sum, dimension) => sum + dimensionScores[dimension.key] * weights[dimension.key],
    0
  );
  return Math.max(0, Math.min(100, Math.round(total)));
}
