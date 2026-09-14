"""Daily release-notification cache + multi-source release lookup."""

from __future__ import annotations

import io
import json
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

from skillnav import cli, self_update, version_check
from skillnav.errors import SkillnavError
from skillnav.self_update import fetch_pypi_latest_version

NOW = datetime(2026, 9, 15, 12, 0, tzinfo=timezone.utc)


@pytest.fixture(autouse=True)
def _not_editable(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(version_check, "is_editable_install", lambda: False)


def _state_file(tmp_path: Path, *, hours_ago: float | None, latest: str | None) -> Path:
    path = tmp_path / "update-check.json"
    if hours_ago is not None:
        checked_at = NOW - timedelta(hours=hours_ago)
        path.write_text(
            json.dumps({"checked_at": checked_at.isoformat(), "latest": latest}),
            encoding="utf-8",
        )
    return path


def _notify(tmp_path: Path, *, fetch, hours_ago=None, latest=None, now=NOW, stream=None):
    stream = stream or io.StringIO()
    message = version_check.maybe_notify_update(
        stream=stream,
        now=now,
        fetch=fetch,
        state_path=_state_file(tmp_path, hours_ago=hours_ago, latest=latest),
    )
    return message, stream.getvalue()


def test_fresh_cache_notifies_without_network(tmp_path: Path) -> None:
    def must_not_be_called(**_: object) -> str:
        raise AssertionError("fresh cache must not trigger a lookup")

    message, output = _notify(
        tmp_path, fetch=must_not_be_called, hours_ago=1, latest="99.0.0"
    )
    assert message is not None
    assert "99.0.0" in output


def test_stale_cache_looks_up_and_caches(tmp_path: Path) -> None:
    calls: list[float] = []

    def fetch(*, timeout: float) -> str:
        calls.append(timeout)
        return "0.5.0"

    message, output = _notify(tmp_path, fetch=fetch, hours_ago=30, latest="0.4.8")
    assert calls, "stale cache must trigger a lookup"
    assert message is not None and "0.5.0" in output
    saved = json.loads((tmp_path / "update-check.json").read_text(encoding="utf-8"))
    assert saved["latest"] == "0.5.0"


def test_lookup_failure_is_silent_and_backs_off(tmp_path: Path) -> None:
    state = tmp_path / "update-check.json"
    calls: list[float] = []

    def failing_fetch(*, timeout: float) -> str:
        calls.append(timeout)
        raise SkillnavError("timed out")

    stream = io.StringIO()
    message = version_check.maybe_notify_update(
        stream=stream, now=NOW, fetch=failing_fetch, state_path=state
    )
    assert message is None and stream.getvalue() == ""
    assert len(calls) == 1

    # The failure still recorded a timestamp: a second run within 24h must not
    # hit the network again (offline hosts pay the timeout at most once a day).
    def must_not_be_called(**_: object) -> str:
        raise AssertionError("back-off window must skip the lookup")

    stream2 = io.StringIO()
    message2 = version_check.maybe_notify_update(
        stream=stream2,
        now=NOW + timedelta(hours=1),
        fetch=must_not_be_called,
        state_path=state,
    )
    assert message2 is None and stream2.getvalue() == ""


def test_up_to_date_cache_is_silent(tmp_path: Path) -> None:
    from skillnav import __version__

    message, output = _notify(tmp_path, fetch=lambda **_: __version__, hours_ago=1, latest=__version__)
    assert message is None and output == ""


def test_env_can_disable_the_check(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("SKILLNAV_UPDATE_CHECK", "off")

    def must_not_be_called(**_: object) -> str:
        raise AssertionError("disabled check must not look up")

    message, output = _notify(tmp_path, fetch=must_not_be_called, hours_ago=30)
    assert message is None and output == ""


# --------------------------------------------------------------------------
# Multi-source lookup (PyPI JSON first, Aliyun simple index as fallback)
# --------------------------------------------------------------------------

def test_lookup_prefers_pypi_and_skips_mirror(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        self_update, "request_json", lambda *a, **k: (200, {"info": {"version": "0.5.0"}})
    )

    def mirror_must_not_run(*a: object, **k: object) -> object:
        raise AssertionError("mirror must not be queried when PyPI answers")

    monkeypatch.setattr(self_update, "request_bytes", mirror_must_not_run)
    assert fetch_pypi_latest_version(timeout=1) == "0.5.0"


def test_lookup_falls_back_to_mirror_simple_index(monkeypatch: pytest.MonkeyPatch) -> None:
    def pypi_fails(*a: object, **k: object) -> object:
        raise SkillnavError("timed out")

    monkeypatch.setattr(self_update, "request_json", pypi_fails)
    html = (
        b'<a href="../../packages/aa/skillnav-0.4.8-py3-none-any.whl">skillnav-0.4.8</a>'
        b'<a href="../../packages/bb/skillnav-0.4.10.tar.gz">skillnav-0.4.10</a>'
    )
    monkeypatch.setattr(self_update, "request_bytes", lambda *a, **k: (200, html, {}))
    assert fetch_pypi_latest_version(timeout=1) == "0.4.10"


def test_lookup_reports_both_sources_when_all_fail(monkeypatch: pytest.MonkeyPatch) -> None:
    def fail(*a: object, **k: object) -> object:
        raise SkillnavError("timed out")

    monkeypatch.setattr(self_update, "request_json", fail)
    monkeypatch.setattr(self_update, "request_bytes", fail)

    with pytest.raises(SkillnavError) as excinfo:
        fetch_pypi_latest_version(timeout=1)
    message = str(excinfo.value)
    assert "pypi.org" in message and "mirrors.aliyun.com" in message


# --------------------------------------------------------------------------
# Announce-once policy: notices are event-driven (a release appeared), never
# time-driven — the same release is announced at most once, ever.
# --------------------------------------------------------------------------

def _write_state(
    path: Path, *, hours_ago: float, latest: str | None, notified: str | None
) -> Path:
    path.write_text(
        json.dumps(
            {
                "checked_at": (NOW - timedelta(hours=hours_ago)).isoformat(),
                "latest": latest,
                "notified_latest": notified,
            }
        ),
        encoding="utf-8",
    )
    return path


def test_same_release_is_announced_only_once(tmp_path: Path) -> None:
    path = _state_file(tmp_path, hours_ago=1, latest="99.0.0")

    def must_not_be_called(**_: object) -> str:
        raise AssertionError("fresh cache must not trigger a lookup")

    first = version_check.maybe_notify_update(
        stream=io.StringIO(), now=NOW, fetch=must_not_be_called, state_path=path
    )
    assert first is not None
    assert json.loads(path.read_text(encoding="utf-8"))["notified_latest"] == "99.0.0"

    # Later commands inside the same window: already announced, stay silent.
    stream = io.StringIO()
    second = version_check.maybe_notify_update(
        stream=stream,
        now=NOW + timedelta(hours=3),
        fetch=must_not_be_called,
        state_path=path,
    )
    assert second is None and stream.getvalue() == ""


def test_same_release_stays_silent_after_the_cache_window(tmp_path: Path) -> None:
    path = _write_state(
        tmp_path / "update-check.json", hours_ago=48, latest="99.0.0", notified="99.0.0"
    )

    stream = io.StringIO()
    message = version_check.maybe_notify_update(
        stream=stream, now=NOW, fetch=lambda **_: "99.0.0", state_path=path
    )
    assert message is None and stream.getvalue() == ""

    saved = json.loads(path.read_text(encoding="utf-8"))
    # The stale entry was refreshed (so a future 100.0.0 can still be spotted)
    # while the announced marker — and therefore the silence — was preserved.
    assert saved["checked_at"] == NOW.isoformat()
    assert saved["notified_latest"] == "99.0.0"


def test_a_newer_release_announces_again(tmp_path: Path) -> None:
    path = _write_state(
        tmp_path / "update-check.json", hours_ago=48, latest="99.0.0", notified="99.0.0"
    )

    stream = io.StringIO()
    message = version_check.maybe_notify_update(
        stream=stream, now=NOW, fetch=lambda **_: "100.0.0", state_path=path
    )
    assert message is not None and "100.0.0" in stream.getvalue()
    assert json.loads(path.read_text(encoding="utf-8"))["notified_latest"] == "100.0.0"


def test_lookup_failure_keeps_the_announced_marker(tmp_path: Path) -> None:
    path = _write_state(
        tmp_path / "update-check.json", hours_ago=48, latest="99.0.0", notified="99.0.0"
    )

    def failing_fetch(*, timeout: float) -> str:
        raise SkillnavError("timed out")

    assert (
        version_check.maybe_notify_update(
            stream=io.StringIO(), now=NOW, fetch=failing_fetch, state_path=path
        )
        is None
    )
    saved = json.loads(path.read_text(encoding="utf-8"))
    assert saved["notified_latest"] == "99.0.0" and saved["latest"] is None


def test_version_flag_hints_on_stderr_and_keeps_stdout_clean(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    from skillnav import __version__

    monkeypatch.setenv("SKILLNAV_CONFIG", str(tmp_path / "config.json"))
    monkeypatch.setattr(version_check, "fetch_pypi_latest_version", lambda **_: "99.0.0")
    # The suite-wide autouse fixture silences the hint for every other CLI
    # test; restore the real implementation for this one.
    monkeypatch.setattr(cli, "maybe_notify_update", version_check.maybe_notify_update)

    assert cli.run(["--version"]) == 0

    captured = capsys.readouterr()
    assert captured.out == f"skillnav {__version__}\n"
    assert "99.0.0" in captured.err
