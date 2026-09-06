"use client";

import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  Bot,
  Code2,
  FileText,
  LayoutGrid,
  MessageCircle,
  Palette,
  Shield,
  Zap
} from "lucide-react";
import type { SkillCategory } from "../lib/skill-categories";

export const SKILL_CATEGORY_ICON_MAP: Record<SkillCategory, LucideIcon> = {
  Automation: Bot,
  "Developer Tools": Code2,
  Documentation: FileText,
  Productivity: Zap,
  "Data & Analytics": BarChart3,
  Security: Shield,
  "Design & Creative": Palette,
  Communication: MessageCircle,
  Other: LayoutGrid
};

export function getSkillCategoryIcon(category: string): LucideIcon {
  return SKILL_CATEGORY_ICON_MAP[category as SkillCategory] ?? LayoutGrid;
}

interface SkillCategoryIconProps {
  category: string;
  size?: number;
  className?: string;
}

export function SkillCategoryIcon({ category, size = 14, className }: SkillCategoryIconProps) {
  const Icon = getSkillCategoryIcon(category);
  // Icon 来自 module 级稳定映射（非 render 期创建组件），此处 JSX 动态渲染是刻意设计。
  // eslint-disable-next-line react-hooks/static-components
  return <Icon aria-hidden="true" className={className} size={size} />;
}

interface SkillCategoryLabelProps {
  category: string;
  iconSize?: number;
  className?: string;
}

export function SkillCategoryLabel({ category, iconSize = 14, className }: SkillCategoryLabelProps) {
  return (
    <span className={`skill-category-label ${className ?? ""}`.trim()}>
      <SkillCategoryIcon category={category} size={iconSize} />
      <span>{category}</span>
    </span>
  );
}
