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
改动内容时同时 **bump `SKILL.md` 的 `version`**（同一 `slug@version` 内容不可覆盖）——
走正式发布路径时这是硬要求，只有下面的 `--refresh` 运维路径例外。

## 把变更同步到已部署的实例

种子工件**只在 bootstrap 时生效**——它不会回头更新一个已经跑起来的实例。改了
`examples/skillnav-skill` 之后线上仍挂着旧内容，必须显式同步。两条路：

### 方式 A — 正式发布新版本（默认选择）

```bash
# 1) bump SKILL.md 的 version
# 2) 重跑工件（见上一节；会消耗 VT 配额）
# 3) 发布
skillnav publish examples/skillnav-skill
```

后端 preflight 强制 `Version must be greater than latest`，所以这条路**必须 bump**。
好处是版本号前进（用户与 Web 都能看到新版本）、社区数据（bookmark / rating /
issue）保留。

### 方式 B — `--refresh`（运维直刷，版本号不变）

适用于"只把内容改对、不需要用户感知版本"的修正：

```bash
cd <repo>
git fetch origin main && git checkout main && git pull --ff-only

npm run verify:seed-artifacts        # 前置：工件必须与包内容一致

DOTENV_FILE=/path/to/prod.env node_modules/.bin/tsx scripts/bootstrap-admin.mjs --refresh
```

它做的事（`scripts/bootstrap-admin-core.mjs`）：先 `deleteSkill` +
`purgeRecycleBinSkill` **永久删除**官方 Skill，再用**当前冻结工件**重新
`publishSnapshot`。因此：

- ✅ **不消耗 VirusTotal 配额**——bootstrap 里 `VIRUSTOTAL_ENABLED=false`、
  `SKILLSPECTOR_ENABLED=false`，结果全部取自工件（仅 HaluCatch 现场离线重跑）
- ✅ 先删除再重建，"版本必须大于 latest" 的 preflight 不适用 → **版本号保持不变**
- ⚠️ **级联清空**该 Skill 的 bookmark / rating / issue / 文件，**不可恢复**
- ⚠️ **绕过 API 直连数据库**，不经鉴权与业务校验，纯运维动作

**环境条件**（缺一不可）：

| 条件 | 原因 |
| --- | --- |
| 能连**生产** Postgres + MinIO | 它直接用 `createAuthStoreFromEnv()` / `createRegistryStoreFromEnv()` |
| 有 `ADMIN_USERNAME` / `ADMIN_EMAIL` / `ADMIN_DISPLAY_NAME` | 没有 `ADMIN_*` 会走 demo 分支，不会刷新官方 Skill |
| `DOTENV_FILE` 指向生产 dotenv | 否则按 `DOTENV_FILE` → `.env` → `.env.rapid` 顺序加载，开发机的 `.env` 指向本地库 |

> ⚠️ **`--refresh` 不是 `npm run setup` 的开关**：`scripts/setup.sh` 传给
> `bootstrap-admin.mjs` 的参数是写死的（只有 demo 模式传 `--demo`），必须直接
> 调用 `scripts/bootstrap-admin.mjs`。

**验证内容真的换了**：

```bash
skillnav --profile <prod> download skillnav-skill -o /tmp/s.zip
unzip -p /tmp/s.zip SKILL.md | grep -c "<新内容里的关键词>"   # 旧内容为 0
```

> 注意：`skillnav install` 是无状态的（只拉 `/versions/latest/download`），重跑
> install 必定拿到新内容；但**版本号没变就没有任何自动更新信号**，已安装的用户
> 需要人工通知重装。这正是方式 A 更可取的原因。

## 设计要点

- 工件放在**包外**（本目录），不会被打进 Skill 包、不影响 `contentHash`
- setup 时 VT 永不运行（不消耗 API 配额）；VT 的报告链接随工件永久有效
- 工件缺失时 `skillnav-skill` 会降级为"现场离线扫描（禁用扫描器）"并输出
  明确警告；hash 不匹配则直接报错退出
