"""Release notification with a cached state file (C strategy).

- Fresh cache (< 24h): notify from the cached value — zero network, zero delay.
- Stale cache: look up once synchronously (short timeout), then cache.
- Lookup failure: still record the timestamp (back off for 24h) and stay
  silent — offline / air-gapped environments must never see noise or a delay
  on every command.
- Notice policy: a given release is announced **at most once, ever**. The hint
  is driven by "a new release appeared", not by the passage of time, so an
  un-upgraded host goes permanently quiet for that version; only a newer
  ``latest`` (0.4.9 -> 0.5.0) announces again. ``skillnav update [--check]``
  always performs a real lookup and prints the result (never gated by this
  cache), so a missed hint is never fatal.

The hint goes to stderr, so machine-readable stdout (`--json`) stays clean.
Callers only run this for interactive terminals with human-readable output
(see ``skillnav.cli._hint_enabled``), so pipes, CI jobs and agent harnesses
stay completely silent.
Disable with ``SKILLNAV_UPDATE_CHECK=off``; the timeout is overridable via
``SKILLNAV_UPDATE_CHECK_TIMEOUT`` (seconds).
"""

from __future__ import annotations

import json
import os
import sys
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Callable, TextIO

from skillnav import __version__
from skillnav.config import config_path
from skillnav.errors import SkillnavError
from skillnav.self_update import (
    compare_versions,
    fetch_pypi_latest_version,
    is_editable_install,
)

CHECK_INTERVAL = timedelta(hours=24)
STATE_FILENAME = "update-check.json"
# The daily check runs in the foreground of the first command of the day —
# keep it short even though an explicit `skillnav update` may wait longer.
DEFAULT_CHECK_TIMEOUT = 3.0


def _env_disabled() -> bool:
    return os.environ.get("SKILLNAV_UPDATE_CHECK", "").strip().lower() in {
        "0",
        "false",
        "off",
        "no",
    }


def _check_timeout() -> float:
    raw = os.environ.get("SKILLNAV_UPDATE_CHECK_TIMEOUT", "").strip()
    if raw:
        try:
            value = float(raw)
            if value > 0:
                return value
        except ValueError:
            pass
    return DEFAULT_CHECK_TIMEOUT


def _state_path() -> Path:
    # Same directory as config.json, so SKILLNAV_CONFIG isolates tests too.
    return config_path().parent / STATE_FILENAME


@dataclass(frozen=True)
class CheckState:
    checked_at: datetime | None = None
    latest: str | None = None
    # The release last announced to the user. Kept separately from ``latest``
    # (which is just the cached lookup result) so a new-release notice survives
    # cache refreshes and is shown exactly once per version.
    notified_latest: str | None = None


def _as_aware(value: datetime) -> datetime:
    return value if value.tzinfo is not None else value.replace(tzinfo=timezone.utc)


def _load_state(path: Path) -> CheckState:
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return CheckState()
    if not isinstance(payload, dict):
        return CheckState()

    checked_at: datetime | None = None
    raw_checked = payload.get("checked_at")
    if isinstance(raw_checked, str):
        try:
            checked_at = _as_aware(datetime.fromisoformat(raw_checked))
        except ValueError:
            checked_at = None

    latest = payload.get("latest")
    notified = payload.get("notified_latest")
    return CheckState(
        checked_at=checked_at,
        latest=latest if isinstance(latest, str) else None,
        notified_latest=notified if isinstance(notified, str) else None,
    )


def _save_state(
    path: Path,
    *,
    checked_at: datetime,
    latest: str | None,
    notified_latest: str | None = None,
) -> None:
    payload = {
        "checked_at": checked_at.isoformat(),
        "latest": latest,
        "notified_latest": notified_latest,
    }
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(payload) + "\n", encoding="utf-8")
    except OSError:
        # A non-writable cache must never fail the command.
        pass


def _is_fresh(checked_at: datetime | None, now: datetime) -> bool:
    return checked_at is not None and now - checked_at < CHECK_INTERVAL


def maybe_notify_update(
    *,
    stream: TextIO | None = None,
    now: datetime | None = None,
    fetch: Callable[..., str] | None = None,
    state_path: Path | None = None,
) -> str | None:
    """Print a one-line upgrade hint to stderr when a newer release exists.

    Returns the message (used by tests) or None. Never raises.
    """
    if _env_disabled() or is_editable_install():
        return None

    stream = stream or sys.stderr
    now = now or datetime.now(timezone.utc)
    path = state_path or _state_path()
    state = _load_state(path)

    if _is_fresh(state.checked_at, now):
        latest = state.latest
        checked_at = state.checked_at or now
    else:
        try:
            lookup = fetch or fetch_pypi_latest_version
            latest = lookup(timeout=_check_timeout())
        except SkillnavError:
            _save_state(path, checked_at=now, latest=None, notified_latest=state.notified_latest)
            return None
        except Exception:  # defensive: version checks are strictly best-effort
            _save_state(path, checked_at=now, latest=None, notified_latest=state.notified_latest)
            return None
        checked_at = now
        # Refresh the lookup cache but keep the announced marker: a stale entry
        # must not re-announce a release the user has already been told about.
        _save_state(path, checked_at=now, latest=latest, notified_latest=state.notified_latest)

    if not latest or compare_versions(__version__, latest) >= 0:
        return None

    # Same release already announced: stay silent permanently. Notices are
    # event-driven (a release appeared), never time-driven.
    if latest == state.notified_latest:
        return None

    # Plain ASCII and the same wording as `skillnav update --check`, so a tool
    # reading a merged stdout/stderr stream sees no emoji or localized noise.
    message = f"Update available: {__version__} -> {latest} (run: skillnav update)"
    print(message, file=stream)
    # Record the announcement without moving ``checked_at`` (the 24h network
    # window is independent of notification state).
    _save_state(path, checked_at=checked_at, latest=latest, notified_latest=latest)
    return message
