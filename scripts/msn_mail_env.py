"""Shared MailManager / MSN mail settings for repo send scripts."""
from __future__ import annotations

import os

# Platform default: B · Obsidian Signal
DEFAULT_MSN_TEMPLATE_STYLE = "MSN - Obsidian"


def msn_template_style() -> str:
    """Resolve HTML template style (override via MSN_MAIL_TEMPLATE_STYLE)."""
    return (
        os.environ.get("MSN_MAIL_TEMPLATE_STYLE", "").strip()
        or DEFAULT_MSN_TEMPLATE_STYLE
    )
