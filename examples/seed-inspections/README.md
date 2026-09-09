# Seed Inspection Artifacts

本目录存放官方种子 Skill 的**预生成审查工件**（`<slug>.json`），由
`scripts/bootstrap-admin.mjs` 在初始化时关联，避免 setup 阶段重复消耗
VirusTotal 配额、依赖 SkillSpector 运行环境。

## 各 Skill 的工件内容

| Skill | 工件内容 | setup 时 |
|---|---|---|
| `skillnav-skill` | 完整 InspectionReport（平台规则 + SkillSpector findings + scores/verdict）+ VT summary/报告链接 | 直接关联；仅 HaluCatch 现场重跑（离线 vendored） |
| `demo-skill` | 仅 VT summary/报告链接 | SkillSpector + HaluCatch 现场跑，VT 链接注入结果 |

## 何时需要重新生成

工件绑定了 `contentHash`。**Skill 内容有任何变更**（包括 SKILL.md 一个字的
修改）都会使工件失效——bootstrap 会拒绝关联并报错。此时在有外网、已配置
`VIRUSTOTAL_API_KEY`、且 SkillSpector 可用的机器上重新预跑：

```bash
node_modules/.bin/tsx scripts/seed-inspection.mjs --skill skillnav-skill
node_modules/.bin/tsx scripts/seed-inspection.mjs --skill demo-skill
```

预跑会打印全部 findings——对 `skillnav-skill` 请确认没有异常 finding
（scores/verdict 会被固化），再提交工件。

## 设计要点

- 工件放在**包外**（本目录），不会被打进 Skill 包、不影响 `contentHash`
- setup 时 VT 永不运行（不消耗 API 配额）；VT 的报告链接随工件永久有效
- 工件缺失时 `skillnav-skill` 会降级为"现场离线扫描（禁用扫描器）"并输出
  明确警告；hash 不匹配则直接报错退出
