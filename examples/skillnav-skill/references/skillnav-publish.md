# skillnav — 发布与审查

上传 Skill 包、预览 metadata、发布并查看 verdict 与完整报告。

> **前置**：`skillnav login` 或 `SKILLNAV_API_KEY`。

---

## publish — 发布

```bash
# frontmatter 完整时
skillnav publish ./my-skill

# 预览（不落库、不跑完整审查）
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
| `--wait` | 阻塞至审查结束再返回（默认仅上传并后台审查） |

## retry-publish — 重新审查已上传的包

```bash
skillnav retry-publish my-skill
skillnav retry-publish my-skill --wait
```

对已暂存但审查失败或未完成的 Skill 重新跑审查，**无需重新上传**。默认 **只重试失败或未完成的审查环节**（SkillSpector / VirusTotal / HaluCatch）。

---

## status — 快速状态

```bash
skillnav status my-skill
skillnav status my-skill --version 1.0.0
skillnav status my-skill --json
```

显示 **单个版本**（默认 latest）的 **审查状态**（`inspectionStatus`：审查中 / 审查失败 / 审查完成）、可见性，以及该版本的 `inspection`（含 verdict）、hash 与 VirusTotal 摘要。`--version` 可选。

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
| needs-inspection | 有 finding，已入库 |
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
| 重复上传同版本 | `pending_publish_use_retry` → `skillnav retry-publish <slug>` |
| 限流 | `publish_rate_limited`，等待后重试 |

## 参考

- [skillnav](../SKILL.md)
- [skillnav-auth](skillnav-auth.md)
