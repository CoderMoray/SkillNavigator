"""
MailManager - 通用邮件生成与发送管理器

负责：
  1. 邮件生成（write）：将邮件序列化存入 MailDrop（.pkl）
  2. 模板渲染：仅内置 MonoSkillNavigator (MSN) 风格模板，支持后续扩展
  3. 批量发送（send_from_maildrop）：从 MailDrop 读取并发送
  4. 缓存清理（clear）：删除超过 N 天的已发送缓存（.pkl.sent）

不依赖任何项目配置，所有 SMTP / 路径参数由外部系统在实例化时传入。
"""
import base64
import os
import pickle
import re
import uuid
from datetime import datetime
from pathlib import Path
from string import Template
from typing import Any, Dict, List, Optional

from .smtp import SMTPServer


class MailManager(object):
    """邮件生成与发送管理器。

    Args:
        smtp_server (str): SMTP 服务器地址
        smtp_port (int): SMTP 端口
        smtp_user (str): 登录用户名（也作为发件人 From）
        smtp_password (str): 登录密码
        smtp_ssl (bool, optional): 是否使用 SMTP_SSL. Defaults to False.
        smtp_tls (bool, optional): 是否 starttls. Defaults to True.
        smtp_timeout (int, optional): 连接超时（秒）. Defaults to None.
        maildrop_dir (str, optional): 邮件暂存目录，默认包内 maildrop/.
        bcc_monitor (str, optional): 可选监控暗送邮箱；提供则每封自动加入，但不硬编码.
    """

    def __init__(
        self,
        smtp_server: str,
        smtp_port: int,
        smtp_user: str,
        smtp_password: str,
        smtp_ssl: bool = False,
        smtp_tls: bool = True,
        smtp_timeout: Optional[int] = None,
        maildrop_dir: Optional[str] = None,
        bcc_monitor: Optional[str] = None,
    ):
        self.smtpserver = SMTPServer(
            smtp_server, smtp_port, smtp_user, smtp_password,
            smtp_ssl, smtp_tls, smtp_timeout,
        )
        # MailDrop 默认放在包内的 maildrop/ 目录
        if maildrop_dir is None:
            maildrop_dir = os.path.join(os.path.dirname(__file__), "maildrop")
        self.maildrop_dir = maildrop_dir
        os.makedirs(self.maildrop_dir, exist_ok=True)

        # 可选监控暗送（不硬编码任何邮箱）
        self._bcc_monitor = bcc_monitor

        # 模板与资源目录
        self._templates_dir = os.path.join(os.path.dirname(__file__), "templates")
        self._asset_logo = os.path.join(self._templates_dir, "msn-logo.png")

    # ------------------------------------------------------------------ #
    # 生成（排队）
    # ------------------------------------------------------------------ #
    def generate(
        self,
        to: List[str],
        subject: str = "邮件标题",
        content: str = "邮件内容",
        cc: Optional[List[str]] = None,
        bcc: Optional[List[str]] = None,
        attachments: Optional[Dict[str, Any]] = None,
        reply_to: Optional[List[str]] = None,
        if_template: bool = False,
        template_style: Optional[str] = None,
        content_body: Optional[Dict[str, Any]] = None,
    ) -> str:
        """生成一封邮件并存入 MailDrop（.pkl）。

        当 if_template=True 时，content 会被模板渲染结果替换；
        当 if_template=False 时，content 直接作为 HTML 正文。

        Args:
            to (list): 收件人
            subject (str): 邮件主题
            content (str): 正文（HTML 或用于填充模板的内容）
            cc (list, optional): 抄送
            bcc (list, optional): 密送
            attachments (dict, optional): 附件 {文件名: bytes}；"image:" 前缀作为内嵌图片
            reply_to (list, optional): 回复地址
            if_template (bool): 是否使用模板
            template_style (str, optional): 模板风格，如 "MSN - General"
            content_body (dict, optional): 模板上下文变量

        Returns:
            str: 生成的 .pkl 文件路径
        """
        cc = cc or []
        bcc = bcc or []
        reply_to = reply_to or []
        attachments = attachments or {}

        assert isinstance(to, list), "to 必须是列表"
        assert isinstance(cc, list), "cc 必须是列表"
        assert isinstance(bcc, list), "bcc 必须是列表"
        assert isinstance(reply_to, list), "reply_to 必须是列表"

        if if_template:
            if template_style is None:
                raise ValueError("使用模板时必须指定 template_style")
            style = template_style.lower()
            if style in {
                "msn - general",
                "monoskillnavigator - general",
                "rapid os - general",  # deprecated alias
            }:
                if content_body is None:
                    raise ValueError("使用模板时必须提供 content_body")
                if "subject" not in content_body:
                    content_body["subject"] = subject
                with open(self._asset_logo, "rb") as f:
                    logo_base64 = base64.b64encode(f.read()).decode("utf-8")
                content_body["logo_base64"] = logo_base64
                content = self._render_msn_os_general_template(content_body)
            else:
                raise KeyError(f"不支持的 template_style: {template_style}")
        # if_template=False 时：content 直接作为 HTML 正文

        mail = {
            "to": to,
            "cc": cc,
            "bcc": bcc,
            "subject": subject,
            "content": content,
            "attachments": attachments,
            "reply_to": reply_to,
        }
        data = pickle.dumps(mail)
        mid = str(uuid.uuid4())
        mail_file = str(Path(self.maildrop_dir, f"{mid}.pkl"))
        with open(mail_file, "wb+") as f:
            f.write(data)
        del data
        return mail_file

    # ------------------------------------------------------------------ #
    # 投递（从 MailDrop 批量发送）
    # ------------------------------------------------------------------ #
    def send_from_maildrop(self):
        """从 MailDrop 批量发送所有待发邮件。

        使用单次 SMTP 连接逐封容错发送；成功的 .pkl 重命名为 .pkl.sent。
        无待发邮件时打印提示。
        """
        pkls = [
            os.path.join(self.maildrop_dir, f)
            for f in os.listdir(self.maildrop_dir)
            if f.endswith(".pkl")
        ]

        if not pkls:
            print("没有邮件需要发送")
            return

        pending = []
        for p in pkls:
            with open(p, "rb") as f:
                mail = pickle.loads(f.read())
                if mail:
                    pending.append((p, mail))

        print(f"发现 {len(pending)} 封邮件待发送，使用单连接批量发送...")
        失败数 = self.smtpserver.sendmail_batch(pending, bcc_monitor=self._bcc_monitor)

        if 失败数:
            print(f"⚠️ 完成，{失败数}/{len(pending)} 封发送失败，将在下次调用时重试")
        else:
            print(f"✅ {len(pending)} 封邮件发送完毕")

    # ------------------------------------------------------------------ #
    # 清理（已发送缓存）
    # ------------------------------------------------------------------ #
    def clear(self, days: int = 30) -> int:
        """清理 MailDrop 中超过 N 天的已发送缓存（.pkl.sent）。

        Args:
            days (int): 保留天数，默认 30。早于 now - days 的文件被删除。

        Returns:
            int: 已删除的文件数
        """
        cutoff = datetime.now().timestamp() - days * 86400
        removed = 0
        for f in os.listdir(self.maildrop_dir):
            if f.endswith(".pkl.sent"):
                fp = os.path.join(self.maildrop_dir, f)
                if os.path.getmtime(fp) < cutoff:
                    os.remove(fp)
                    removed += 1
        print(f"已清理 {removed} 个超过 {days} 天的已发送缓存")
        return removed

    # ------------------------------------------------------------------ #
    # 模板渲染
    # ------------------------------------------------------------------ #
    def _render_msn_os_general_template(self, content_body: Dict[str, Any]) -> str:
        """渲染 MonoSkillNavigator (MSN) 通用邮件模板。

        模板文件：templates/msn_os_general_email.html
        占位符语法：${var} 或 $var（使用 string.Template.safe_substitute）
        """
        template_path = os.path.join(self._templates_dir, "msn_os_general_email.html")
        if not os.path.exists(template_path):
            raise FileNotFoundError(f"模板文件未找到: {template_path}")

        with open(template_path, "r", encoding="utf-8") as f:
            template_str = f.read()

        if not content_body:
            raise ValueError("在使用模板的情况下，需要输入 content_body 字典作为解析内容。")

        body = content_body.copy()
        brand_name = (
            str(body.get("brand_name", "")).strip()
            or os.environ.get("BRAND_NAME", "").strip()
            or "SkillNavigator"
        )
        body["brand_name"] = brand_name

        # 处理 note
        note = body.get("note", "").strip()
        body["note"] = f'<div class="note">{note}</div>' if note else ""

        # 处理 end_content
        end_content = body.get("end_content", "").strip()
        if end_content:
            if not (end_content.startswith("<p>") and end_content.endswith("</p>")):
                end_content = f"<p>{end_content}</p>"
        body["end_content"] = end_content

        # 处理 comment
        comment = body.get("comment", "").strip()
        body["comment"] = f'<div class="comment">{comment}</div>' if comment else ""

        # 处理 signature_email
        signature_email = body.get("signature_email", "").strip()
        body["signature_email"] = f'<div class="signature-email">{signature_email}</div><br>' if signature_email else "<br>"

        # 处理 signature_name（提供默认）
        if "signature_name" not in body:
            body["signature_name"] = f"<strong>{brand_name} Team</strong><br><br>"

        # 处理 name
        name = body.get("name", "").strip()
        body["name"] = f"{name}, " if name else ""

        # 提取模板中的占位符并校验缺失
        placeholder_pattern = r'\$(?:\{([_a-zA-Z][_a-zA-Z0-9]*)\}|([_a-zA-Z][_a-zA-Z0-9]*))'
        matches = re.findall(placeholder_pattern, template_str)
        placeholders = {m[0] or m[1] for m in matches}

        missing_keys = placeholders - set(body.keys())
        if missing_keys:
            raise ValueError(
                f"模板变量缺失：以下变量在 content_body 中未提供 → {missing_keys}。"
                f"模板中检测到的占位符有：{sorted(placeholders)}"
            )

        return Template(template_str).safe_substitute(body)
