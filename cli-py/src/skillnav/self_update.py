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
from skillnav.api import request_bytes, request_json
from skillnav.errors import SkillnavError

PYPI_PROJECT_URL = "https://pypi.org/pypi/skillnav/json"
# Aliyun PyPI mirror: no JSON API (404), only a PEP 503 simple index — the
# version is parsed from the file links.
MIRROR_SIMPLE_INDEX_URL = "https://mirrors.aliyun.com/pypi/simple/skillnav/"
PYPI_INSTALL_INDEX = "https://mirrors.aliyun.com/pypi/simple/"
# Per-source timeout for release lookups (explicit update / --check).
RELEASE_SOURCE_TIMEOUT = 10.0
_RELEASE_VERSION_RE = re.compile(r"^(\d+)\.(\d+)\.(\d+)")
# File names in the simple index, e.g. skillnav-0.4.8-py3-none-any.whl /
# skillnav-0.4.8.tar.gz (may be embedded in a longer href).
_MIRROR_FILENAME_RE = re.compile(r"skillnav-(\d+\.\d+\.\d+)[^\"'>]*\.(?:whl|tar\.gz|zip)")


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


def fetch_pypi_latest_version(*, timeout: float = RELEASE_SOURCE_TIMEOUT) -> str:
    """Latest released version, trying PyPI first and the Aliyun mirror second.

    Both lookups use the same per-source ``timeout``; if the first source times
    out or fails, the mirror is tried. When both fail the raised error lists
    each source's failure so the user can tell network problems apart from
    mirror problems.
    """
    failures: list[str] = []
    sources = (
        ("pypi.org", _fetch_version_from_pypi_json),
        ("mirrors.aliyun.com", _fetch_version_from_mirror_simple_index),
    )
    for label, fetch in sources:
        try:
            return fetch(timeout=timeout)
        except SkillnavError as exc:
            failures.append(f"{label}: {exc}")
        except Exception as exc:  # defensive: a lookup must never break the caller
            failures.append(f"{label}: {exc}")
    raise SkillnavError(
        "Failed to check skillnav updates on both sources — " + "; ".join(failures)
    )


def _fetch_version_from_pypi_json(*, timeout: float) -> str:
    status, body = request_json("GET", PYPI_PROJECT_URL, timeout=timeout)
    if status >= 400:
        raise SkillnavError(f"PyPI returned HTTP {status}")
    if not isinstance(body, dict):
        raise SkillnavError("unexpected JSON response")
    version = body.get("info", {}).get("version")
    if not isinstance(version, str) or not version.strip():
        raise SkillnavError("response missing latest version")
    return version.strip()


def _fetch_version_from_mirror_simple_index(*, timeout: float) -> str:
    status, raw, _headers = request_bytes("GET", MIRROR_SIMPLE_INDEX_URL, timeout=timeout)
    if status >= 400:
        raise SkillnavError(f"mirror returned HTTP {status}")
    versions = _MIRROR_FILENAME_RE.findall(raw.decode("utf-8", errors="replace"))
    if not versions:
        raise SkillnavError("simple index lists no skillnav releases")
    return max(versions, key=parse_release_version)


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


def read_installed_version() -> str:
    try:
        import importlib.metadata as importlib_metadata
    except ImportError:
        return __version__

    try:
        return importlib_metadata.version("skillnav")
    except importlib_metadata.PackageNotFoundError:
        return __version__


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


def _upgrade_still_behind_message(installed: str, latest: str) -> str:
    return (
        f"Upgrade finished but skillnav {installed} is still older than PyPI {latest}. "
        f"The install index may be out of sync. Retry with: "
        f"{sys.executable} -m pip install --upgrade skillnav -i https://pypi.org/simple/"
    )


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
    installed = read_installed_version()
    if compare_versions(installed, status.latest) < 0:
        raise SkillnavError(_upgrade_still_behind_message(installed, status.latest))

    return UpdateStatus(
        current=installed,
        latest=status.latest,
        up_to_date=True,
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
