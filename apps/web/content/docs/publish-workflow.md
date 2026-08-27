# 发布流程

发布将 Skill 包注册到平台，并自动触发 **格式校验、SkillSpector 安全扫描、VirusTotal 静态 AV 扫描（若已配置）、HaluCatch 质量评估**（以及平台合规/质量 finding）。完成后可在 Skill 详情页查看结果。

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
5. **提交发布**：平台运行 **完整审查流水线**（SkillSpector、VirusTotal、HaluCatch 等）。**仅当所有已启用环节均成功完成** 后，才将 ZIP 与版本信息写入注册表；任一环节失败则返回 `review_pipeline_incomplete`，**Skill 尚未保存**，发布页会显示失败原因与 **重新运行完整审查** 按钮。
   - 流水线全部成功后，会将 **当前登录用户名** 写入包内 `SKILL.md` 的 `author` 字段（覆盖包内原有值）。
6. 跳转到 **Creator 主页** 或 Skill 详情（成功时），或留在发布页重试（流水线未完成时），查看结果提示（Toast 会说明「已发布 / 需复核 / 已拒绝」）。

## 发布后会得到什么

每个版本会保存：

| 内容 | 说明 |
| --- | --- |
| 快照与文件列表 | 用于详情页展示与 hash 校验 |
| ZIP 制品 | 供下载与 MinIO（若启用）存储 |
| 审查记录 | finding 列表、verdict、SkillSpector 包级风险摘要、VirusTotal 检出摘要（若扫描成功） |
| 评估记录 | HaluCatch 五维结果与 Markdown 报告（若评估成功） |

## 版本状态（verdict）

详情页上的状态徽章来自审查 **verdict**（中文：**已发布 / 需复核 / 已拒绝**），与 SkillSpector「安装建议」不是同一套结论，但通常相关。

| 状态 | 含义 |
| --- | --- |
| **已发布（published）** | 审查流水线 **无任何 finding** |
| **需复核（needs-review）** | 存在 finding，但未触发自动拒绝规则；版本已入库，建议人工确认后再推广 |
| **已拒绝（rejected）** | 审查流水线已全部完成，但触发 SkillSpector 或 VirusTotal 的 **自动拒绝** 规则（见下）；版本 **已入库** |

### 审查流水线未完成（未入库）

若 VirusTotal 分析超时、SkillSpector/HaluCatch 运行时不可用等导致 **任一已启用环节未成功完成**，API 返回 `review_pipeline_incomplete`（HTTP 503）：

- **版本不会写入注册表**（与「已拒绝但已入库」不同）
- 发布页保留当前上传包与表单，列出失败环节（如 `VirusTotal 扫描：analysis did not complete within …ms`）
- 修复环境或等待 VT 分析完成后，点击 **重新运行完整审查** 再次提交（无需重新选文件）

典型场景：首次 upload 已成功但 VT 仍在分析，平台在超时前结束；重试时 hash 已命中，平台会轮询直至引擎统计就绪（见 [安全检测](./security-scan.md) 路径 A2）。

### 自动拒绝规则（rejected）

仅当审查流水线 **全部成功完成** 后，以下情况会将 verdict 设为 **已拒绝**；其余 finding 允许入库，但通常为 **需复核**：

| 来源 | 拒绝条件 |
| --- | --- |
| **SkillSpector**（已启用） | 任意 `high` / `critical` finding；或 `medium` 且 **置信度 ≥ 90%** |
| **VirusTotal**（已启用） | 存在 **malicious** 类别检出（合并为一条 high 级 finding） |
| **HaluCatch**（已启用） | 评估成功但结果触发拒绝规则（见质量文档） |

SkillSpector / VirusTotal **扫描步骤本身失败**（超时、网络错误、运行时不可用）属于 **流水线未完成**，不会以 rejected 版本入库，见上一节。

**平台合规/质量** finding（如 tags 缺失、description 不规范、内置降级规则命中等）**不会**单独导致 rejected，但会使 verdict 为 **需复核**。

平台还会在发布前做 **包格式校验**；格式错误可能无法完成发布。

## 公开可见性（搜索与发现）

Skill 是否出现在 **首页、Skill 列表 / 搜索、榜单** 以及 **其他用户的 Creator 主页**，由以下规则共同决定：

| 情况 | 公开搜索 / 榜单 | 拥有者个人中心 | 直接打开详情页 |
| --- | --- | --- | --- |
| 正常公开（verdict 非 rejected，且未下架） | ✅ | ✅ | ✅ |
| **已拒绝（rejected）** | ❌ | ✅（仅 Skill 拥有者本人） | ✅（便于查看 finding 与修复） |
| **已下架（unpublish）** | ❌ | ✅（仅 Skill 拥有者本人） | ✅（拥有者可访问；他人通常 404） |

说明：

- **已拒绝** 与 **已下架** 是两套独立机制：前者来自审查 verdict，后者由拥有者手动下架。
- 拥有者登录后进入 **个人中心**（`/creators/<你的用户名>`），可在 Skill 列表中看到已拒绝与已下架的 Skill（带对应状态徽章）；页面顶部会有提示说明这些 Skill 不会出现在 Skill 广场或搜索页。
- 其他用户（包括未登录访客）在搜索与浏览流程中 **看不到** 最新版本 verdict 为 **已拒绝** 的 Skill。

## 下架与重新上架

Skill **所有者** 可在详情页右侧 **当前查看版本** 卡片中：

- **发布新版本**：跳转发布页为该 slug 发版。
- **下架（unpublish）** / **重新上架（republish）**：控制 Skill 是否在广场与排行榜公开可见。
- **删除**：移入回收站（保留期内可恢复）。

左侧 Hero 区仍提供 **收藏**、**下载 Skill** 与 **复制 prompt**（可复制一段说明给 AI 助手代为安装）。对非 latest 版本，还可在 **Versions** 列表中单独下架某个历史版本。

发 **新版本** 仍走发布流程，版本号必须递增。

## CLI 发布（可选）

在 Web **账户 → API Keys** 创建密钥后，本地使用 skillnav CLI：

```bash
skillnav login --api-key sk_…
skillnav publish ./my-skill
```

CLI 与 Web 共用同一 API 与审查逻辑；Web 发布额外校验分类等表单字段。

## 发布失败常见原因

- **slug 冲突或版本已存在**：更换 slug 或提高 version。
- **frontmatter 缺字段或 SemVer 不合法**：对照 [Skill 格式](./skill-format.md) 修改。
- **审查流水线未完成（review_pipeline_incomplete）**：Skill **未保存**。常见为 VirusTotal 分析超时、SkillSpector/HaluCatch 不可用；按发布页提示修复环境或加大 VT 超时配置后，点击 **重新运行完整审查**。详见 [安全检测](./security-scan.md) 中 VirusTotal 路径 A2 与超时说明。
- **审查 rejected（已入库）**：版本已保存但 **不会出现在搜索页**；打开 Skill 详情 →「审查与评估」，处理 SkillSpector / VirusTotal 的 high 级 finding，或降低 SkillSpector medium finding 的误报后 **发新版本**；修复后 verdict 变为非 rejected 时才会重新出现在公开搜索中。
- **需复核**：版本已保存，可在修复非阻断 finding 后发新版本，或由管理员人工确认后推广。

## 相关文档

- [安全检测](./security-scan.md)
- [质量审查](./halucatch-review.md)
