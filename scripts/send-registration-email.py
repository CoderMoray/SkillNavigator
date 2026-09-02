#!/usr/bin/env python3
"""Send one auth email via MailManager (stdin JSON payload).

Supports mail_type "verify" (registration email verification, default)
and "password_reset" (forgot-password reset link).
"""
from __future__ import annotations

import contextlib
import json
import os
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[1]


def _packages_dir() -> Path:
    return _repo_root() / "packages"


def _smtp_ssl_default(port: int) -> bool:
    raw = os.environ.get("REPORT_MAIL_SMTP_SSL", "").strip().lower()
    if raw in {"true", "1", "yes"}:
        return True
    if raw in {"false", "0", "no"}:
        return False
    return port == 465


def _smtp_tls_default(port: int, smtp_ssl: bool) -> bool:
    raw = os.environ.get("REPORT_MAIL_SMTP_TLS", "").strip().lower()
    if raw in {"true", "1", "yes"}:
        return True
    if raw in {"false", "0", "no"}:
        return False
    return not smtp_ssl and port == 587


def main() -> int:
    try:
        payload = json.load(sys.stdin)
    except json.JSONDecodeError as exc:
        print(json.dumps({"ok": False, "error": f"invalid_json: {exc}"}))
        return 1

    required_env = [
        "REPORT_MAIL_USERNAME",
        "REPORT_MAIL_PASSWORD",
        "REPORT_MAIL_SMTP_SERVER",
        "REPORT_MAIL_SMTP_PORT",
    ]
    missing = [name for name in required_env if not os.environ.get(name, "").strip()]
    if missing:
        print(json.dumps({"ok": False, "error": f"missing_env: {','.join(missing)}"}))
        return 1

    to = payload.get("to")
    username = payload.get("username")
    mail_type = payload.get("mailType") or "verify"
    url_field = "resetUrl" if mail_type == "password_reset" else "verifyUrl"
    action_url = payload.get(url_field)
    if not isinstance(to, str) or not to.strip():
        print(json.dumps({"ok": False, "error": "missing_to"}))
        return 1
    if not isinstance(username, str) or not username.strip():
        print(json.dumps({"ok": False, "error": "missing_username"}))
        return 1
    if not isinstance(action_url, str) or not action_url.strip():
        print(json.dumps({"ok": False, "error": f"missing_{url_field}"}))
        return 1

    sys.path.insert(0, str(_packages_dir()))
    from MailManager import MailManager

    smtp_port = int(os.environ["REPORT_MAIL_SMTP_PORT"])
    smtp_ssl = _smtp_ssl_default(smtp_port)
    smtp_tls = _smtp_tls_default(smtp_port, smtp_ssl)
    maildrop_dir = os.environ.get("REPORT_MAIL_MAILDROP_DIR", "").strip() or str(
        _packages_dir() / "MailManager" / "maildrop"
    )

    mail = MailManager(
        smtp_server=os.environ["REPORT_MAIL_SMTP_SERVER"],
        smtp_port=smtp_port,
        smtp_user=os.environ["REPORT_MAIL_USERNAME"],
        smtp_password=os.environ["REPORT_MAIL_PASSWORD"],
        smtp_ssl=smtp_ssl,
        smtp_tls=smtp_tls,
        smtp_timeout=int(os.environ.get("REPORT_MAIL_SMTP_TIMEOUT", "30") or "30"),
        maildrop_dir=maildrop_dir,
    )

    if mail_type == "password_reset":
        subject = "重置您的 MonoSkillNavigator 账户密码"
        main_content = (
            "我们收到了重置密码的请求。请点击下方链接设置新密码："
            f'<br><br><a href="{action_url.strip()}">{action_url.strip()}</a>'
        )
        note = "若您未发起重置请求，请忽略此邮件，您的密码不会被更改。"
        comment = "链接有效期为 1 小时，过期后请重新申请。"
    else:
        mail_kind = payload.get("mailKind") or ("resend" if mail_type == "verify_resend" else "register")
        stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M")
        nonce = uuid.uuid4().hex[:6]
        if mail_kind == "resend":
            subject = f"请验证您的 MonoSkillNavigator 账户邮箱（重发 {stamp}-{nonce}）"
        else:
            subject = f"请验证您的 MonoSkillNavigator 账户邮箱（{stamp}-{nonce}）"
        main_content = (
            "感谢注册 MonoSkillNavigator。请点击下方链接验证邮箱后完成账户激活："
            f'<br><br><a href="{action_url.strip()}">{action_url.strip()}</a>'
        )
        note = "若您未发起注册，请忽略此邮件。"
        comment = "链接有效期为 24 小时，过期后可在登录页重新申请验证邮件。"

    with contextlib.redirect_stdout(sys.stderr):
        mail.generate(
            to=[to.strip()],
            subject=subject,
            if_template=True,
            template_style="Rapid OS - General",
            content_body={
                "subject": subject,
                "name": username.strip(),
                "main_content": main_content,
                "note": note,
                "end_content": "",
                "comment": comment,
                "signature_name": "<strong>MonoSkillNavigator Team</strong>",
                "signature_email": os.environ["REPORT_MAIL_USERNAME"],
            },
        )
        mail.send_from_maildrop()

    print(json.dumps({"ok": True}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
