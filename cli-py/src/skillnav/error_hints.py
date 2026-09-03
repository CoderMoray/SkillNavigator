"""Map raw API / CLI failures to AI-friendly explanations and next steps."""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class ErrorHint:
    """Structured CLI error for humans and agents."""

    summary: str
    detail: str | None = None
    next_steps: tuple[str, ...] = ()


def _steps(*items: str) -> tuple[str, ...]:
    return items


def not_logged_in(*, profile: str | None = None) -> ErrorHint:
    profile_label = f" '{profile}'" if profile else ""
    return ErrorHint(
        summary=f"Not logged in (no API key on profile{profile_label})",
        detail=(
            "Write commands (publish, review, download, install, rate, issue, contributors) "
            "require a platform API key. None is configured for the active profile."
        ),
        next_steps=_steps(
            "Open Web UI → Settings → API Keys (/account/settings/api-keys) and create a key.",
            "Run: skillnav login --api-key sk_...",
            "Verify with: skillnav whoami",
            "Retry the command that failed.",
        ),
    )


def invalid_api_key() -> ErrorHint:
    return ErrorHint(
        summary="Invalid or expired API key",
        detail="GET /auth/me rejected the Bearer token. The key may be revoked, mistyped, or from another environment.",
        next_steps=_steps(
            "Create a new API key in Web UI → Settings → API Keys.",
            "Run: skillnav login --api-key sk_...",
            "Confirm registry matches the platform: skillnav config test",
            "Retry the command.",
        ),
    )


def network_unreachable(reason: str, *, registry: str | None = None) -> ErrorHint:
    registry_line = f" Registry URL: {registry}." if registry else ""
    return ErrorHint(
        summary=f"Cannot reach the Skill platform API ({reason})",
        detail=(
            "The CLI could not open an HTTP connection to the registry."
            f"{registry_line} The API may be stopped, the URL wrong, or a firewall blocking the port."
        ),
        next_steps=_steps(
            "Start the API locally: npm run dev:api (or npm run dev for API + Web).",
            "Check connectivity: skillnav config test",
            "If using a remote host, set --registry or SKILLNAV_REGISTRY to the correct base URL.",
            "Retry after the API responds to GET /health.",
        ),
    )


def unknown_profile(name: str) -> ErrorHint:
    return ErrorHint(
        summary=f"Unknown profile: {name}",
        detail=f"No profile named '{name}' exists in ~/.config/skillnav/config.json.",
        next_steps=_steps(
            "List profiles: skillnav config list",
            "Add one: skillnav config add <name> --registry http://127.0.0.1:3000",
            f"Switch default: skillnav config use {name}",
        ),
    )


def enrich_api_error(raw: str, *, status: int, body: Any = None) -> ErrorHint:
    """Turn an API error string (+ optional status/body) into an agent-oriented hint."""
    message = (raw or "request failed").strip()
    lower = message.casefold()

    if status in (401, 403) and lower in {"unauthorized", "forbidden", "session login required"}:
        return invalid_api_key() if status == 401 else ErrorHint(
            summary=message,
            detail="The authenticated user lacks permission for this action.",
            next_steps=_steps(
                "Confirm you are logged in: skillnav whoami",
                "Ensure your account is a skill owner or contributor for this slug.",
                "Ask the skill owner to add you: skillnav add-contributor <slug> --username <you>",
            ),
        )

    if "invalid api key" in lower or "api key" in lower and "invalid" in lower:
        return invalid_api_key()

    exact: dict[str, ErrorHint] = {
        "skill_in_recycle_bin": ErrorHint(
            summary="Skill is in the recycle bin",
            detail="Publishing is blocked while the skill slug is soft-deleted.",
            next_steps=_steps(
                "Open the Web UI recycle bin and restore the skill.",
                "Retry: skillnav publish <package>",
            ),
        ),
        "Only skill contributors can publish new versions": ErrorHint(
            summary="Not a contributor — cannot publish new versions",
            detail="Your account is not listed as owner or contributor on this skill slug.",
            next_steps=_steps(
                "Ask the skill owner to add you: skillnav add-contributor <slug> --username <your-username>",
                "Or publish under a new slug (first publish creates a new skill).",
            ),
        ),
        "review_pipeline_incomplete": ErrorHint(
            summary="Review pipeline incomplete (503)",
            detail="SkillSpector, VirusTotal, or HaluCatch did not finish. The server marks this as retryable.",
            next_steps=_steps(
                "Wait a few seconds and retry the same command.",
                "Run a local dry-run first: skillnav publish <package> --dry-run",
                "If it persists, check API logs and review-engine dependencies (Python, SkillSpector, HaluCatch).",
            ),
        ),
        "publish_rate_limited": ErrorHint(
            summary="Publish rate limited",
            detail="Too many publish attempts for this user in a short window.",
            next_steps=_steps(
                _publish_rate_limit_wait(body),
                "Use --dry-run while iterating on metadata or packaging.",
            ),
        ),
        "skill_not_found": ErrorHint(
            summary="Skill not found",
            detail="No skill with this slug exists in the registry (or it is hidden from your view).",
            next_steps=_steps(
                "Search the registry: skillnav search <keyword>",
                "Check the slug spelling (slug is immutable; name is display-only).",
                "Publish as a new skill if this is the first version.",
            ),
        ),
        "Creator not found": ErrorHint(
            summary="Creator not found",
            detail="No public creator profile matches this username/handle.",
            next_steps=_steps(
                "List creators via the Web UI /creators or search by handle.",
                "Verify the username matches the platform account (not display name).",
            ),
        ),
        "contributor_not_found": ErrorHint(
            summary="Contributor not found on this skill",
            detail="The username does not match any non-owner contributor on the skill.",
            next_steps=_steps(
                "List contributors: skillnav info <slug>",
                "Use the exact username from the contributors list.",
            ),
        ),
        "only_owner_can_add_contributors": ErrorHint(
            summary="Only the skill owner can manage contributors",
            detail="Contributor add/remove requires owner role on the skill.",
            next_steps=_steps(
                "Ask the current owner to run the command or transfer ownership via Web UI.",
            ),
        ),
        "contributor_already_exists": ErrorHint(
            summary="Contributor already exists",
            detail="That user is already a contributor on this skill.",
            next_steps=_steps(
                "List contributors: skillnav info <slug>",
            ),
        ),
        "cannot_modify_owner_contributor": ErrorHint(
            summary="Cannot modify the skill owner",
            detail="The owner contributor row is protected.",
            next_steps=_steps(
                "Remove a different contributor, or ask platform admin if ownership must change.",
            ),
        ),
        "rating_already_submitted": ErrorHint(
            summary="You already rated this skill version",
            detail="Each user may submit one rating per skill version.",
            next_steps=_steps(
                "View existing ratings on the Web skill page.",
            ),
        ),
        "First version must include latest tag": ErrorHint(
            summary="First version must include the 'latest' release tag",
            detail="New skills must tag their first version as latest.",
            next_steps=_steps(
                "Add flag: skillnav publish <package> --release-tag latest",
                "Or ensure SKILL.md / metadata includes latest in releaseTags.",
            ),
        ),
    }

    if message in exact:
        return exact[message]

    version_exists = re.match(r"Version already exists: (.+)", message)
    if version_exists:
        ref = version_exists.group(1)
        return ErrorHint(
            summary=f"Version already exists ({ref})",
            detail="Each semver may be published only once per skill slug.",
            next_steps=_steps(
                "Bump --version to a new semver (e.g. patch +1).",
                f"Check existing versions: skillnav status {ref.split('@')[0]}",
            ),
        )

    version_low = re.match(
        r"Version must be greater than latest: (.+?)@(.+?), got (.+)",
        message,
    )
    if version_low:
        slug, latest, got = version_low.groups()
        return ErrorHint(
            summary=f"Version {got} is not greater than latest {latest}",
            detail=f"New releases for '{slug}' must use semver strictly greater than {latest}.",
            next_steps=_steps(
                f"Publish with a higher version: skillnav publish <package> --version <next-semver>",
                f"Inspect versions: skillnav status {slug}",
            ),
        )

    if status == 404:
        return ErrorHint(
            summary=message,
            detail="The requested resource was not found (HTTP 404).",
            next_steps=_steps(
                "Verify slug, version, username, or contributor id.",
                "Search or inspect: skillnav search <query> / skillnav info <slug>",
            ),
        )

    if status == 409:
        return ErrorHint(
            summary=message,
            detail="Conflict with existing registry state (HTTP 409).",
            next_steps=_steps(
                "Inspect current state: skillnav info <slug> or skillnav status <slug>",
                "Adjust version, slug, or contributor and retry.",
            ),
        )

    if status == 429:
        return ErrorHint(
            summary=message,
            detail="Too many requests (HTTP 429).",
            next_steps=_steps(
                _publish_rate_limit_wait(body),
                "Retry after the suggested wait.",
            ),
        )

    if status >= 500:
        return ErrorHint(
            summary=message,
            detail=f"Server error (HTTP {status}). The platform failed while processing the request.",
            next_steps=_steps(
                "Retry once after a short wait.",
                "Check API process logs (npm run dev:api).",
                "Run: skillnav config test",
            ),
        )

    return ErrorHint(
        summary=message,
        detail=f"API returned HTTP {status}." if status >= 400 else None,
        next_steps=_steps(
            "Read the message above and fix the request input.",
            "Use --json for the raw response body when debugging.",
            "See Web docs: /docs/cli-guide",
        ),
    )


def enrich_usage_error(message: str) -> ErrorHint:
    """Local validation / argparse-style usage failures."""
    lower = message.casefold()

    if "unknown profile" in lower:
        name = message.split(":", 1)[-1].strip()
        return unknown_profile(name)

    if "specify --id or --username" in lower:
        return ErrorHint(
            summary=message,
            detail="remove-contributor requires exactly one identifier.",
            next_steps=_steps(
                "List contributors: skillnav info <slug>",
                "Run: skillnav remove-contributor <slug> --username <name>",
                "Or: skillnav remove-contributor <slug> --id <contributor-id>",
            ),
        )

    if "specify only one" in lower and "username" in lower:
        return ErrorHint(
            summary=message,
            detail="--id and --username are mutually exclusive.",
            next_steps=_steps(
                "Pass only --username or only --id.",
            ),
        )

    if "contributor not found" in lower:
        username = message.split(":", 1)[-1].strip() if ":" in message else "?"
        return ErrorHint(
            summary=f"Contributor not found: {username}",
            detail="No matching non-owner contributor on this skill.",
            next_steps=_steps(
                "List contributors: skillnav info <slug>",
                "Match username or display name exactly (case-insensitive).",
            ),
        )

    if "ambiguous contributor" in lower:
        return ErrorHint(
            summary=message,
            detail="Multiple contributors matched the given name.",
            next_steps=_steps(
                "Use contributor id: skillnav remove-contributor <slug> --id <id>",
                "List ids via: skillnav info <slug> --json",
            ),
        )

    if "display name is required" in lower:
        return ErrorHint(
            summary=message,
            detail="Publish metadata requires a human-readable display name.",
            next_steps=_steps(
                "Add --display-name 'My Skill' or set name in SKILL.md frontmatter.",
            ),
        )

    if "semver" in lower or "version" in lower and "invalid" in lower:
        return ErrorHint(
            summary=message,
            detail="Version must be valid semver (e.g. 1.0.0).",
            next_steps=_steps(
                "Set --version 1.0.0 (or bump patch/minor/major).",
                "Check SKILL.md version field if omitted on CLI.",
            ),
        )

    if "category" in lower:
        return ErrorHint(
            summary=message,
            detail="Categories must be from the platform allow-list (max 3).",
            next_steps=_steps(
                "Run with a valid --category (repeat up to 3 times).",
                "See allowed values in apps/web/lib/skill-categories.ts or Web publish UI.",
            ),
        )

    if "slug" in lower:
        return ErrorHint(
            summary=message,
            detail="Slug must be lowercase alphanumeric with hyphens, or a scoped @scope/name form.",
            next_steps=_steps(
                "Set --slug my-skill or add slug to SKILL.md frontmatter.",
                "Slug is immutable after first publish.",
            ),
        )

    if "path not found" in lower or "expected a skill directory" in lower:
        return ErrorHint(
            summary=message,
            detail="The package path must be an existing directory or .zip file containing SKILL.md.",
            next_steps=_steps(
                "Point to examples/demo-skill or your skill folder.",
                "Use absolute path or path relative to current working directory.",
            ),
        )

    if "api key is required" in lower:
        return not_logged_in()

    return ErrorHint(
        summary=message,
        detail="Invalid arguments or missing required local input.",
        next_steps=_steps(
            "Run: skillnav <command> --help",
            "Fix flags/paths and retry.",
        ),
    )


def _publish_rate_limit_wait(body: Any) -> str:
    if isinstance(body, dict):
        seconds = body.get("retryAfterSeconds")
        if seconds is not None:
            return f"Wait {seconds} seconds, then retry."
    return "Wait about one minute, then retry."


def hint_from_message(message: str) -> ErrorHint:
    """Best-effort hint when only a plain message string is available."""
    stripped = message.strip()
    if not stripped:
        return ErrorHint(summary="request failed")

    if stripped.startswith("not logged in"):
        return not_logged_in()

    if "Path not found" in stripped or "Expected a skill directory" in stripped:
        return enrich_usage_error(stripped)

    return ErrorHint(summary=stripped)
