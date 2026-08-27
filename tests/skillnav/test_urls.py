"""URL joining preserves registry path prefixes."""

from skillnav.urls import join_registry_url


def test_join_preserves_path_prefix() -> None:
    registry = "https://example.com/MonoSkillNavigator/api"
    url = join_registry_url(registry, "/skills/publish")
    assert url == "https://example.com/MonoSkillNavigator/api/skills/publish"


def test_join_with_query() -> None:
    url = join_registry_url("http://127.0.0.1:3000", "/skills", {"query": "demo"})
    assert url == "http://127.0.0.1:3000/skills?query=demo"


def test_join_strips_slashes() -> None:
    url = join_registry_url("http://127.0.0.1:3000/", "health")
    assert url == "http://127.0.0.1:3000/health"
