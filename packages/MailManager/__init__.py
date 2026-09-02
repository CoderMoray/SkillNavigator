"""
MailManager - 通用邮件生成与发送包

仅依赖标准库，不依赖任何项目内部配置。
邮件初始化参数由外部系统在实例化时传入，因此可被任意外部系统通用。

用法：
    from MailManager import MailManager

    mail = MailManager(
        smtp_server="smtp.example.com",
        smtp_port=587,
        smtp_user="sender@example.com",
        smtp_password="xxx",
        smtp_ssl=False,
        smtp_tls=True,
        smtp_timeout=10,
        maildrop_dir=None,       # 默认 MailManager/maildrop/
        bcc_monitor=None,        # 可选：自动暗送监控邮箱（不硬编码）
    )

    mail.generate(to=["user@example.com"], subject="测试",
                  content_body={...}, template_style="MSN - General")
    mail.send_from_maildrop()
    mail.clear(days=30)
"""

from .mailmanager import MailManager

__all__ = ["MailManager"]
__version__ = "1.0.0"
