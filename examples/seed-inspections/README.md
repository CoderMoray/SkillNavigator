# Seed Inspection Artifacts

本目录存放官方种子 Skill 的**预生成审查工件**（`<slug>.json`），由
`scripts/bootstrap-admin.mjs` 在初始化时关联，避免 setup 阶段重复消耗
VirusTotal 配额、依赖 SkillSpector 运行环境。

## 各 Skill 的工件内容

| Skill | 工件内容 | setup 时 |
|---|---|---|
| `skillnav-skill` | 完整 InspectionReport（平台规则 + SkillSpector findings + scores/verdict）+ VT summary/报告链接 + **`stageStatuses` / `stageFailureMessages`** | 直接关联；仅 HaluCatch 现场重跑（离线 vendored） |
| `demo-skill` | 仅 VT summary/报告链接（+ `stageStatuses` / `stageFailureMessages`） | SkillSpector + HaluCatch 现场跑，VT 链接注入结果 |

工件里的 `stageStatuses` / `stageFailureMessages` 会被 bootstrap **原样写入**版本记录。没有它们，初始化出来的版本会出现 `inspectionStatus: completed` 但**阶段列表为空**——`skillnav status` 的 `Inspection progress:` 行会是空白。

## 何时需要重新生成

工件绑定了 `contentHash`。**Skill 内容有任何变更**（包括 SKILL.md 一个字的
修改）都会使工件失效——bootstrap 会拒绝关联并报错。此时在有外网、已配置
`VIRUSTOTAL_API_KEY`、且 SkillSpector 可用的机器上重新预跑：

```bash
# skillnav-skill：必须强制同步 VT 并给足分析预算（原因见下）
VIRUSTOTAL_WAIT_FOR_ANALYSIS=true VIRUSTOTAL_ANALYSIS_TIMEOUT_MS=600000 \
  node_modules/.bin/tsx scripts/seed-inspection.mjs --skill skillnav-skill

VIRUSTOTAL_WAIT_FOR_ANALYSIS=true VIRUSTOTAL_ANALYSIS_TIMEOUT_MS=600000 \
  node_modules/.bin/tsx scripts/seed-inspection.mjs --skill demo-skill
```

> ⚠️ **为什么这两个变量必须显式设置**：默认（异步）模式下 VT 阶段会停在
> `processing`，而工件**原样冻结**阶段状态——冻结出来的官方 Skill 会一直显示
> 「等待分析中」（`inspecting`），不进公开搜索。改用同步后，若该包对 VT 是
> **新样本**（改过内容即如此；`VIRUSTOTAL_UPLOAD_ON_MISS=true` 会触发上传），
> 首次分析通常超过 `VIRUSTOTAL_TIMEOUT_MS` 的 90s 默认值——此时若不显式提高
> `VIRUSTOTAL_ANALYSIS_TIMEOUT_MS`，预跑会以
> `⚠️ stage failures: virustotal: … did not complete within 90000ms` 结束。

预跑会打印全部 findings 与各阶段状态——对 `skillnav-skill` 请确认
**verdict 为 published、无 findings、无 stage failures**，再提交工件
（scores/verdict 与 `stageStatuses` / `stageFailureMessages` 都会被固化）。
**若打印出 `⚠️ stage failures:`，说明固化的是降级结果，不要提交。**
改动内容时同时 **bump `SKILL.md` 的 `version`**（同一 `slug@version` 内容不可覆盖）。

## 设计要点

- 工件放在**包外**（本目录），不会被打进 Skill 包、不影响 `contentHash`
- setup 时 VT 永不运行（不消耗 API 配额）；VT 的报告链接随工件永久有效
- 工件缺失时 `skillnav-skill` 会降级为"现场离线扫描（禁用扫描器）"并输出
  明确警告；hash 不匹配则直接报错退出
