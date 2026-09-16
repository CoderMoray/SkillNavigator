"""HTTP client for the Skill platform API."""

from __future__ import annotations

import http.client
import json
import ssl
import urllib.error
import urllib.request
from typing import Any

from skillnav.error_hints import enrich_api_error, network_unreachable, request_timed_out
from skillnav.errors import AuthError, NetworkError, SkillnavError
from skillnav.net import connect_with_fallback

# 请求超时同时覆盖连接与读取；连接阶段另有独立的短超时（见 skillnav.net），
# 否则一个"IPv6 黑洞"地址就能把整个预算耗光，而慢响应（publish --wait）需要它。
DEFAULT_REQUEST_TIMEOUT = 120.0


class _RacingHTTPConnection(http.client.HTTPConnection):
    """HTTPConnection that races DNS candidates instead of walking them serially."""

    def connect(self) -> None:
        if getattr(self, "_tunnel_host", None):  # 走代理隧道：交回标准库，别破坏隧道逻辑
            super().connect()
            return
        self.sock = connect_with_fallback(
            self.host, self.port, timeout=self.timeout or DEFAULT_REQUEST_TIMEOUT
        )


class _RacingHTTPSConnection(http.client.HTTPSConnection):
    """Same for TLS: race the candidates, then wrap whichever answered."""

    def connect(self) -> None:
        if getattr(self, "_tunnel_host", None):
            super().connect()
            return
        sock = connect_with_fallback(
            self.host, self.port, timeout=self.timeout or DEFAULT_REQUEST_TIMEOUT
        )
        context = getattr(self, "_context", None) or ssl.create_default_context()
        self.sock = context.wrap_socket(sock, server_hostname=self.host)


class _RacingHTTPHandler(urllib.request.HTTPHandler):
    def http_open(self, req: urllib.request.Request) -> Any:
        return self.do_open(_RacingHTTPConnection, req)


class _RacingHTTPSHandler(urllib.request.HTTPSHandler):
    def https_open(self, req: urllib.request.Request) -> Any:
        return self.do_open(
            _RacingHTTPSConnection, req, context=getattr(self, "_context", None)
        )


# urllib has no connection pool, so one opener is built once and reused.
# build_opener still assembles the default handlers (ProxyHandler, redirects) —
# only HTTP/HTTPS are replaced.
_OPENER = urllib.request.build_opener(_RacingHTTPHandler, _RacingHTTPSHandler)


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
        with _OPENER.open(req, timeout=timeout) as resp:
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
