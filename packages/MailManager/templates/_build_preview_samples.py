"""Generate local, non-delivery previews for the MSN email style candidates."""
from __future__ import annotations

import base64
from pathlib import Path
from string import Template


ROOT = Path(__file__).resolve().parent
LOGO_BASE64 = base64.b64encode((ROOT / "msn-logo.png").read_bytes()).decode("ascii")
SAMPLES = {
    "msn_email_style_editorial_preview_sample.html": "msn_email_style_editorial.html",
    "msn_email_style_obsidian_preview_sample.html": "msn_email_style_obsidian.html",
    "msn_email_style_horizon_preview_sample.html": "msn_email_style_horizon.html",
}
SAMPLE_CONTEXT = {
    "subject": "Skill 发布成功",
    "brand_name": "MonoSkillNavigator",
    "name": "张三，",
    "main_content": (
        "您的 Skill <strong>Demo Skill（slug：demo-skill）</strong> 的版本 "
        "<strong>v1.0.0</strong> 已完成审查并成功发布，现可在平台公开搜索中访问。"
    ),
    "note": (
        '<div class="note">如需调整公开范围，可在 Skill 详情页使用「下架」。'
        "新版本审查期间，已有公开版本仍会保留展示。</div>"
    ),
    "end_content": '<p>查看详情：<a href="https://example.com/skills/demo-skill">打开 Skill 页面</a></p>',
    "comment": (
        '<div class="comment">此为系统自动通知，请勿直接回复本邮件。'
        "如有疑问请联系平台管理员。</div>"
    ),
    "signature_name": "<strong>MonoSkillNavigator Team</strong>",
    "signature_email": '<div class="signature-email">support@example.com</div><br>',
    "logo_base64": LOGO_BASE64,
}


def build_preview(template_filename: str) -> str:
    """Render a standalone sample that can be opened without a web server."""
    source = (ROOT / template_filename).read_text(encoding="utf-8")
    return Template(source).substitute(SAMPLE_CONTEXT)


def main() -> None:
    for preview_filename, template_filename in SAMPLES.items():
        (ROOT / preview_filename).write_text(
            build_preview(template_filename),
            encoding="utf-8",
        )
        print(f"Generated {preview_filename}")


if __name__ == "__main__":
    main()
