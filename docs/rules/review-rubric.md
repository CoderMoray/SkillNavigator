# Skill 审查 Rubric

## 输出分数

审查报告在数据库中仍保留 `qualityScore`、`securityScore`、`reliabilityScore` 字段以兼容搜索与榜单 API，但**不再从 finding 或 HaluCatch 汇总计算**。含义如下：

- **质量**：发布前由 `skill-spec` 包格式校验把关；发布后质量证据以 HaluCatch 五维雷达与报告为准。
- **安全**：以 SkillSpector 静态扫描的 `riskScore` 与 security/privacy/leakage finding 为准，不生成单一安全分。
- **可靠性 / HaluCatch**：详情页展示五维雷达，不使用单一 `reliabilityScore` 作为用户-facing 指标；字段固定占位以便旧客户端不报错。

## 严重级别

- `critical`：疑似恶意、明确外传敏感信息、破坏性命令、反向 shell、隐藏持久化。
- `high`：过宽权限、危险脚本、未声明联网、读取凭证、删除文件。
- `medium`：缺少版本、描述不清、外部 URL 未解释、测试不足、脚本风险需人工复核。
- `low`：文档风格、标签缺失、示例不足、非阻断性改进建议。

发布判定（SkillSpector / VirusTotal 阻断，扫描/评估未完成亦拒绝，其余 finding 复核）：

- **SkillSpector**（`SKILLSPECTOR_ENABLED` 未关闭时）
  - 扫描 **未完成**（超时、依赖缺失等）：`rejected`。
  - `high` / `critical` finding：`rejected`。
  - `medium` 且置信度 ≥ 90%：`rejected`。
  - 其余 SkillSpector finding：允许入库，标记 `needs-inspection`（需复核）。
- **VirusTotal**（已配置 API 且未关闭时）
  - 扫描 **未完成**（超时、网络错误、分析失败等）：`rejected`。
  - `high` / `critical` finding（如 malicious 检出）：`rejected`。
  - 其余 VirusTotal finding（如 suspicious）：允许入库，标记 `needs-inspection`。
- **HaluCatch**（`HALUCATCH_ENABLED` 未关闭时）
  - 评估 **未完成**（Python/运行时不可用或未返回 `halucatch-adapter` 报告）：`rejected`。
  - 评估成功后的维度 warn/fail 等：按现有质量 finding 规则，通常为 `needs-inspection`（不单独自动拒绝，除非另有 high 级平台规则）。
- **平台规则与其他 finding**（格式、质量、降级静态规则等）：不自动拒绝；存在任意 finding 时标记 `needs-inspection`，**且**上述扫描/评估均已成功完成、无任何 finding 时为 `published`。

## 质量审查（合规 + 质量）

检查项：

- `SKILL.md` 是否存在且包含合法 frontmatter。
- `slug` 是否符合 kebab-case，且与目录意图一致。
- `version`、`license` 等平台必需字段是否完整。
- `description` 是否同时说明 “做什么” 和 “何时使用”。
- 是否提供 tags 以提升发现性。
- `SKILL.md` 是否过长、难以维护。
- 正文是否足以清楚说明工作流、预期输出和限制。
- 是否提供 `tests/`、`examples/` 和验收语言等可审查证据。

## 安全审查（SkillSpector）

安全分默认由 SkillSpector 的无 LLM 静态扫描生成，风险分汇总了所有 finding，不再将隐私或泄露问题重复计入独立分数。重点覆盖：

- 删除或破坏性命令：`rm -rf`、`del /s /q`、`Remove-Item -Recurse -Force`。
- 权限提升：`sudo`、`Set-ExecutionPolicy Bypass`。
- 持久化：计划任务、启动项、shell profile 注入、git hook 注入。
- 混淆：base64 大块代码、eval、Function 构造、压缩混淆 JS。
- 供应链、远程下载、prompt injection、数据泄露与 SSRF。
- 敏感文件、环境变量、凭证和 Agent 生态信息的访问或外传。

若 SkillSpector 被显式禁用或运行不可用，平台会保留内置静态规则作为降级路径，并将安全、隐私和泄露 finding 一并计算为安全分；该结果应在恢复 SkillSpector 后通过重审替换。

## 可靠性评分

默认通过 HaluCatch 对发布快照执行五维静态可靠性评分：

- 地基与数据管线：脚本固化、输入验证、依赖和路径可移植性。
- 代码风险：常见错误处理、硬编码、超时和危险模式。
- 规则与方法论：步骤、边界、输出与自洽性。
- 解读护栏：验证、错误回退、确认与输出确定性。
- 复杂度与可维护性：文档/脚本复杂度、引用链和指令密度。

HaluCatch 结果会映射到统一的 `taskResults` 结构，并只参与 `reliabilityScore`。
这项检查是静态的，不执行 Skill 脚本；未来引入需要实际运行 Agent
的动态评估时，应补充 trace、任务通过率、幻觉归因和 judge 解释。
