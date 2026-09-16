"""Global options must precede the subcommand (agent feedback B1).

click's default answer for a misplaced global option is a name-similarity guess
("--no-input" -> "Did you mean '--output'?"), which agents treat as a valid fix.
The CLI now answers with the actual problem instead.
"""

from __future__ import annotations

import pytest
from typer.testing import CliRunner

from conftest import cli_output
from skillnav.cli import app


@pytest.mark.parametrize("option", ["--no-input", "--json", "--profile", "--registry"])
def test_misplaced_global_option_gets_an_actionable_hint(
    runner: CliRunner, option: str
) -> None:
    result = runner.invoke(app, ["download", "demo-skill", option])

    assert result.exit_code == 2
    output = cli_output(result)
    assert "global option" in output
    assert option in output
    assert "download" in output  # the hint shows where the option belongs
    assert "Did you mean" not in output


def test_misplaced_global_option_with_inline_value_is_caught(runner: CliRunner) -> None:
    result = runner.invoke(
        app, ["download", "demo-skill", "--registry=http://127.0.0.1:3000"]
    )

    assert result.exit_code == 2
    assert "global option" in cli_output(result)


def test_global_option_before_the_subcommand_still_works(
    runner: CliRunner, isolated_config
) -> None:
    result = runner.invoke(app, ["--json", "config", "list"])

    assert result.exit_code == 0, result.output


def test_valued_global_option_before_the_subcommand_is_not_confused_with_it(
    runner: CliRunner, isolated_config
) -> None:
    """`--registry <url> --no-input config list`: the URL is a value, not the subcommand.

    Locating the subcommand by "the first token without a dash" made the URL
    look like the subcommand, so every global option after it was reported as
    misplaced — which broke `publish`, `info` and the contributor commands.
    """
    result = runner.invoke(
        app,
        ["--registry", "http://127.0.0.1:3000", "--no-input", "config", "list"],
    )

    assert result.exit_code == 0, cli_output(result)
    assert "global option" not in cli_output(result)


def test_install_dir_check_still_fires_after_a_valued_global_option(
    runner: CliRunner, isolated_config
) -> None:
    result = runner.invoke(
        app, ["--registry", "http://127.0.0.1:3000", "install", "demo-skill"]
    )

    assert result.exit_code == 2
    assert "--dir" in cli_output(result)


def test_subcommand_owned_option_is_not_flagged_as_global(
    runner: CliRunner, isolated_config
) -> None:
    """`config add` declares --registry itself, so it must stay accepted.

    The subcommand walk has to work on Typer 0.24+, which builds commands from
    a vendored click fork: a plain ``isinstance(command, click.Group)`` check
    fails there, the walk stops at the first subcommand, and every
    ``config add --registry`` was rejected as a misplaced global option.
    """
    result = runner.invoke(
        app, ["config", "add", "probe", "--registry", "https://example.com/api"]
    )

    assert result.exit_code == 0, cli_output(result)
    output = cli_output(result)
    assert "Added profile" in output
    assert "global option" not in output
