"""Registry URL helpers — string concat only (no urljoin / URL normalization)."""

from __future__ import annotations

from urllib.parse import quote, urlencode


def join_registry_url(registry: str, path: str, query: dict[str, str] | None = None) -> str:
    base = registry.rstrip("/")
    rel = path.lstrip("/")
    url = f"{base}/{rel}"
    if query:
        url = f"{url}?{urlencode(query)}"
    return url


def slug_path(slug: str) -> str:
    return quote(slug, safe="")
