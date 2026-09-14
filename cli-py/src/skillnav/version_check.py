"""Daily release notification with a cached state file (C strategy).

- Fresh cache (< 24h): notify from the cached value — zero network, zero delay.
- Stale cache: look up once synchronously (short timeout), then cache.
- Lookup failure: still record the timestamp (back off for 24h) and stay
  silent — offline / air-gapped environments must never see noise or a delay
  on every command.

The hint goes to stderr, so machine-readable stdout (`--json`) stays clean.
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
    return CheckState(checked_at=checked_at, latest=latest if isinstance(latest, str) else None)


def _save_state(path: Path, *, checked_at: datetime, latest: str | None) -> None:
    payload = {"checked_at": checked_at.isoformat(), "latest": latest}
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
    else:
        try:
            lookup = fetch or fetch_pypi_latest_version
            latest = lookup(timeout=_check_timeout())
        except SkillnavError:
            _save_state(path, checked_at=now, latest=None)
            return None
        except Exception:  # defensive: version checks are strictly best-effort
            _save_state(path, checked_at=now, latest=None)
            return None
        _save_state(path, checked_at=now, latest=latest)

    if not latest or compare_versions(__version__, latest) >= 0:
        return None

    message = f"💡 skillnav {latest} 已发布（当前 {__version__}）：运行 skillnav update 升级"
    print(message, file=stream)
    return message
