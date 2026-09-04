export const SKILL_REVIEW_STATUSES = ["reviewing", "completed", "failed"] as const;

export type SkillReviewStatus = (typeof SKILL_REVIEW_STATUSES)[number];

export const DEFAULT_SKILL_REVIEW_STATUS: SkillReviewStatus = "completed";

export function isSkillReviewStatus(value: string): value is SkillReviewStatus {
  return (SKILL_REVIEW_STATUSES as readonly string[]).includes(value);
}

export function skillReviewStatusLabel(status: SkillReviewStatus): string {
  switch (status) {
    case "reviewing":
      return "审查中";
    case "completed":
      return "审查完成";
    case "failed":
      return "审查失败";
  }
}
