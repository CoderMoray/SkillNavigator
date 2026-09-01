"""CLI exit codes and error types (see docs/cli-design.md §7)."""

from __future__ import annotations

from skillnav.error_hints import ErrorHint

EXIT_OK = 0
EXIT_BUSINESS = 1
EXIT_AUTH = 2
EXIT_USAGE = 3
EXIT_NETWORK = 4
EXIT_INTERRUPT = 130


class SkillnavError(Exception):
    """Base error with an exit code and optional agent-oriented hint fields."""

    exit_code: int = EXIT_BUSINESS

    def __init__(
        self,
        message: str,
        *,
        detail: str | None = None,
        next_steps: tuple[str, ...] | list[str] | None = None,
        hint: ErrorHint | None = None,
    ) -> None:
        if hint is not None:
            super().__init__(hint.summary)
            self.message = hint.summary
            self.detail = hint.detail
            self.next_steps = tuple(hint.next_steps)
        else:
            super().__init__(message)
            self.message = message
            self.detail = detail
            self.next_steps = tuple(next_steps or ())

    @classmethod
    def from_hint(cls, hint: ErrorHint) -> SkillnavError:
        return cls(hint.summary, hint=hint)

    @classmethod
    def from_hint(cls, hint: ErrorHint) -> SkillnavError:
        return cls(hint.summary, hint=hint)


class AuthError(SkillnavError):
    exit_code = EXIT_AUTH


class UsageError(SkillnavError):
    exit_code = EXIT_USAGE


class NetworkError(SkillnavError):
    exit_code = EXIT_NETWORK
