"""
SMTP 发送层（从原 apple/core/mailmanager.py 提取，去除 IMAP 与硬编码监控邮箱）。

仅负责 SMTP 连接的建立与邮件发送，不依赖任何项目配置。
"""
import os
import time as _time
import smtplib
import uuid
from email.header import Header
from email.mime.image import MIMEImage
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.utils import formatdate, make_msgid


class SMTPServer(object):
    """SMTP 发送核心类。

    初始化仅把连接参数存入实例变量，不做任何网络握手；
    真正的连接发生在 sendmail_batch() 调用时，发送完毕后立即关闭。

    Args:
        server (str): SMTP 服务器地址
        port (int): 端口
        user (str): 登录用户名
        password (str): 登录密码
        ssl (bool, optional): 是否使用 SMTP_SSL. Defaults to True.
        tls (bool, optional): 是否 starttls. Defaults to True.
        timeout (int, optional): 连接超时（秒）. Defaults to None.
    """

    def __init__(self, server, port, user, password, ssl=True, tls=True, timeout=None):
        self.__server, self.__port, self.__user, self.__password = server, port, user, password
        self.__ssl, self.__tls, self.__timeout = ssl, tls, timeout

    def sendmail_batch(self, pending: list, bcc_monitor: str = None) -> int:
        """单连接批量发送，每封出错时重连继续，不中断。

        Args:
            pending: [(pkl_file_path, mail_dict), ...]
            bcc_monitor: 可选，若提供且不在收件人列表中，则每封自动加入该暗送地址

        Returns:
            失败数（成功的邮件 .pkl 已重命名为 .pkl.sent）
        """
        失败数 = 0

        def _connect():
            if self.__ssl:
                self._smtp = smtplib.SMTP_SSL(self.__server, self.__port, timeout=self.__timeout)
            else:
                self._smtp = smtplib.SMTP(self.__server, self.__port, timeout=self.__timeout)
            if self.__tls:
                self._smtp.starttls()
            self._smtp.login(self.__user, self.__password)
            self._smtp.command_encoding = "utf-8"

        # 初始连接（含 3 次重试）
        连接失败 = None
        for attempt in range(1, 4):
            try:
                _connect()
                连接失败 = None
                break
            except Exception as e:
                连接失败 = e
                print(f"⚠️ SMTP 连接第 {attempt} 次失败（{type(e).__name__}），3 秒后重试...")
                _time.sleep(3)
        if 连接失败:
            raise ConnectionError(
                f"SMTP 连接失败，已重试 3 次。\n"
                f"最后错误: {type(连接失败).__name__}: {连接失败}"
            )

        try:
            for plk_path, mail in pending:
                try:
                    to = list(set(mail["to"]))
                    cc = list(set(mail["cc"]))
                    bcc = list(set(mail["bcc"]))
                    subject = mail["subject"]
                    content = mail["content"]
                    attachments = mail.get("attachments", {})
                    reply_to = mail.get("reply_to", [])

                    # 可选监控暗送
                    all_addresses = to + cc + bcc
                    if bcc_monitor and bcc_monitor not in all_addresses:
                        bcc.append(bcc_monitor)

                    # 构造邮件
                    message = MIMEMultipart()
                    message["From"] = self.__user
                    # RFC 5322: To/Cc use plain address lists; Header() here can break delivery.
                    message["To"] = ", ".join(to)
                    if cc:
                        message["Cc"] = ", ".join(cc)
                    message["Subject"] = Header(subject, "utf-8")
                    message["Date"] = formatdate(localtime=True)
                    domain = self.__user.split("@", 1)[-1] if "@" in self.__user else "localhost"
                    message["Message-ID"] = make_msgid(domain=domain)
                    if reply_to:
                        message.add_header("Reply-To", ", ".join(reply_to))
                    att_part = MIMEText(content, "html", "utf-8")
                    att_part["Content-Type"] = "text/html;charset=utf-8"
                    att_part["Content-Disposition"] = "inline"
                    message.attach(att_part)
                    for name, attachment in attachments.items():
                        if name.startswith("image:"):
                            img = MIMEImage(attachment, _subtype="png")
                            img.add_header("Content-ID", "<%s>" % name.split(":")[1])
                            message.attach(img)
                        else:
                            att_part = MIMEText(attachment, "base64", "utf-8")
                            att_part["Content-Type"] = "application/octet-stream"
                            att_part.add_header("Content-Disposition", "attachment", filename=name)
                            message.attach(att_part)

                    self._smtp.sendmail(
                        self.__user,
                        ["<" + x + ">" for x in to + cc + bcc if len(x) > 0],
                        message.as_string(),
                    )
                    os.rename(plk_path, f"{plk_path}.sent")
                    print(f"  ✅ {subject} → {to}")

                except Exception as e:
                    失败数 += 1
                    print(f"  ❌ {subject} → {to} 失败（{type(e).__name__}）: {e}")
                    # 重连（连接可能已损坏）
                    try:
                        self._smtp.close()
                    except Exception:
                        pass
                    try:
                        _connect()
                    except Exception as reconnect_err:
                        print(f"  重连失败: {reconnect_err}")
                        break  # 连不上就停，剩余下次再发
        finally:
            try:
                self._smtp.close()
            except Exception:
                pass

        return 失败数
