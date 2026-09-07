"""HTTP client error handling tests."""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest

from skillnav.api import request_bytes
from skillnav.errors import EXIT_NETWORK, NetworkError


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
