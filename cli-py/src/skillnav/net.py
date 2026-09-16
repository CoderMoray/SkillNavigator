"""Connect to a host the way browsers do (RFC 8305 / Happy Eyeballs).

``socket.create_connection`` — and therefore ``urllib`` and ``http.client`` —
walks the ``getaddrinfo`` result **serially**, giving every address the same
timeout. A host that advertises IPv6 but silently black-holes it (very common
on home/office networks: the addresses are configured and DNS hands them out,
but no packet ever gets an answer and nothing sends an ICMP back) therefore
costs one full timeout per address: with four AAAA records ahead of the A
record and a 120s request timeout, a single ``skillnav config test`` can sit
for roughly eight minutes before reaching an address that answers in
milliseconds. ``curl`` returns in well under a second because it implements
Happy Eyeballs.

This module provides the same behaviour for the CLI: addresses are interleaved
by family and raced in parallel (staggered by ``CONNECT_STAGGER``), the first
success wins, and the *connect* phase gets its own short timeout so that a
black hole can never consume the budget meant for a slow response.
"""

from __future__ import annotations

import os
import socket
from concurrent.futures import FIRST_COMPLETED, Future, ThreadPoolExecutor, as_completed, wait
from typing import Any

# Connect-phase timeout. Deliberately short: a TCP handshake that has not
# answered in a few seconds is not going to, and the request timeout (which also
# covers slow reads, e.g. `publish --wait`) must not be spent on it.
DEFAULT_CONNECT_TIMEOUT = 5.0

# RFC 8305 stagger: start the next candidate shortly after the previous one so
# a dead first family does not delay the others by more than this.
CONNECT_STAGGER = 0.25

AddressInfo = tuple[Any, ...]


def connect_timeout() -> float:
    """Connect-phase timeout in seconds, overridable via SKILLNAV_CONNECT_TIMEOUT."""
    raw = os.environ.get("SKILLNAV_CONNECT_TIMEOUT", "").strip()
    if not raw:
        return DEFAULT_CONNECT_TIMEOUT
    try:
        value = float(raw)
    except ValueError:
        return DEFAULT_CONNECT_TIMEOUT
    return value if value > 0 else DEFAULT_CONNECT_TIMEOUT


def interleave_addresses(infos: list[AddressInfo]) -> list[AddressInfo]:
    """Order addresses like RFC 8305: alternate families, IPv6 first.

    ``getaddrinfo`` groups addresses by family, so a dual-stack host lists every
    AAAA record before the first A record and a dead IPv6 stack blocks all of
    them. Interleaving means the IPv4 candidate is reached immediately.
    """
    ipv6 = [info for info in infos if info[0] == socket.AF_INET6]
    ipv4 = [info for info in infos if info[0] == socket.AF_INET]
    rest = [info for info in infos if info[0] not in (socket.AF_INET6, socket.AF_INET)]

    ordered: list[AddressInfo] = []
    for index in range(max(len(ipv6), len(ipv4))):
        if index < len(ipv6):
            ordered.append(ipv6[index])
        if index < len(ipv4):
            ordered.append(ipv4[index])
    return ordered + rest


def _connect_one(info: AddressInfo, timeout: float) -> socket.socket:
    family, socktype, proto = info[0], info[1], info[2]
    sock = socket.socket(family, socktype, proto)
    try:
        sock.settimeout(timeout)
        sock.connect(info[4])
    except BaseException:
        sock.close()
        raise
    return sock


def connect_with_fallback(
    host: str,
    port: int,
    *,
    timeout: float,
    connect_timeout_seconds: float | None = None,
) -> socket.socket:
    """Return a socket to the first address of ``host`` that answers.

    ``timeout`` is the caller's overall budget (used only as an upper bound);
    each individual attempt uses ``connect_timeout_seconds`` (default:
    :func:`connect_timeout`). Every candidate is tried in parallel, staggered by
    ``CONNECT_STAGGER``, so total wall time is bounded by the connect timeout
    plus the stagger — not by ``timeout`` multiplied by the number of addresses.
    """
    per_attempt = (
        connect_timeout_seconds if connect_timeout_seconds is not None else connect_timeout()
    )
    ordered = interleave_addresses(list(socket.getaddrinfo(host, port, 0, socket.SOCK_STREAM)))
    if not ordered:
        raise OSError(f"No addresses resolved for {host}")

    errors: list[BaseException] = []
    pool = ThreadPoolExecutor(max_workers=len(ordered), thread_name_prefix="skillnav-connect")
    pending: set[Future[socket.socket]] = set()
    try:
        for index, info in enumerate(ordered):
            pending.add(pool.submit(_connect_one, info, min(per_attempt, max(timeout, 0.1))))
            if index + 1 < len(ordered):
                # Give the previous candidate a head start before racing the next.
                done, _ = wait(pending, timeout=CONNECT_STAGGER, return_when=FIRST_COMPLETED)
                for future in done:
                    pending.discard(future)
                    try:
                        return future.result()
                    except OSError as exc:
                        errors.append(exc)

        # as_completed: the winner must be picked in completion order — iterating
        # the set directly would block on whichever attempt hangs first.
        for future in as_completed(pending):
            try:
                return future.result()
            except OSError as exc:
                errors.append(exc)
    finally:
        # Do not wait for attempts that are still timing out; their sockets are
        # closed by _connect_one and the process does not depend on them.
        pool.shutdown(wait=False, cancel_futures=True)

    detail = str(errors[-1]) if errors else "no attempt completed"
    raise OSError(f"Could not connect to {host}:{port} ({len(ordered)} addresses): {detail}")
