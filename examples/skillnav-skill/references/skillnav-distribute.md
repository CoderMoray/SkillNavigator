# skillnav — 下载与安装

将 registry 中的 Skill 包下载到本地。

> **下载**需登录（Bearer API Key）。

---

## download — 下载 ZIP

```bash
skillnav download my-skill
skillnav download my-skill -o ./my-skill.zip
skillnav download my-skill --version 1.0.0 -o my-skill-1.0.0.zip
```

| 参数 | 说明 |
| --- | --- |
| `slug` | Skill slug（positional） |
| `-o, --output` | 输出 zip 路径 |
| `--version` | 版本，默认 `latest` |

---

## install — 下载并解压

```bash
skillnav install my-skill --dir ./skills/my-skill
skillnav install my-skill --version 1.0.0 --dir ./skills/my-skill
```

| 参数 | 说明 |
| --- | --- |
| `--dir` | 目标目录（解压后含 SKILL.md） |
| `--version` | 版本，默认 `latest` |

---

## 参考

- [skillnav](../SKILL.md)
- [skillnav-auth](skillnav-auth.md)
