"""HTTP client for the Skill platform API."""

from __future__ import annotations

import json
import urllib.error
import urllib.request
from typing import Any

from skillnav.error_hints import enrich_api_error, network_unreachable, request_timed_out
from skillnav.errors import AuthError, NetworkError, SkillnavError


def request_bytes(
    method: str,
    url: str,
    *,
    body: dict[str, Any] | None = None,
    token: str | None = None,
    timeout: float = 120,
) -> tuple[int, bytes, dict[str, str]]:
    headers: dict[str, str] = {"Accept": "*/*"}
    data: bytes | None = None
    if body is not None:
        headers["Content-Type"] = "application/json"
        headers["Accept"] = "application/json"
        data = json.dumps(body).encode("utf-8")
    if token:
        headers["Authorization"] = f"Bearer {token}"

    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.status, resp.read(), dict(resp.headers.items())
    except urllib.error.HTTPError as exc:
        return exc.code, exc.read(), dict(exc.headers.items())
    except urllib.error.URLError as exc:
        reason = getattr(exc, "reason", exc)
        if _is_timeout(reason):
            raise NetworkError.from_hint(request_timed_out(timeout, registry=url)) from exc
        raise NetworkError.from_hint(network_unreachable(str(reason), registry=url)) from exc
    except TimeoutError as exc:
        raise NetworkError.from_hint(request_timed_out(timeout, registry=url)) from exc
    except OSError as exc:
        raise NetworkError.from_hint(network_unreachable(str(exc), registry=url)) from exc


def _is_timeout(value: object) -> bool:
    """Whether a URLError reason / OSError represents a client-side timeout.

    urllib wraps socket timeouts in ``URLError`` with a ``TimeoutError`` reason,
    but a bare ``TimeoutError`` (and message-only variants) also occur, so both
    shapes are recognised. A timeout is deliberately *not* reported as
    "cannot reach the API" — see :func:`request_timed_out`.
    """
    if isinstance(value, TimeoutError):
        return True
    text = str(value).casefold()
    return "timed out" in text or "timeout" in text


def request_json(
    method: str,
    url: str,
    *,
    body: dict[str, Any] | None = None,
    token: str | None = None,
    timeout: float = 120,
) -> tuple[int, Any]:
    status, raw, _headers = request_bytes(
        method, url, body=body, token=token, timeout=timeout
    )
    if not raw:
        return status, {}
    text = raw.decode("utf-8", errors="replace")
    try:
        return status, json.loads(text)
    except json.JSONDecodeError:
        return status, text


def api_error_message(body: Any) -> str:
    if isinstance(body, dict) and body.get("error"):
        return str(body["error"])
    if isinstance(body, str) and body.strip():
        return body.strip()
    return "request failed"


def raise_for_api_status(status: int, body: Any) -> None:
    if status < 400:
        return
    hint = enrich_api_error(api_error_message(body), status=status, body=body)
    if status in (401, 403):
        raise AuthError(hint.summary, hint=hint)
    raise SkillnavError(hint.summary, hint=hint)


def parse_content_disposition_filename(header: str | None) -> str | None:
    if not header:
        return None
    if "filename*=" in header.lower():
        part = header.split("filename*=", 1)[1].split(";", 1)[0].strip()
        if part.upper().startswith("UTF-8''"):
            from urllib.parse import unquote

            return unquote(part[7:])
    if 'filename="' in header:
        return header.split('filename="', 1)[1].split('"', 1)[0]
    if "filename=" in header:
        return header.split("filename=", 1)[1].split(";", 1)[0].strip().strip('"')
    return None
