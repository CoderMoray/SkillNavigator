"""HTTP client error handling tests."""

from __future__ import annotations

import socket
import urllib.error
from unittest.mock import MagicMock, patch

import pytest

from skillnav.api import request_bytes
from skillnav.errors import EXIT_NETWORK, NetworkError


def test_request_bytes_timeout_is_not_reported_as_unreachable() -> None:
    """A timed-out request must stay distinguishable from an unreachable API.

    The API answered nothing in time, but the server keeps working (a long
    inspection may still finish), so the hint has to say "check status /
    retry-publish" instead of "start the API".
    """
    with patch("urllib.request.urlopen", side_effect=TimeoutError("timed out")):
        with pytest.raises(NetworkError) as exc_info:
            request_bytes("GET", "http://127.0.0.1:3000/skills/demo-skill")

    err = exc_info.value
    assert err.exit_code == EXIT_NETWORK
    assert "timed out" in err.message.casefold()
    assert "Cannot reach" not in err.message
    assert any("status" in step for step in err.next_steps)
    assert any("retry-publish" in step for step in err.next_steps)


def test_request_bytes_wrapped_socket_timeout_reports_the_budget() -> None:
    with patch(
        "urllib.request.urlopen",
        side_effect=urllib.error.URLError(socket.timeout("timed out")),
    ):
        with pytest.raises(NetworkError) as exc_info:
            request_bytes(
                "POST", "http://127.0.0.1:3000/skills/publish", timeout=600
            )

    err = exc_info.value
    assert "600" in err.message
    assert "Cannot reach" not in err.message


def test_request_bytes_connection_refused_keeps_the_connectivity_hint() -> None:
    with patch(
        "urllib.request.urlopen",
        side_effect=urllib.error.URLError("Connection refused"),
    ):
        with pytest.raises(NetworkError) as exc_info:
            request_bytes("GET", "http://127.0.0.1:3000/skills/demo-skill")

    assert "Cannot reach the Skill platform API" in exc_info.value.message


def test_request_bytes_connection_reset_raises_network_error() -> None:
    mock_resp = MagicMock()
    mock_resp.status = 200
    mock_resp.read.side_effect = ConnectionResetError(10054, "An existing connection was forcibly closed")
    mock_resp.headers.items.return_value = []

    mock_context = MagicMock()
    mock_context.__enter__.return_value = mock_resp
    mock_context.__exit__.return_value = False

    with patch("urllib.request.urlopen", return_value=mock_context):
        with pytest.raises(NetworkError) as exc_info:
            request_bytes("GET", "http://127.0.0.1:3000/skills/demo-skill")

    err = exc_info.value
    assert err.exit_code == EXIT_NETWORK
    assert "Cannot reach the Skill platform API" in err.message
    assert "npm run dev:api" in err.next_steps[0]
