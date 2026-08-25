"""CLI exit codes and error types (see docs/cli-design.md §7)."""

from __future__ import annotations

EXIT_OK = 0
EXIT_BUSINESS = 1
EXIT_AUTH = 2
EXIT_USAGE = 3
EXIT_NETWORK = 4
EXIT_INTERRUPT = 130


class SkillnavError(Exception):
    """Base error with an exit code."""

    exit_code: int = EXIT_BUSINESS

    def __init__(self, message: str) -> None:
        super().__init__(message)
        self.message = message


class AuthError(SkillnavError):
    exit_code = EXIT_AUTH


class UsageError(SkillnavError):
    exit_code = EXIT_USAGE


class NetworkError(SkillnavError):
    exit_code = EXIT_NETWORK
