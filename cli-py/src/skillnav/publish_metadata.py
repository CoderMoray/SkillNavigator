"""Publish metadata validation aligned with Web / skillPublishMetadataSchema."""

from __future__ import annotations

import io
import re
import zipfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from skillnav.errors import UsageError
from skillnav.packages import resolve_user_path
from skillnav.skill_categories import SKILL_CATEGORY_OPTIONS, normalize_skill_categories

SKILL_ENTRY_NAMES = ("SKILL.md", "skill.md", "skills.md")
MAX_CATEGORIES = 3
MAX_TOPICS = 20

UNSCOPED_SLUG_PATTERN = re.compile(r"^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$")
SCOPED_SLUG_PATTERN = re.compile(r"^@[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?\/[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$")
SEMVER_PATTERN = re.compile(
    r"^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)"
    r"(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?"
    r"(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$"
)
RELEASE_TAG_PATTERN = re.compile(r"^[a-z0-9][a-z0-9._-]*$")
FRONTMATTER_PATTERN = re.compile(r"^---\r?\n([\s\S]*?)\r?\n---", re.MULTILINE)


@dataclass(frozen=True)
class PublishMetadataInput:
    display_name: str | None = None
    slug: str | None = None
    description: str | None = None
    categories: list[str] | None = None
    topics: list[str] | None = None
    version: str | None = None
    release_tags: list[str] | None = None


def split_csv_list(value: str | None) -> list[str]:
    if not value:
        return []
    return [item.strip() for item in value.split(",") if item.strip()]


def unique_strings(values: list[str]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for value in values:
        if value not in seen:
            seen.add(value)
            result.append(value)
    return result


def is_valid_skill_slug(value: str) -> bool:
    if not value or len(value) > 128:
        return False
    if "/" in value:
        return bool(SCOPED_SLUG_PATTERN.fullmatch(value))
    return len(value) <= 64 and bool(UNSCOPED_SLUG_PATTERN.fullmatch(value))


def read_frontmatter_hints(package_path: Path) -> dict[str, Any]:
    entry_content = _read_skill_entry_content(package_path)
    match = FRONTMATTER_PATTERN.search(entry_content)
    if not match:
        return {}
    return _parse_simple_frontmatter(match.group(1))


def build_publish_metadata(
    hints: dict[str, Any],
    *,
    display_name: str | None = None,
    slug: str | None = None,
    description: str | None = None,
    categories: list[str] | None = None,
    topics: list[str] | None = None,
    version: str | None = None,
    release_tags: list[str] | None = None,
) -> dict[str, Any]:
    hint_categories = _coerce_string_list(hints.get("categories"))
    hint_topics = _coerce_string_list(hints.get("topics"))
    hint_release_tags = _coerce_string_list(hints.get("release-tags") or hints.get("releaseTags"))

    merged_categories = normalize_skill_categories(
        unique_strings(categories if categories else hint_categories)
    )
    merged_topics = unique_strings(topics if topics is not None else hint_topics)
    merged_release_tags = unique_strings(
        [tag.lower() for tag in (release_tags if release_tags else hint_release_tags or ["latest"])]
    )

    metadata = {
        "displayName": (display_name or _hint_str(hints, "name")).strip(),
        "slug": (slug or _hint_str(hints, "slug")).strip(),
        "summary": (description or _hint_str(hints, "description")).strip(),
        "categories": merged_categories,
        "topics": merged_topics,
        "version": (version or _hint_str(hints, "version")).strip(),
        "releaseTags": merged_release_tags,
    }
    validate_publish_metadata(metadata)
    return metadata


def validate_publish_metadata(metadata: dict[str, Any]) -> None:
    display_name = str(metadata.get("displayName") or "").strip()
    if not display_name or len(display_name) > 128:
        raise UsageError("Display Name is required (1–128 characters). Use --display-name.")

    slug = str(metadata.get("slug") or "").strip()
    if not slug:
        raise UsageError("Slug is required. Use --slug or add slug to SKILL.md frontmatter.")
    if not is_valid_skill_slug(slug):
        raise UsageError(
            "Slug must be npm-safe lowercase, for example demo-plugin or @scope/demo-plugin."
        )

    summary = str(metadata.get("summary") or "").strip()
    if not summary or len(summary) > 1024:
        raise UsageError("Description is required (1–1024 characters). Use --description.")

    categories = metadata.get("categories") or []
    if not isinstance(categories, list) or len(categories) < 1:
        raise UsageError("At least one category is required. Use --category (repeatable).")
    if len(categories) > MAX_CATEGORIES:
        raise UsageError(f"At most {MAX_CATEGORIES} categories are allowed (same as Web publish).")
    for category in categories:
        text = str(category).strip()
        if not text or len(text) > 64:
            raise UsageError("Each category must be 1–64 characters.")
        if text not in SKILL_CATEGORY_OPTIONS:
            options = ", ".join(SKILL_CATEGORY_OPTIONS)
            raise UsageError(f"Invalid category: {text!r}. Valid options: {options}")

    topics = metadata.get("topics") or []
    if not isinstance(topics, list):
        raise UsageError("Topics must be a list.")
    if len(topics) > MAX_TOPICS:
        raise UsageError(f"At most {MAX_TOPICS} topics are allowed.")
    for topic in topics:
        text = str(topic).strip()
        if not text or len(text) > 64:
            raise UsageError("Each topic must be 1–64 characters.")

    version = str(metadata.get("version") or "").strip()
    if not version or not SEMVER_PATTERN.fullmatch(version):
        raise UsageError("Version must be valid SemVer, for example 1.0.0. Use --version.")

    release_tags = metadata.get("releaseTags") or []
    if not isinstance(release_tags, list) or len(release_tags) < 1:
        raise UsageError("At least one release tag is required. Use --release-tag (default: latest).")
    if len(release_tags) > 10:
        raise UsageError("At most 10 release tags are allowed.")
    for tag in release_tags:
        text = str(tag).strip().lower()
        if not text or len(text) > 64 or not RELEASE_TAG_PATTERN.fullmatch(text):
            raise UsageError(
                "Release tags must use lowercase letters, numbers, dots, underscores, or hyphens."
            )


def _read_skill_entry_content(package_path: Path) -> str:
    if package_path.is_dir():
        entry_path = _find_skill_entry_on_disk(package_path)
        return entry_path.read_text(encoding="utf-8")
    if package_path.is_file() and package_path.suffix.lower() == ".zip":
        return _read_skill_entry_from_zip(package_path.read_bytes())
    raise UsageError(f"Expected a skill directory or .zip file: {package_path}")


def _find_skill_entry_on_disk(root: Path) -> Path:
    for name in SKILL_ENTRY_NAMES:
        candidate = root / name
        if candidate.is_file():
            return candidate
    matches = [path for name in SKILL_ENTRY_NAMES for path in root.rglob(name) if path.is_file()]
    if len(matches) == 1:
        return matches[0]
    if not matches:
        raise UsageError(f"Skill package must include one of: {', '.join(SKILL_ENTRY_NAMES)}")
    raise UsageError("Skill package must contain a single skill entry file.")


def _read_skill_entry_from_zip(data: bytes) -> str:
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        names = [info.filename.replace("\\", "/").lstrip("/") for info in archive.infolist() if not info.is_dir()]
        entry_name = _find_skill_entry_in_zip(names)
        return archive.read(entry_name).decode("utf-8")


def _find_skill_entry_in_zip(names: list[str]) -> str:
    for preferred in SKILL_ENTRY_NAMES:
        if preferred in names:
            return preferred
    prefixed = [name for name in names if name.split("/")[-1] in SKILL_ENTRY_NAMES]
    if len(prefixed) == 1:
        return prefixed[0]
    if not prefixed:
        raise UsageError(f"Skill zip must include one of: {', '.join(SKILL_ENTRY_NAMES)}")
    raise UsageError("Skill zip must contain a single skill entry file.")


def _parse_simple_frontmatter(yaml_text: str) -> dict[str, Any]:
    result: dict[str, Any] = {}
    lines = yaml_text.splitlines()
    index = 0
    while index < len(lines):
        line = lines[index]
        if not line.strip() or line.lstrip().startswith("#"):
            index += 1
            continue
        key_match = re.match(r"^([A-Za-z0-9_-]+):\s*(.*)$", line)
        if not key_match:
            index += 1
            continue
        key = key_match.group(1)
        raw_value = (key_match.group(2) or "").strip()
        if raw_value == "" and index + 1 < len(lines) and re.match(r"^\s+-\s", lines[index + 1]):
            index += 1
            items: list[str] = []
            while index < len(lines) and re.match(r"^\s+-\s", lines[index]):
                items.append(_unquote_yaml_scalar(re.sub(r"^\s+-\s+", "", lines[index]).strip()))
                index += 1
            result[key] = items
            continue
        result[key] = _unquote_yaml_scalar(raw_value)
        index += 1
    return result


def _unquote_yaml_scalar(value: str) -> str:
    if (value.startswith('"') and value.endswith('"')) or (value.startswith("'") and value.endswith("'")):
        return value[1:-1]
    return value


def _hint_str(hints: dict[str, Any], key: str) -> str:
    value = hints.get(key)
    return str(value).strip() if value is not None else ""


def _coerce_string_list(value: Any) -> list[str]:
    if isinstance(value, list):
        return [str(item).strip() for item in value if str(item).strip()]
    if isinstance(value, str) and value.strip():
        return split_csv_list(value)
    return []


def resolve_package_path(package: str) -> Path:
    return resolve_user_path(package)
