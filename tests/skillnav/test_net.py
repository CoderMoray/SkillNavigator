"""Happy Eyeballs connect behaviour (skillnav.net).

The failures these guard against are environment-specific and were invisible in
CI: a host that advertises IPv6 over a black-holing network used to cost one
full request timeout per address, because ``socket.create_connection`` walks the
``getaddrinfo`` result serially.
"""

from __future__ import annotations

import socket
import time
from typing import Any

from skillnav import api, net


def _info(family: int, address: str, port: int = 443) -> net.AddressInfo:
    return (family, socket.SOCK_STREAM, socket.IPPROTO_TCP, "", (address, port))


class _FakeSocket:
    def close(self) -> None:
        pass


def test_interleave_alternates_families() -> None:
    infos = [
        _info(socket.AF_INET6, "2001:db8::1"),
        _info(socket.AF_INET6, "2001:db8::2"),
        _info(socket.AF_INET6, "2001:db8::3"),
        _info(socket.AF_INET, "203.0.113.10"),
        _info(socket.AF_INET, "203.0.113.11"),
    ]

    families = [info[0] for info in net.interleave_addresses(infos)]

    assert families == [
        socket.AF_INET6,
        socket.AF_INET,
        socket.AF_INET6,
        socket.AF_INET,
        socket.AF_INET6,
    ]


def test_candidates_are_raced_not_walked_serially(monkeypatch: Any) -> None:
    """A hanging first candidate must not delay the second one by its timeout."""
    infos = [_info(socket.AF_INET6, "2001:db8::1"), _info(socket.AF_INET, "127.0.0.1")]
    monkeypatch.setattr(socket, "getaddrinfo", lambda *args, **kwargs: infos)

    started: list[float] = []

    def fake_connect(info: net.AddressInfo, timeout: float) -> Any:
        started.append(time.monotonic())
        if info[0] == socket.AF_INET6:
            time.sleep(1.0)  # 黑洞：一直不回应，直到自己超时
            raise OSError("timed out")
        return _FakeSocket()

    monkeypatch.setattr(net, "_connect_one", fake_connect)

    begin = time.monotonic()
    sock = net.connect_with_fallback(
        "example.invalid", 443, timeout=120, connect_timeout_seconds=5.0
    )
    elapsed = time.monotonic() - begin

    assert isinstance(sock, _FakeSocket)
    assert len(started) == 2, "the IPv4 candidate should have been attempted too"
    assert elapsed < 1.0, f"{elapsed:.2f}s — the second candidate waited for the first"


def test_connect_timeout_is_configurable(monkeypatch: Any) -> None:
    monkeypatch.setenv("SKILLNAV_CONNECT_TIMEOUT", "1.5")
    assert net.connect_timeout() == 1.5

    monkeypatch.setenv("SKILLNAV_CONNECT_TIMEOUT", "not-a-number")
    assert net.connect_timeout() == net.DEFAULT_CONNECT_TIMEOUT

    monkeypatch.delenv("SKILLNAV_CONNECT_TIMEOUT", raising=False)
    assert net.connect_timeout() == net.DEFAULT_CONNECT_TIMEOUT


def test_api_client_uses_the_racing_handlers() -> None:
    classes = {type(handler) for handler in api._OPENER.handlers}

    assert api._RacingHTTPHandler in classes
    assert api._RacingHTTPSHandler in classes
