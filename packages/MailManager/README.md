# MailManager

通用邮件生成与发送包。**零项目依赖**，不依赖任何项目内部配置，可直接复制到任意外部系统使用。

## 目录结构

```
MailManager/
├── __init__.py                      # 导出 MailManager，含用法文档
├── mailmanager.py                   # MailManager 类（生成 / 投递 / 清理 / 模板渲染）
├── smtp.py                          # SMTPServer（仅 SMTP 发送层，无 IMAP）
├── templates/
│   ├── msn_os_general_email.html    # 内置 MonoSkillNavigator (MSN) 风格模板
│   └── msn-logo.png                 # 默认 Logo
└── maildrop/                        # 默认运行时目录（.gitkeep 占位）
```

## 安装 / 使用

直接复制 `MailManager/` 目录到目标项目即可，无需 `pip install`。

```python
from MailManager import MailManager
```

## 初始化

```python
mail = MailManager(
    smtp_server="smtp.example.com",
    smtp_port=587,
    smtp_user="sender@example.com",
    smtp_password="xxx",
    smtp_ssl=False,        # 是否使用 SMTP_SSL
    smtp_tls=True,         # 是否 starttls
    smtp_timeout=10,       # 连接超时（秒），可留空
    maildrop_dir=None,     # 默认 MailManager/maildrop/，可指定运行时目录
    bcc_monitor=None,      # 可选：每封自动暗送的监控邮箱（不硬编码任何地址）
)
```

> 说明：初始化仅把参数存入实例变量，**不做任何网络握手**。真正的 SMTP 连接发生在 `send_from_maildrop()` 调用时，发送完毕立即关闭。

## 核心方法

### 1. generate() — 生成并排队

将邮件序列化存入 MailDrop（`.pkl`），不立即发送。

```python
mail.generate(
    to=["user@example.com"],
    subject="日报通知",
    content="<html>原始正文</html>",   # if_template=False 时直接作为 HTML
    cc=[], bcc=[],
    reply_to=[],
    attachments={"报告.xlsx": excel_bytes},  # "image:" 前缀表示内嵌图片
    if_template=False,
    template_style=None,
    content_body=None,
)
```

**使用模板**（内置 MonoSkillNavigator / MSN 风格）：

```python
mail.generate(
    to=["user@example.com"],
    subject="日报通知",
    if_template=True,
    template_style="MSN - General",
    content_body={
        "subject": "日报通知",           # 可选，缺省取 subject 参数
        "name": "张三",                  # 收件人称呼，可空
        "main_content": "今日数据汇总...",
        "note": "请注意核实数据",         # 黄色提示框，可空
        "end_content": "<p>详情见附件</p>",  # 可空
        "comment": "如有疑问请联系管理员", # 灰色注释，可空
        "signature_name": "<strong>MonoSkillNavigator Team</strong>",
        "signature_email": "support@example.com",  # 可空
    },
)
```

`template_style` 也接受 `"MonoSkillNavigator - General"`；`"Rapid OS - General"` 仍作为兼容别名保留。

模板占位符（缺任一必填项会抛 `ValueError`）：`subject, name, main_content, note, end_content, comment, signature_name, signature_email, logo_base64`。

> `template_style` 参数保留用于后续扩展新模板；新增风格只需在 `mailmanager.py` 的 `generate()` 中增加分支并实现渲染。

### 2. send_from_maildrop() — 投递

从 MailDrop 批量发送所有待发邮件。使用单次 SMTP 连接逐封容错发送；成功的 `.pkl` 重命名为 `.pkl.sent`，失败的下次调用重试。

```python
mail.send_from_maildrop()
```

### 3. clear() — 清理已发送缓存

删除 MailDrop 中修改时间早于 `now - days` 的 `.pkl.sent` 文件。默认 30 天。

```python
mail.clear()          # 清 30 天前的 .sent
mail.clear(days=7)    # 清 7 天前的 .sent
```

## 典型流程

```python
mail = MailManager(smtp_server=..., smtp_port=..., smtp_user=..., smtp_password=...)

# 1) 业务代码里多处排队
mail.generate(to=[...], subject="A", if_template=True, template_style="MSN - General", content_body={...})
mail.generate(to=[...], subject="B", if_template=True, template_style="MSN - General", content_body={...})

# 2) 定时任务 / 批处理末尾统一投递
mail.send_from_maildrop()

# 3) 定期清理已发送缓存
mail.clear(days=30)
```

## 注意事项

- **MailDrop 路径**：默认在包内 `maildrop/`，运行时会写入 `.pkl` / `.pkl.sent`。建议显式传入 `maildrop_dir` 指向运行时目录，或在 `.gitignore` 忽略 `MailManager/maildrop/*.pkl*`。
- **无单封直发**：本包只提供「排队 + 批量投递」模式（按你要求移除了单封直发方法）。
- **附件**：普通附件为 `{文件名: bytes}`；以 `"image:"` 为前缀的 key 作为内嵌图片（HTML 中用 `<img src="cid:xxx">` 引用）。
- **Logo**：模板默认使用内置 `msn-logo.png`，编码为 `logo_base64` 注入模板。需替换品牌 Logo 时，可扩展 `MailManager` 增加 `logo_path` 参数覆盖。

## 依赖

仅使用 Python 标准库（`smtplib`, `email`, `pickle`, `string.Template`, `base64`, `os`, `uuid`, `re`）。无第三方依赖。
