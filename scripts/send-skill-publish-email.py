#!/usr/bin/env python3
"""Send Skill publish outcome notifications through MailManager.

Input is a JSON object on stdin. The TypeScript API determines recipients and
whether administrators are CC'ed; this script only validates the payload,
renders the MSN general template, and sends the queued message.
"""
from __future__ import annotations

import contextlib
import html
import json
import os
import sys
from pathlib import Path
from typing import Any, Dict, List, Tuple


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


def _brand_name() -> str:
    return os.environ.get("BRAND_NAME", "").strip() or "SkillNavigator"


def _email_list(value: Any, field: str) -> List[str]:
    if not isinstance(value, list):
        raise ValueError(f"{field}_must_be_list")
    values = [item.strip() for item in value if isinstance(item, str) and item.strip()]
    if len(values) != len(value):
        raise ValueError(f"{field}_contains_invalid_address")
    return values


def _required_text(payload: Dict[str, Any], field: str) -> str:
    value = payload.get(field)
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"missing_{field}")
    return value.strip()


def _link(url: str, label: str) -> str:
    return f'<a href="{html.escape(url, quote=True)}">{html.escape(label)}</a>'


def _message_content(
    outcome: str,
    skill_name: str,
    slug: str,
    version: str,
    detail_url: str,
    publicly_listed: bool,
    failure_message: str,
    brand: str,
) -> Tuple[str, str, str, str]:
    safe_skill = f"{html.escape(skill_name)}（slug：{html.escape(slug)}）"
    safe_version = html.escape(version)
    detail_link = _link(detail_url, "打开 Skill 详情")

    if outcome == "published":
        visibility = (
            "该版本已在公开搜索和 Skill 详情页中可见。"
            if publicly_listed
            else "该版本已完成审查；此 Skill 当前保持下架状态，因此不会出现在公开搜索中。"
        )
        return (
            f"Skill <strong>{safe_skill}</strong> 的版本 <strong>v{safe_version}</strong> 已完成审查并成功发布。{visibility}",
            "平台管理员已被抄送本次发布通知，供发布记录留存。",
            f"<p>{detail_link}</p>",
            "本邮件已发送给 Skill 作者和全部协作者。",
        )

    if outcome == "rejected":
        return (
            f"Skill <strong>{safe_skill}</strong> 的版本 <strong>v{safe_version}</strong> 未通过审查，"
            "该版本不会公开上架。",
            "请让 AI 根据审查报告中的 finding 修改 Skill 内容，然后发布一个新的版本。",
            f"<p>{detail_link}</p>",
            "审查结论已保留在网页详情中。若此 Skill 有更早的公开版本，它会继续按原状态对外可见。",
        )

    safe_failure = html.escape(failure_message) if failure_message else "未提供具体错误信息"
    return (
        f"Skill <strong>{safe_skill}</strong> 的版本 <strong>v{safe_version}</strong> 审查被中断，"
        "该版本尚未公开上架。",
        "请前往网页查看中断的审查环节并重新扫描，或让 AI 重新扫描这个 Skill 后再继续发布。",
        f"<p>{detail_link}</p>",
        f"中断摘要：{safe_failure}",
    )


def main() -> int:
    try:
        payload = json.load(sys.stdin)
        if not isinstance(payload, dict):
            raise ValueError("payload_must_be_object")

        to = _email_list(payload.get("to"), "to")
        cc = _email_list(payload.get("cc", []), "cc")
        if not to:
            raise ValueError("missing_to")
        recipient_name = _required_text(payload, "recipientName")

        outcome = _required_text(payload, "outcome")
        if outcome not in {"published", "interrupted", "rejected"}:
            raise ValueError("invalid_outcome")

        skill_name = _required_text(payload, "skillName")
        slug = _required_text(payload, "slug")
        version = _required_text(payload, "version")
        detail_url = _required_text(payload, "detailUrl")
        publicly_listed = payload.get("publiclyListed") is True
        failure_message = payload.get("failureMessage")
        if failure_message is not None and not isinstance(failure_message, str):
            raise ValueError("invalid_failureMessage")
    except (json.JSONDecodeError, ValueError) as exc:
        print(json.dumps({"ok": False, "error": str(exc)}))
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

    brand = _brand_name()
    subject_prefix = {
        "published": "Skill 发布成功",
        "interrupted": "Skill 审查中断",
        "rejected": "Skill 审查未通过",
    }[outcome]
    subject = f"{subject_prefix}：{skill_name}（slug：{slug}） v{version}"
    main_content, note, end_content, comment = _message_content(
        outcome,
        skill_name,
        slug,
        version,
        detail_url,
        publicly_listed,
        failure_message or "",
        brand,
    )

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

    with contextlib.redirect_stdout(sys.stderr):
        mail.generate(
            to=to,
            cc=cc,
            subject=subject,
            if_template=True,
            template_style="MSN - General",
            content_body={
                "subject": subject,
                "name": html.escape(recipient_name),
                "main_content": main_content,
                "note": note,
                "end_content": end_content,
                "comment": comment,
                "signature_name": f"<strong>{html.escape(brand)} Team</strong>",
                "signature_email": os.environ["REPORT_MAIL_USERNAME"],
                "brand_name": brand,
            },
        )
        mail.send_from_maildrop()

    print(json.dumps({"ok": True}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
