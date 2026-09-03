"""Check PyPI and upgrade the installed skillnav package."""

from __future__ import annotations

import json
import re
import shutil
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path

from skillnav import __version__
from skillnav.api import request_json
from skillnav.errors import SkillnavError

PYPI_PROJECT_URL = "https://pypi.org/pypi/skillnav/json"
PYPI_INSTALL_INDEX = "https://mirrors.aliyun.com/pypi/simple/"
_RELEASE_VERSION_RE = re.compile(r"^(\d+)\.(\d+)\.(\d+)")


@dataclass(frozen=True)
class UpdateStatus:
    current: str
    latest: str
    up_to_date: bool
    updated: bool = False


def parse_release_version(version: str) -> tuple[int, int, int]:
    match = _RELEASE_VERSION_RE.match(version.strip())
    if not match:
        raise SkillnavError(f"Unsupported version format: {version}")
    return int(match.group(1)), int(match.group(2)), int(match.group(3))


def compare_versions(current: str, latest: str) -> int:
    """Return -1 if current < latest, 0 if equal, 1 if current > latest."""
    cur = parse_release_version(current)
    lat = parse_release_version(latest)
    if cur < lat:
        return -1
    if cur > lat:
        return 1
    return 0


def fetch_pypi_latest_version(*, timeout: float = 30) -> str:
    status, body = request_json("GET", PYPI_PROJECT_URL, timeout=timeout)
    if status >= 400:
        raise SkillnavError("Failed to check PyPI for skillnav updates")
    if not isinstance(body, dict):
        raise SkillnavError("Unexpected PyPI response")
    version = body.get("info", {}).get("version")
    if not isinstance(version, str) or not version.strip():
        raise SkillnavError("PyPI response missing latest version")
    return version.strip()


def is_editable_install() -> bool:
    try:
        import importlib.metadata as importlib_metadata
    except ImportError:
        return False

    try:
        direct_url = importlib_metadata.distribution("skillnav").read_text("direct_url.json")
    except (ImportError, FileNotFoundError, OSError, TypeError):
        return False

    if not direct_url:
        return False

    try:
        payload = json.loads(direct_url)
    except json.JSONDecodeError:
        return False

    return bool(payload.get("dir_info", {}).get("editable"))


def _installed_via_pipx() -> bool:
    return "pipx" in Path(sys.executable).resolve().parts


def build_upgrade_command() -> list[str]:
    if shutil.which("pipx") and _installed_via_pipx():
        return ["pipx", "upgrade", "skillnav"]
    return [sys.executable, "-m", "pip", "install", "--upgrade", "skillnav", "-i", PYPI_INSTALL_INDEX]


def run_upgrade_command() -> None:
    command = build_upgrade_command()
    try:
        completed = subprocess.run(
            command,
            check=False,
            capture_output=True,
            text=True,
        )
    except OSError as exc:
        raise SkillnavError(f"Failed to run upgrade command: {exc}") from exc

    if completed.returncode != 0:
        detail = (completed.stderr or completed.stdout or "").strip()
        joined = " ".join(command)
        message = f"Upgrade failed ({joined})"
        if detail:
            message = f"{message}: {detail}"
        raise SkillnavError(message)


def check_for_update(*, current: str | None = None) -> UpdateStatus:
    current_version = current or __version__
    latest_version = fetch_pypi_latest_version()
    up_to_date = compare_versions(current_version, latest_version) >= 0
    return UpdateStatus(
        current=current_version,
        latest=latest_version,
        up_to_date=up_to_date,
    )


def perform_update(*, check_only: bool = False, current: str | None = None) -> UpdateStatus:
    status = check_for_update(current=current)
    if status.up_to_date or check_only:
        return status

    if is_editable_install():
        raise SkillnavError(
            "Editable install detected; update from source or reinstall with "
            f"pip install skillnav -i {PYPI_INSTALL_INDEX}"
        )

    run_upgrade_command()
    return UpdateStatus(
        current=status.current,
        latest=status.latest,
        up_to_date=False,
        updated=True,
    )


def format_update_message(status: UpdateStatus, *, check_only: bool) -> str:
    if status.up_to_date:
        return f"skillnav is up to date ({status.current})"
    if status.updated:
        return (
            f"Updated skillnav {status.current} -> {status.latest}. "
            "Run skillnav --version to verify."
        )
    if check_only:
        return f"Update available: {status.current} -> {status.latest} (run: skillnav update)"
    return f"Updating skillnav {status.current} -> {status.latest}…"
