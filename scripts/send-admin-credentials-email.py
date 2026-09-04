#!/usr/bin/env python3
"""Send the bootstrap administrator credentials email via MailManager (stdin JSON payload).

Payload: {"to": str, "username": str, "password": str}
Requires REPORT_MAIL_* env vars. Exit code 0 on success; 2 when mail is not
configured so callers can degrade to printing the credentials in logs.
"""
from __future__ import annotations

import contextlib
import json
import os
import sys
from pathlib import Path


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[1]


def _packages_dir() -> Path:
    return _repo_root() / "packages"


def _env_flag(name: str, default: bool) -> bool:
    raw = os.environ.get(name, "").strip().lower()
    if raw in {"true", "1", "yes"}:
        return True
    if raw in {"false", "0", "no"}:
        return False
    return default


def main() -> int:
    try:
        payload = json.load(sys.stdin)
    except json.JSONDecodeError as exc:
        print(json.dumps({"ok": False, "error": f"invalid_json: {exc}"}))
        return 1

    to = payload.get("to")
    username = payload.get("username")
    password = payload.get("password")
    if not isinstance(to, str) or not to.strip():
        print(json.dumps({"ok": False, "error": "missing_to"}))
        return 1
    if not isinstance(username, str) or not username.strip():
        print(json.dumps({"ok": False, "error": "missing_username"}))
        return 1
    if not isinstance(password, str) or not password:
        print(json.dumps({"ok": False, "error": "missing_password"}))
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
        return 2

    sys.path.insert(0, str(_packages_dir()))
    from MailManager import MailManager

    smtp_port = int(os.environ["REPORT_MAIL_SMTP_PORT"])
    smtp_ssl = _env_flag("REPORT_MAIL_SMTP_SSL", smtp_port == 465)
    smtp_tls = _env_flag("REPORT_MAIL_SMTP_TLS", not smtp_ssl and smtp_port == 587)
    maildrop_dir = os.environ.get("REPORT_MAIL_MAILDROP_DIR", "").strip() or str(
        _packages_dir() / "MailManager" / "maildrop"
    )
    brand_name = os.environ.get("BRAND_NAME", "").strip() or "SkillNavigator"

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

    subject = f"您的 {brand_name} 管理员账号已创建"
    web_url = (
        os.environ.get("WEB_PUBLIC_URL", "").strip()
        or os.environ.get("NEXT_PUBLIC_WEB_URL", "").strip()
    )
    login_block = (
        f'<br><br>平台地址：<a href="{web_url}">{web_url}</a>'
        if web_url
        else "<br><br>（平台登录地址请向部署方确认）"
    )
    main_content = (
        f"管理员账号 <strong>{username}</strong> 已创建，可登录 {brand_name} 平台（Web）进行 Skill 管理与账户配置。"
        + login_block
        + f"<br><br>初始密码：<strong>{password}</strong>"
        "<br><br>请妥善保管，登录后请尽快在“账户设置”中修改密码。"
    )
    note = "初始密码仅此一次以明文提供，请勿转发此邮件。"
    comment = "若您未发起管理员账号创建，请忽略此邮件并联系部署方。"

    with contextlib.redirect_stdout(sys.stderr):
        mail.generate(
            to=[to.strip()],
            subject=subject,
            if_template=True,
            template_style="MSN - General",
            content_body={
                "subject": subject,
                "name": "",
                "main_content": main_content,
                "note": note,
                "end_content": "",
                "comment": comment,
                "signature_name": f"<strong>{brand_name} Team</strong>",
                "signature_email": os.environ["REPORT_MAIL_USERNAME"],
                "brand_name": brand_name,
            },
        )
        mail.send_from_maildrop()

    print(json.dumps({"ok": True}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
