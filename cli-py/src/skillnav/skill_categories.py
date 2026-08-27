"""Skill category options (keep in sync with apps/web/lib/skill-categories.ts)."""

from __future__ import annotations

from skillnav.errors import UsageError

SKILL_CATEGORY_OPTIONS: tuple[str, ...] = (
    "Automation",
    "Developer Tools",
    "Documentation",
    "Productivity",
    "Data & Analytics",
    "Security",
    "Design & Creative",
    "Communication",
    "Other",
)

_CATEGORY_LOOKUP = {category.casefold(): category for category in SKILL_CATEGORY_OPTIONS}


def resolve_skill_category(value: str) -> str:
    text = value.strip()
    canonical = _CATEGORY_LOOKUP.get(text.casefold())
    if not canonical:
        options = ", ".join(SKILL_CATEGORY_OPTIONS)
        raise UsageError(f"Invalid category: {text!r}. Valid options: {options}")
    return canonical


def normalize_skill_categories(values: list[str]) -> list[str]:
    seen: set[str] = set()
    normalized: list[str] = []
    for value in values:
        canonical = resolve_skill_category(value)
        if canonical not in seen:
            seen.add(canonical)
            normalized.append(canonical)
    return normalized
