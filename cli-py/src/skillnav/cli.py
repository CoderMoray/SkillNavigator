"""skillnav CLI — official client for the Skill management platform."""

from __future__ import annotations

import getpass
import sys
from pathlib import Path
from typing import Annotated, Any, Optional

import typer

from skillnav import __version__
from skillnav.api import (
    api_error_message,
    parse_content_disposition_filename,
    raise_for_api_status,
    request_bytes,
    request_json,
)
from skillnav.contributors import resolve_contributor_id
from skillnav.context import CliContext
from skillnav.errors import (
    EXIT_AUTH,
    EXIT_BUSINESS,
    EXIT_NETWORK,
    EXIT_OK,
    AuthError,
    NetworkError,
    SkillnavError,
    UsageError,
)
from skillnav.output import (
    emit_error,
    emit_json,
    print_leaderboard,
    print_report_version,
    print_review,
    print_review_result,
    print_search_results,
    print_skill_info,
    print_skill_status,
    print_virustotal_summary,
    unwrap_resource_id,
)
from skillnav.packages import extract_zip_to_directory, package_to_base64, resolve_user_path
from skillnav.publish_metadata import build_publish_metadata, read_frontmatter_hints, resolve_package_path
from skillnav.urls import join_registry_url, slug_path

app = typer.Typer(
    no_args_is_help=True,
    add_completion=False,
    pretty_exceptions_enable=False,
)
config_app = typer.Typer(help="Manage platform profiles.", no_args_is_help=True)
app.add_typer(config_app, name="config")

_state: dict[str, Any] = {}


def _ctx() -> CliContext:
    return _state["ctx"]


def _handle_error(exc: BaseException) -> None:
    ctx = _state.get("ctx")
    json_output = bool(ctx and ctx.json_output)
    if isinstance(exc, AuthError):
        emit_error(exc.message, json_output=json_output)
        raise typer.Exit(EXIT_AUTH) from exc
    if isinstance(exc, UsageError):
        emit_error(exc.message, json_output=json_output)
        raise typer.Exit(EXIT_BUSINESS) from exc
    if isinstance(exc, NetworkError):
        emit_error(exc.message, json_output=json_output)
        raise typer.Exit(EXIT_NETWORK) from exc
    if isinstance(exc, SkillnavError):
        emit_error(exc.message, json_output=json_output)
        raise typer.Exit(EXIT_BUSINESS) from exc
    raise exc


def _api_json(method: str, path: str, *, body: dict | None = None, auth: bool = False) -> Any:
    ctx = _ctx()
    token = ctx.require_token() if auth else ctx.token
    status, payload = request_json(
        method,
        join_registry_url(ctx.registry, path),
        body=body,
        token=token,
    )
    raise_for_api_status(status, payload)
    return payload


def _friendly_publish_error(message: str) -> str:
    if message == "skill_in_recycle_bin":
        return "Skill is in the recycle bin — restore it on the web UI before publishing."
    if message == "Only skill contributors can publish new versions":
        return "Only skill contributors can publish new versions — ask the owner to add you."
    if message == "review_pipeline_incomplete":
        return "Review pipeline incomplete (503) — retry in a moment."
    return message


def _version_callback(value: bool) -> None:
    if value:
        typer.echo(f"skillnav {__version__}")
        raise typer.Exit(EXIT_OK)


@app.callback()
def main(
    ctx: typer.Context,
    registry: Annotated[
        Optional[str], typer.Option("--registry", help="API base URL (overrides profile)")
    ] = None,
    profile: Annotated[
        Optional[str], typer.Option("--profile", help="Platform profile name")
    ] = None,
    json_output: Annotated[bool, typer.Option("--json", help="Machine-readable JSON output")] = False,
    no_input: Annotated[
        bool, typer.Option("--no-input", help="Never prompt; fail when input is required")
    ] = False,
    version: Annotated[
        Optional[bool],
        typer.Option(
            "--version",
            "-v",
            help="Show version and exit",
            callback=_version_callback,
            is_eager=True,
        ),
    ] = None,
) -> None:
    """CLI client for the Skill management platform (MonoSkillNavigator)."""
    _state["ctx"] = CliContext.resolve(
        registry_flag=registry,
        profile_flag=profile,
        json_output=json_output,
        no_input=no_input,
    )
    ctx.obj = _state["ctx"]


# --- config ---


@config_app.command("add")
def config_add(
    name: Annotated[str, typer.Argument(help="Profile name")],
    registry: Annotated[str, typer.Option("--registry", help="API base URL")],
) -> None:
    """Add a platform profile."""
    try:
        config = load_config()
        get_profile(config, name)["registry"] = registry.rstrip("/")
        save_config(config)
        typer.echo(f"Added profile '{name}' -> {registry.rstrip('/')}")
    except Exception as exc:  # noqa: BLE001
        _handle_error(exc)


@config_app.command("use")
def config_use(name: Annotated[str, typer.Argument(help="Profile name to activate")]) -> None:
    """Switch the default platform profile."""
    try:
        config = load_config()
        if name not in config.get("profiles", {}):
            raise UsageError(f"Unknown profile: {name}")
        config["defaultProfile"] = name
        save_config(config)
        typer.echo(f"Default profile: {name}")
    except Exception as exc:  # noqa: BLE001
        _handle_error(exc)


@config_app.command("list")
def config_list() -> None:
    """List configured platform profiles."""
    try:
        cli = _ctx()
        config = cli.config
        default = config.get("defaultProfile", "default")
        profiles = config.get("profiles", {})
        if cli.json_output:
            emit_json({"defaultProfile": default, "profiles": profiles})
            return
        for name, profile in profiles.items():
            marker = " (default)" if name == default else ""
            registry = profile.get("registry", "?")
            logged_in = "logged in" if profile.get("token") else "anonymous"
            typer.echo(f"- {name}{marker}: {registry} [{logged_in}]")
    except Exception as exc:  # noqa: BLE001
        _handle_error(exc)


@config_app.command("test")
def config_test(
    name: Annotated[Optional[str], typer.Argument(help="Profile name (default: active)")] = None,
) -> None:
    """Verify connectivity (GET /health)."""
    try:
        cli = _ctx()
        config = cli.config
        profile_name = name or cli.profile_name
        profile = get_profile(config, profile_name)
        registry = profile.get("registry") or cli.registry
        status, body = request_json("GET", join_registry_url(registry, "/health"))
        if status >= 400:
            raise SkillnavError(api_error_message(body))
        if cli.json_output:
            emit_json(body)
        else:
            typer.echo(f"OK: {registry} (profile={profile_name})")
    except Exception as exc:  # noqa: BLE001
        _handle_error(exc)


# --- auth ---


@app.command("login")
def login_cmd(
    token: Annotated[Optional[str], typer.Option("--token", help="Bearer token (skillhub-style)")] = None,
    registry: Annotated[
        Optional[str], typer.Option("--registry", help="Registry URL for this login")
    ] = None,
    username: Annotated[Optional[str], typer.Option("--username", help="Account username")] = None,
    password: Annotated[Optional[str], typer.Option("--password", help="Account password")] = None,
) -> None:
    """Log in and save credentials to the active profile."""
    try:
        cli = _ctx()
        if registry:
            cli.registry = registry.rstrip("/")
        auth_token = token
        if not auth_token:
            if username and password:
                status, body = request_json(
                    "POST",
                    join_registry_url(cli.registry, "/auth/login"),
                    body={"username": username, "password": password},
                )
                if status >= 400:
                    raise AuthError(api_error_message(body))
                auth_token = body.get("token")
            elif cli.no_input:
                raise AuthError("not logged in (run: skillnav login --token TOKEN)")
            else:
                username = username or typer.prompt("Username")
                password = password or getpass.getpass("Password: ")
                status, body = request_json(
                    "POST",
                    join_registry_url(cli.registry, "/auth/login"),
                    body={"username": username, "password": password},
                )
                if status >= 400:
                    raise AuthError(api_error_message(body))
                auth_token = body.get("token")
        if not auth_token:
            raise AuthError("login did not return a token")
        status, me_body = request_json(
            "GET",
            join_registry_url(cli.registry, "/auth/me"),
            token=auth_token,
        )
        if status >= 400:
            raise AuthError(api_error_message(me_body))
        cli.persist_token(auth_token, me_body)
        user = me_body.get("user") or {}
        if cli.json_output:
            emit_json({"user": user, "profile": cli.profile_name, "registry": cli.registry})
        else:
            typer.echo(f"Logged in as {user.get('username', '?')} (profile={cli.profile_name})")
    except Exception as exc:  # noqa: BLE001
        _handle_error(exc)


@app.command("logout")
def logout_cmd() -> None:
    """Log out and clear stored token."""
    try:
        cli = _ctx()
        if cli.token:
            request_json(
                "POST",
                join_registry_url(cli.registry, "/auth/logout"),
                token=cli.token,
            )
        cli.clear_auth()
        if cli.json_output:
            emit_json({"ok": True})
        else:
            typer.echo("Logged out.")
    except Exception as exc:  # noqa: BLE001
        _handle_error(exc)


@app.command("whoami")
def whoami_cmd() -> None:
    """Show the current authenticated identity."""
    try:
        body = _api_json("GET", "/auth/me", auth=True)
        if _ctx().json_output:
            emit_json(body)
        else:
            user = body.get("user") or {}
            typer.echo(f"username: {user.get('username', '?')}")
            typer.echo(f"userId: {user.get('id', '?')}")
            typer.echo(f"profile: {_ctx().profile_name}")
            typer.echo(f"registry: {_ctx().registry}")
    except Exception as exc:  # noqa: BLE001
        _handle_error(exc)


@app.command("token")
def token_cmd() -> None:
    """Print the stored token (CI debugging)."""
    try:
        cli = _ctx()
        token = cli.require_token()
        if cli.json_output:
            emit_json({"token": token})
        else:
            typer.echo(token)
    except Exception as exc:  # noqa: BLE001
        _handle_error(exc)


# --- search / discovery ---


@app.command("search")
def search_cmd(
    query: Annotated[str, typer.Argument(help="Search query")],
    category: Annotated[Optional[str], typer.Option("--category", help="Category filter")] = None,
) -> None:
    """Search skills in the registry."""
    try:
        cli = _ctx()
        params: dict[str, str] = {}
        if query:
            params["query"] = query
        if category:
            params["category"] = category
        status, body = request_json(
            "GET",
            join_registry_url(cli.registry, "/skills", params or None),
        )
        raise_for_api_status(status, body)
        if cli.json_output:
            emit_json(body)
        else:
            print_search_results(body)
    except Exception as exc:  # noqa: BLE001
        _handle_error(exc)


@app.command("top")
def top_cmd(
    sort: Annotated[str, typer.Option("--sort", help="Sort key")] = "downloads",
    limit: Annotated[int, typer.Option("--limit", help="Max results")] = 20,
) -> None:
    """Show the registry leaderboard."""
    try:
        cli = _ctx()
        status, body = request_json(
            "GET",
            join_registry_url(
                cli.registry,
                "/leaderboard",
                {"sort": sort, "limit": str(limit)},
            ),
        )
        raise_for_api_status(status, body)
        if cli.json_output:
            emit_json(body)
        else:
            print_leaderboard(body)
    except Exception as exc:  # noqa: BLE001
        _handle_error(exc)


@app.command("info")
def info_cmd(slug: Annotated[str, typer.Argument(help="Skill slug")]) -> None:
    """Show skill metadata."""
    try:
        cli = _ctx()
        status, body = request_json(
            "GET",
            join_registry_url(cli.registry, f"/skills/{slug_path(slug)}"),
            token=cli.token,
        )
        raise_for_api_status(status, body)
        if cli.json_output:
            emit_json(body)
        else:
            print_skill_info(body)
    except Exception as exc:  # noqa: BLE001
        _handle_error(exc)


@app.command("status")
def status_cmd(slug: Annotated[str, typer.Argument(help="Skill slug")]) -> None:
    """Show publish status and version review summaries."""
    try:
        cli = _ctx()
        status, body = request_json(
            "GET",
            join_registry_url(cli.registry, f"/skills/{slug_path(slug)}"),
            token=cli.token,
        )
        raise_for_api_status(status, body)
        if cli.json_output:
            emit_json(body)
        else:
            print_skill_status(body)
    except Exception as exc:  # noqa: BLE001
        _handle_error(exc)


@app.command("report")
def report_cmd(
    slug: Annotated[str, typer.Argument(help="Skill slug")],
    version: Annotated[str, typer.Option("--version", help="Version (default: latest)")] = "latest",
) -> None:
    """Show security and quality report for a version."""
    try:
        cli = _ctx()
        status, body = request_json(
            "GET",
            join_registry_url(
                cli.registry,
                f"/skills/{slug_path(slug)}/versions/{slug_path(version)}",
            ),
            token=cli.token,
        )
        raise_for_api_status(status, body)
        if cli.json_output:
            emit_json(body)
        else:
            print_report_version(body, slug=slug)
    except Exception as exc:  # noqa: BLE001
        _handle_error(exc)


# --- publish / review ---


@app.command("publish")
def publish_cmd(
    package: Annotated[str, typer.Argument(help="Skill directory or .zip")],
    version: Annotated[Optional[str], typer.Option("--version", help="SemVer version to publish")] = None,
    display_name: Annotated[
        Optional[str], typer.Option("--display-name", help="Display name (overrides SKILL.md name)")
    ] = None,
    slug: Annotated[Optional[str], typer.Option("--slug", help="Skill slug (overrides SKILL.md slug)")] = None,
    description: Annotated[
        Optional[str], typer.Option("--description", help="Skill summary (overrides SKILL.md description)")
    ] = None,
    category: Annotated[
        Optional[list[str]], typer.Option("--category", help="Category label (repeatable, max 3)")
    ] = None,
    topic: Annotated[
        Optional[list[str]], typer.Option("--topic", help="Topic tag (repeatable)")
    ] = None,
    release_tag: Annotated[
        Optional[list[str]], typer.Option("--release-tag", help="Release tag (repeatable; default: latest)")
    ] = None,
    changelog: Annotated[Optional[str], typer.Option("--changelog", help="Changelog text")] = None,
    dry_run: Annotated[bool, typer.Option("--dry-run", help="Preview without publishing")] = False,
) -> None:
    """Publish a skill package to the registry."""
    try:
        cli = _ctx()
        token = cli.require_token()
        package_path = resolve_package_path(package)
        hints = read_frontmatter_hints(package_path)
        metadata = build_publish_metadata(
            hints,
            display_name=display_name,
            slug=slug,
            description=description,
            categories=category,
            topics=topic,
            version=version,
            release_tags=release_tag,
            interactive=not cli.json_output,
            no_input=cli.no_input,
        )
        archive_base64 = package_to_base64(package_path)
        body: dict[str, Any] = {"archiveBase64": archive_base64, "metadata": metadata}
        if changelog:
            body["changelog"] = changelog
        path = "/skills/publish/preview" if dry_run else "/skills/publish"
        status, payload = request_json(
            method="POST",
            url=join_registry_url(cli.registry, path),
            body=body,
            token=token,
        )
        if status >= 400:
            message = _friendly_publish_error(api_error_message(payload))
            raise SkillnavError(message)
        if cli.json_output:
            emit_json(payload if not dry_run else {"metadata": metadata, **payload})
            return
        if dry_run:
            typer.echo("Dry-run preview OK.")
            typer.echo(
                f"Metadata: {metadata['slug']}@{metadata['version']} "
                f"({metadata['displayName']})"
            )
            typer.echo(f"Categories: {', '.join(metadata['categories'])}")
            typer.echo(f"Release tags: {', '.join(metadata['releaseTags'])}")
            if payload.get("entryPath"):
                typer.echo(f"Entry: {payload['entryPath']}")
            return
        typer.echo(
            f"Published {payload.get('name')} ({payload.get('slug')})@{payload.get('version')}"
        )
        typer.echo(f"Status: {payload.get('status')}")
        typer.echo(f"Hash: {payload.get('contentHash')}")
        if payload.get("review") or payload.get("evaluation"):
            print_review_result(payload)
    except Exception as exc:  # noqa: BLE001
        _handle_error(exc)


@app.command("review")
def review_cmd(
    package: Annotated[str, typer.Argument(help="Skill directory or .zip")],
    version: Annotated[Optional[str], typer.Option("--version", help="Version label")] = None,
) -> None:
    """Run remote review without publishing."""
    try:
        cli = _ctx()
        archive_base64 = package_to_base64(resolve_user_path(package))
        body: dict[str, Any] = {"archiveBase64": archive_base64}
        if version:
            body["version"] = version
        status, payload = request_json(
            "POST",
            join_registry_url(cli.registry, "/reviews/run"),
            body=body,
            token=cli.require_token(),
        )
        raise_for_api_status(status, payload)
        if cli.json_output:
            emit_json(payload)
            return
        if payload.get("review") or payload.get("evaluation"):
            print_review_result(payload)
    except Exception as exc:  # noqa: BLE001
        _handle_error(exc)


# --- download / install ---


@app.command("download")
def download_cmd(
    slug: Annotated[str, typer.Argument(help="Skill slug")],
    output: Annotated[
        Optional[Path], typer.Option("-o", "--output", help="Output zip path")
    ] = None,
    version: Annotated[str, typer.Option("--version", help="Version to download")] = "latest",
) -> None:
    """Download a skill version as a zip file."""
    try:
        cli = _ctx()
        token = cli.require_token()
        status, data, headers = request_bytes(
            "GET",
            join_registry_url(
                cli.registry,
                f"/skills/{slug_path(slug)}/versions/{slug_path(version)}/download",
            ),
            token=token,
        )
        if status >= 400:
            try:
                import json

                payload = json.loads(data.decode("utf-8"))
                raise SkillnavError(api_error_message(payload))
            except (json.JSONDecodeError, UnicodeDecodeError):
                raise SkillnavError(f"download failed ({status})") from None
        filename = parse_content_disposition_filename(headers.get("Content-Disposition"))
        out_path = output or Path(f"{slug}-{version}.zip")
        out_path.write_bytes(data)
        if cli.json_output:
            emit_json({"path": str(out_path.resolve()), "bytes": len(data), "fileName": filename})
        else:
            typer.echo(f"Downloaded {slug}@{version} to {out_path.resolve()}")
    except Exception as exc:  # noqa: BLE001
        _handle_error(exc)


@app.command("install")
def install_cmd(
    slug: Annotated[str, typer.Argument(help="Skill slug")],
    version: Annotated[str, typer.Option("--version", help="Version to install")] = "latest",
    dir: Annotated[
        Optional[Path], typer.Option("--dir", help="Target directory")
    ] = None,
) -> None:
    """Download and extract a skill as a directory."""
    try:
        cli = _ctx()
        token = cli.require_token()
        status, data, _headers = request_bytes(
            "GET",
            join_registry_url(
                cli.registry,
                f"/skills/{slug_path(slug)}/versions/{slug_path(version)}/download",
            ),
            token=token,
        )
        if status >= 400:
            import json

            try:
                payload = json.loads(data.decode("utf-8"))
                raise SkillnavError(api_error_message(payload))
            except (json.JSONDecodeError, UnicodeDecodeError):
                raise SkillnavError(f"download failed ({status})") from None
        target = dir or Path(slug)
        extract_zip_to_directory(data, target)
        if cli.json_output:
            emit_json({"path": str(target.resolve()), "slug": slug, "version": version})
        else:
            typer.echo(f"Installed {slug}@{version} to {target.resolve()}")
    except Exception as exc:  # noqa: BLE001
        _handle_error(exc)


# --- community ---


@app.command("rate")
def rate_cmd(
    slug: Annotated[str, typer.Argument(help="Skill slug")],
    score: Annotated[int, typer.Option("--score", help="Score from 1 to 5")],
    comment: Annotated[Optional[str], typer.Option("--comment", help="Optional comment")] = None,
    version: Annotated[Optional[str], typer.Option("--version", help="Rated version")] = None,
) -> None:
    """Rate a skill."""
    try:
        cli = _ctx()
        body: dict[str, Any] = {"score": score}
        if comment:
            body["comment"] = comment
        if version:
            body["version"] = version
        status, payload = request_json(
            "POST",
            join_registry_url(cli.registry, f"/skills/{slug_path(slug)}/ratings"),
            body=body,
            token=cli.require_token(),
        )
        raise_for_api_status(status, payload)
        if cli.json_output:
            emit_json(payload)
        else:
            typer.echo("Rating submitted.")
    except Exception as exc:  # noqa: BLE001
        _handle_error(exc)


@app.command("issue")
def issue_cmd(
    slug: Annotated[str, typer.Argument(help="Skill slug")],
    title: Annotated[str, typer.Option("--title", help="Issue title")],
    type: Annotated[str, typer.Option("--type", help="Issue type")] = "bug",
    severity: Annotated[str, typer.Option("--severity", help="Severity")] = "medium",
    body_text: Annotated[Optional[str], typer.Option("--body", help="Issue body")] = None,
) -> None:
    """Create an issue for a skill."""
    try:
        cli = _ctx()
        body: dict[str, Any] = {"title": title, "type": type, "severity": severity}
        if body_text:
            body["body"] = body_text
        status, payload = request_json(
            "POST",
            join_registry_url(cli.registry, f"/skills/{slug_path(slug)}/issues"),
            body=body,
            token=cli.require_token(),
        )
        raise_for_api_status(status, payload)
        if cli.json_output:
            emit_json(payload)
        else:
            typer.echo(f"Issue created: {unwrap_resource_id(payload, 'issue')}")
    except Exception as exc:  # noqa: BLE001
        _handle_error(exc)


@app.command("issues")
def issues_cmd(
    slug: Annotated[str, typer.Argument(help="Skill slug")],
    status_filter: Annotated[
        Optional[str], typer.Option("--status", help="open, triaged, closed")
    ] = None,
) -> None:
    """List issues for a skill."""
    try:
        cli = _ctx()
        query = {"status": status_filter} if status_filter else None
        status, payload = request_json(
            "GET",
            join_registry_url(cli.registry, f"/skills/{slug_path(slug)}/issues", query),
        )
        raise_for_api_status(status, payload)
        if cli.json_output:
            emit_json(payload)
        else:
            items = payload.get("items") if isinstance(payload, dict) else None
            if items is None and isinstance(payload, list):
                items = payload
            items = items or []
            if not items:
                typer.echo("No issues.")
                return
            for item in items:
                typer.echo(
                    f"- [{item.get('status', '?')}] {item.get('id', '?')}: {item.get('title', '?')}"
                )
    except Exception as exc:  # noqa: BLE001
        _handle_error(exc)


@app.command("add-contributor")
def add_contributor_cmd(
    slug: Annotated[str, typer.Argument(help="Skill slug")],
    username: Annotated[str, typer.Option("--username", help="Contributor username")],
) -> None:
    """Add a contributor (owner only)."""
    try:
        cli = _ctx()
        status, payload = request_json(
            "POST",
            join_registry_url(cli.registry, f"/skills/{slug_path(slug)}/contributors"),
            body={"name": username, "role": "contributor"},
            token=cli.require_token(),
        )
        raise_for_api_status(status, payload)
        if cli.json_output:
            emit_json(payload)
        else:
            typer.echo(f"Contributor added: {username}")
    except Exception as exc:  # noqa: BLE001
        _handle_error(exc)


@app.command("remove-contributor")
def remove_contributor_cmd(
    slug: Annotated[str, typer.Argument(help="Skill slug")],
    id: Annotated[Optional[str], typer.Option("--id", help="Contributor id")] = None,
    username: Annotated[
        Optional[str], typer.Option("--username", help="Contributor username or display name")
    ] = None,
) -> None:
    """Remove a contributor (owner only)."""
    try:
        if not id and not username:
            raise UsageError("specify --id or --username")
        if id and username:
            raise UsageError("specify only one of --id or --username")

        cli = _ctx()
        token = cli.require_token()
        contributor_id = id
        if username:
            status, skill_body = request_json(
                "GET",
                join_registry_url(cli.registry, f"/skills/{slug_path(slug)}"),
                token=token,
            )
            raise_for_api_status(status, skill_body)
            contributor_id = resolve_contributor_id(skill_body, username)

        status, payload = request_json(
            "DELETE",
            join_registry_url(
                cli.registry,
                f"/skills/{slug_path(slug)}/contributors/{slug_path(contributor_id)}",
            ),
            token=token,
        )
        raise_for_api_status(status, payload)
        if cli.json_output:
            emit_json(payload)
        else:
            label = username or contributor_id
            typer.echo(f"Contributor removed: {label}")
    except Exception as exc:  # noqa: BLE001
        _handle_error(exc)


def run(argv: list[str] | None = None) -> int:
    try:
        app(prog_name="skillnav", args=argv)
        return EXIT_OK
    except typer.Exit as exc:
        return int(exc.exit_code)
    except KeyboardInterrupt:
        emit_error("interrupted", json_output=bool(_state.get("ctx") and _state["ctx"].json_output))
        return 130


def main() -> None:
    raise SystemExit(run())


if __name__ == "__main__":
    main()
