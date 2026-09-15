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
