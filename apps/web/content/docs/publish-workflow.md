# 发布流程

发布将 Skill 包注册到平台，并自动触发 **格式校验、SkillSpector 安全扫描、VirusTotal 静态 AV 扫描（若已配置）、HaluCatch 质量评估**（以及平台合规/质量 finding）。审查顺序为：**SkillSpector 与 VirusTotal（并行）→ HaluCatch** → 汇总 verdict。

## 前置条件

1. 已注册账号并 **登录** Web。
2. 本地 Skill 符合 [Skill 格式](./skill-format.md)（含合法 `SKILL.md` frontmatter）。
3. 服务端已配置 `DATABASE_URL`；HaluCatch / SkillSpector 依赖 Python 环境（未配置时部分能力会降级，见对应文档）。可选配置 `VIRUSTOTAL_API_KEY` 启用发布包 hash 的 VirusTotal 查询/上传扫描。

## Web 发布步骤

1. 打开 **发布 Skill** 页面（`/skills/publish`）。
2. **上传包**：
   - 选择 **ZIP**，或
   - 选择 **文件夹**（浏览器会打包为 ZIP），或
   - 拖拽到上传区。
3. 填写 **元数据**：
   - 展示名称、slug（新 Skill）、摘要、分类（1–3 个）、版本号、release-tags、变更说明等。
   - 若从已有 Skill 发 **新版本**，可通过 URL 参数 `?skill=<slug>` 进入，slug 通常不可改。
4. **预览**（若提供）：确认 frontmatter 与平台字段一致。
5. **提交发布**：
   - 平台 **先暂存 ZIP 与版本元数据**，再 **在后台异步运行审查流水线**（Web 默认行为）。
   - 提交成功后通常 **立即跳转个人中心**，并提示「已提交审查」；不必在发布页等待审查结束。
   - 用 Skill 详情页或 `skillnav status <slug>` 查看 **审查进度**（SkillSpector / VirusTotal / HaluCatch 各阶段）。
   - 审查 **全部成功完成** 后，会将 **当前登录用户名** 写入包内 `SKILL.md` 的 `author` 字段（覆盖包内原有值），并根据 finding 给出 verdict。
6. 审查结束后打开 Skill 详情查看 **已发布 / 需复核 / 已拒绝** 等结果；若审查 **流程失败**（见下），详情页会显示 **已下架（审查失败）** 与 **重新发布 / 重试失败环节**。

## 发布后会得到什么

审查 **成功完成** 后，每个版本会保存：

| 内容 | 说明 |
| --- | --- |
| 快照与文件列表 | 用于详情页展示与 hash 校验 |
| ZIP 制品 | 供下载与 MinIO（若启用）存储 |
| 审查记录 | finding 列表、verdict、SkillSpector 包级风险摘要、VirusTotal 检出摘要（若扫描成功） |
| 评估记录 | HaluCatch 五维结果与 Markdown 报告（若评估成功） |

**审查尚未完成或流程失败** 时：包通常 **已暂存** 于服务端，但尚未获得最终 verdict，也不会公开出现在 Skill 广场。

## Skill 级审查状态与版本 verdict

详情页可能同时出现两类信息：

| 概念 | 字段 / 展示 | 含义 |
| --- | --- | --- |
| **审查状态** | `reviewStatus`：审查中 / 审查失败 / 审查完成 | Skill **最新版本** 的流水线是否跑完 |
| **版本 verdict** | 徽章：已发布 / 需复核 / 已拒绝 | 某版本审查 **成功结束** 后，根据 finding 给出的结论 |

| verdict | 含义 |
| --- | --- |
| **已发布（published）** | 审查流水线 **无任何 finding** |
| **需复核（needs-review）** | 存在 finding，但未触发自动拒绝规则；版本已入库，建议人工确认后再推广 |
| **已拒绝（rejected）** | 审查流水线已全部完成，但触发 SkillSpector 或 VirusTotal 的 **自动拒绝** 规则（见下）；版本 **已入库** |

### 审查失败（reviewStatus: failed）

若 VirusTotal 分析超时、SkillSpector/HaluCatch 运行时不可用、服务重启导致审查中断等，使 **任一已启用环节未成功完成**：

- **包与版本元数据通常已暂存**（与「verdict 已拒绝但审查已完成」不同）
- Skill 标记为 **审查失败**，**不会公开**；拥有者在详情页看到 **已下架（审查失败）** 与阶段进度
- 在详情页点击 **重新发布** 或 **重试失败环节**（或 CLI：`skillnav retry-publish <slug>`）**重新跑审查**，**无需重新上传**；默认 **只重试失败或未完成的环节**
- 若暂存包已丢失，需重新上传；同版本再次 `publish` 可能返回 `pending_publish_use_retry`，应改用 `retry-publish`
- 使用 CLI **`publish --wait`** 同步等待时，失败会返回 `review_pipeline_incomplete`（503），同样应 **`retry-publish`**，而不是重复上传

典型场景：首次 upload 已成功但 VT 仍在分析，平台在超时前结束；重试时 hash 已命中，平台会轮询直至引擎统计就绪（见 [安全检测](./security-scan.md) 路径 A2）。

### 自动拒绝规则（rejected）

仅当审查流水线 **全部成功完成** 后，以下情况会将 verdict 设为 **已拒绝**；其余 finding 允许入库，但通常为 **需复核**：

| 来源 | 拒绝条件 |
| --- | --- |
| **SkillSpector**（已启用） | 任意 `high` / `critical` finding；或 `medium` 且 **置信度 ≥ 90%** |
| **VirusTotal**（已启用） | 存在 **malicious** 类别检出（合并为一条 high 级 finding） |
| **HaluCatch**（已启用） | 评估成功但结果触发拒绝规则（见质量文档） |

SkillSpector / VirusTotal **扫描步骤本身失败**（超时、网络错误、运行时不可用）属于 **审查失败（reviewStatus: failed）**，不会以「已完成审查的 rejected verdict」入库，见上一节。

**平台合规/质量** finding（如 tags 缺失、description 不规范、内置降级规则命中等）**不会**单独导致 rejected，但会使 verdict 为 **需复核**。

平台还会在发布前做 **包格式校验**；格式错误可能无法完成暂存。

## 公开可见性（搜索与发现）

Skill 是否出现在 **首页、Skill 列表 / 搜索、榜单** 以及 **其他用户的 Creator 主页**，由以下规则共同决定：

| 情况 | 公开搜索 / 榜单 | 拥有者 / contributor 个人中心 | 直接打开详情页 |
| --- | --- | --- | --- |
| 正常公开（verdict 非 rejected，审查完成，且未手动下架） | ✅ | ✅ | ✅ |
| **审查中（reviewing）** | ❌ | ✅ | ✅（owner / contributor） |
| **审查失败（failed）** | ❌ | ✅ | ✅（owner / contributor） |
| **已拒绝（rejected，审查已完成）** | ❌ | ✅ | ✅（便于查看 finding 与修复） |
| **已下架（手动 unpublish）** | ❌ | ✅（仅 Skill 拥有者本人） | ✅（拥有者可访问；他人通常 404） |

说明：

- **审查失败**、**已拒绝** 与 **手动下架** 是不同机制；前两者来自审查流水线，后者由拥有者主动操作。
- **审查未完成或失败** 时，不能使用「重新上架」绕过审查；须先 **完成审查** 或 **发布新版本**。
- 拥有者登录后进入 **个人中心**，可看到审查中、审查失败、已拒绝与已下架的 Skill；页面顶部会有相应提示。
- 其他用户在搜索与浏览流程中 **看不到** 审查中、审查失败或已拒绝的 Skill。

## 下架与重新上架

Skill **所有者** 可在详情页右侧 **当前查看版本** 卡片中：

- **发布新版本**：跳转发布页为该 slug 发版。
- **下架（unpublish）** / **重新上架（republish）**：控制 **已通过审查且未因审查失败/拒绝而锁定** 的 Skill 是否在广场公开可见。
- **删除**：移入回收站（保留期内可恢复）。

审查 **失败** 或 **已拒绝** 时，详情页 Hero 区提供 **重新发布 / 重试失败环节**（或跳转发布页重新上传），而非普通的「重新上架」。

左侧 Hero 区仍提供 **收藏**、**下载 Skill** 与 **复制 prompt**。对非 latest 版本，还可在 **Versions** 列表中单独下架某个历史版本。

发 **新版本** 仍走发布流程，版本号必须递增。

## CLI 发布（可选）

在 Web **账户 → API 密钥** 创建密钥后，本地使用 skillnav CLI：

```bash
skillnav login --api-key sk_…
skillnav publish ./my-skill              # 默认：上传后 202，后台审查
skillnav status my-skill               # 查看审查进度与各版本状态
skillnav status my-skill --version 1.0.0
skillnav retry-publish my-skill          # 审查失败后重试（无需重新上传）
```

CLI 与 Web 共用同一 API 与审查逻辑；Web 发布额外校验分类等表单字段。

完整的 CLI 从 0 到 1 流程见 **[CLI 指南](./cli-guide.md)**。

## 发布失败常见原因

- **slug 冲突或版本已存在**：更换 slug 或提高 version。
- **frontmatter 缺字段或 SemVer 不合法**：对照 [Skill 格式](./skill-format.md) 修改。
- **审查失败（reviewStatus: failed / review_pipeline_incomplete）**：包 **通常已暂存**。修复环境后使用详情页 **重试失败环节** 或 `skillnav retry-publish <slug>`；勿对同版本重复 `publish`（可能 `pending_publish_use_retry`）。详见 [安全检测](./security-scan.md)。
- **审查 rejected（verdict，审查已完成）**：版本已入库但 **不会出现在搜索页**；打开 Skill 详情 →「审查与评估」，处理 finding 后 **发新版本**。
- **需复核**：版本已保存，可在修复非阻断 finding 后发新版本，或由管理员人工确认后推广。

## 相关文档

- [安全检测](./security-scan.md)
- [质量审查](./halucatch-review.md)
