# skillnav — 发布与审查

上传 Skill 包、预览 metadata、发布并查看 verdict 与完整报告。

> **前置**：`skillnav login` 或 `SKILLNAV_API_KEY`。

---

## check-slug — 发布前检查 slug 是否可用

发布要等到上传结束才会因 slug 冲突失败，这一步可以提前确认，并区分"已被在架 Skill 占用"与"被回收站里的 Skill 持有"（后者可 `restore` 或 `trash purge` 释放）。公开可用，无需登录。

```bash
skillnav check-slug my-skill
```

## publish — 发布

```bash
# frontmatter 完整时
skillnav publish ./my-skill

# 预览（不落库、不跑完整审查）
skillnav publish ./my-skill --dry-run

# 显式 metadata（自动化推荐；--no-input 是全局选项，须写在子命令之前）
skillnav --no-input publish ./my-skill \
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
| `--wait` | 阻塞至审查结束再返回（默认仅上传并后台审查）。请求预算 **600s**，`SKILLNAV_PUBLISH_WAIT_TIMEOUT` 可覆盖 |

## retry-inspection — 重新审查已上传的包

```bash
skillnav retry-inspection my-skill
skillnav retry-inspection my-skill --wait
```

对已暂存但审查**中断**（`interrupted`）的 Skill 重新跑审查，**无需重新上传**。默认 **只重试失败或未完成的审查环节**（SkillSpector / VirusTotal / HaluCatch）。

⚠️ 仅在 `interrupted` 时使用：若 `status` 显示 `inspecting`（VirusTotal 报告待后台补取，通常几分钟），那是**正常等待**，此时 retry-inspection 会返回 409 `skill_inspection_in_progress`。

---

## status — 快速状态

```bash
skillnav status my-skill
skillnav status my-skill --version 1.0.0
skillnav --json status my-skill
```

显示 **单个版本**（默认 latest）的 **verdict**（已发布 / 需复核 / 已拒绝）、**审查状态**（`inspectionStatus`：`completed` 审查完成 / `inspecting` 审查中（含 VirusTotal 待补取，属正常等待）/ `interrupted` 审查中断 / `rejected` 审查拒绝）、**安全摘要**、可见性，以及该版本的 `inspection`、hash 与 VirusTotal 摘要。`--version` 可选；`--json` 在顶层额外给出 `verdict` 字段。

---

## report — 完整报告

```bash
skillnav report my-skill
skillnav report my-skill --version 1.0.0
skillnav --json report my-skill
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

## unpublish — 下架（从公开搜索移除）

**不是删除**：包、审查数据与版本历史都保留，之后可重新上架（Web 详情页）或发布新版本。

```bash
skillnav unpublish my-skill                    # 交互确认（y/N，显示影响）
skillnav --no-input unpublish my-skill         # Agent / CI：跳过确认
skillnav unpublish my-skill --version 1.0.0    # 仅下架该版本（latest 不可 → cannot_unpublish_latest_version）
skillnav unpublish my-skill --delete           # 移入回收站（3 天内可恢复；到期永久删除）
```

| 参数 | 说明 |
| --- | --- |
| `slug` | 目标 Skill（positional） |
| `--version` | 只下架该版本；latest 不能单独下架 |
| `--delete` | 整个 Skill 入回收站（3 天内可恢复，到期永久删除；不能与 `--version` 同用） |

权限：仅 **owner**（contributor 与其他人均返回 403）。下架后 `skillnav status <slug>` 显示 `Published: no (private)`；`--json` 返回 `{slug, version, action: "unpublished", visibility}`。**仅在用户明确要求时执行。**

---

## republish — 重新上架（恢复公开）

`unpublish` 的逆操作：只改可见性，不产生新版本、不改版本历史。

```bash
skillnav republish my-skill                    # 恢复整个 Skill 到公开搜索
skillnav republish my-skill --version 1.0.0    # 只恢复该版本
```

⚠️ **不能绕过审查**：审查中（`skill_republish_blocked_inspection_in_progress`）、审查中断（`..._failed`）、已被拒绝（`..._rejected`）时服务端拒绝。被拒后想重新公开的正确路径是 **修 finding → 发新版本**（`skillnav publish`），而不是反复尝试 republish。

`--json` 返回 `{slug, version, action: "republished", visibility}`。**仅在用户明确要求时执行。**

---

## restore — 从回收站还原（`unpublish --delete` 的逆操作）

```bash
skillnav trash list                   # 先看回收站里有什么、还剩几天
skillnav restore my-skill             # 等价于 skillnav trash restore my-skill
```

回收站有保留期，到期由服务端自动永久删除，因此要在期限内恢复。恢复**只清除删除状态、不改变原有可见性**：若之后仍不在公开列表中，再用 `republish` 重新上架。

## trash — 查看与管理回收站

```bash
skillnav trash list                   # slug / 名称 / 删除时间 / 剩余天数；--json 可脚本化
skillnav trash purge my-skill         # 立即永久删除（不可恢复，需交互确认）
```

`trash purge` 只有在想立刻腾出该 slug 时才需要——否则等它自然过期即可。

## 常见错误

| 现象 | 处理 |
| --- | --- |
| 缺 metadata | 补 frontmatter 或传 CLI flag；`--no-input` 下不能交互补全 |
| slug 无权限 | 仅 owner/contributor 可发新版 |
| 回收站 | Web 先恢复 Skill |
| 重复上传同版本 | `pending_publish_use_retry` → `skillnav retry-inspection <slug>` |
| 限流 | `publish_rate_limited`，等待后重试 |
| 下架 latest 版本被拒 | `cannot_unpublish_latest_version` → 改用整包下架，或先发新版本 |
| 下架别人的 Skill | 403 → 仅 **owner** 可下架（contributor 亦不可）|

## 参考

- [skillnav](../SKILL.md)
- [skillnav-auth](skillnav-auth.md)
