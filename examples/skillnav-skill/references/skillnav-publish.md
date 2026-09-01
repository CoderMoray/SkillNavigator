# skillnav — 发布与审查

上传 Skill 包、远程预审查、查看 verdict 与完整报告。

> **前置**：`skillnav login` 或 `SKILLNAV_API_KEY`。

---

## review — 远程预审查（不发布）

```bash
skillnav review ./my-skill
skillnav review ./my-skill.zip --json
```

调用 `POST /reviews/run`，运行 SkillSpector + HaluCatch（与发布流水线一致），**不创建版本**。

---

## publish — 发布

```bash
# frontmatter 完整时
skillnav publish ./my-skill

# 预览（不落库）
skillnav publish ./my-skill --dry-run

# 显式 metadata（自动化推荐）
skillnav publish ./my-skill \
  --no-input \
  --slug my-skill \
  --display-name "My Skill" \
  --description "一句话摘要" \
  --version 1.0.0 \
  --category "Developer Tools" \
  --release-tag latest
```

| 参数 | 说明 |
| --- | --- |
| `package` | Skill 目录或 `.zip`（positional） |
| `--version` | SemVer |
| `--display-name` | 展示名 |
| `--slug` | 不可变 slug |
| `--description` | 摘要（映射平台 summary） |
| `--category` | 可重复，最多 3 个 |
| `--topic` | 可重复 topic 标签 |
| `--release-tag` | 可重复；首版至少 `latest` |
| `--changelog` | 版本 changelog 文本 |
| `--dry-run` | 调用 preview 接口，不写入数据库 |

**流水线**：包校验 → SkillSpector → VirusTotal（若启用）→ HaluCatch（若启用）。全部成功才入库。

**失败**：`review_pipeline_incomplete` 表示版本**未保存**，可重试 publish。

---

## status — 快速状态

```bash
skillnav status my-skill
skillnav status my-skill --json
```

显示 Skill 是否存在、最新版本、verdict 概要。

---

## report — 完整报告

```bash
skillnav report my-skill
skillnav report my-skill --version 1.0.0
skillnav report my-skill --json
```

分区：Verdict → SkillSpector → VirusTotal → HaluCatch。

| Verdict | 含义 |
| --- | --- |
| published | 无 finding，已公开 |
| needs-review | 有 finding，已入库 |
| rejected | 高置信度拒绝，不进入公开搜索 |

---

## 发布新版本

同一 `slug@version` **不可覆盖**。修改后提高 SemVer 并更新 frontmatter：

```bash
skillnav publish ./my-skill --version 1.0.1 --release-tag latest
skillnav report my-skill --version 1.0.1
```

---

## 常见错误

| 现象 | 处理 |
| --- | --- |
| 缺 metadata | 补 frontmatter 或传 CLI flag；`--no-input` 下不能交互补全 |
| slug 无权限 | 仅 owner/contributor 可发新版 |
| 回收站 | Web 先恢复 Skill |
| 限流 | `publish_rate_limited`，等待后重试 |

## 参考

- [skillnav](../SKILL.md)
- [skillnav-auth](skillnav-auth.md)
