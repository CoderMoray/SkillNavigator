# 安全检测（SkillSpector 与 VirusTotal）

{{brand_name}} 对每次发布（或重审）的 Skill 快照做 **静态安全扫描**，主要包括：

1. **SkillSpector**（默认启用）：规则与静态分析，不执行包内脚本。
2. **VirusTotal**（可选）：对发布 ZIP 的 SHA-256 做 hash lookup；未命中时可按配置上传样本并轮询结果。若 hash 已存在但引擎统计尚未就绪，平台会继续等待，**不会**把「零检出 / 零引擎数」误判为扫描完成。

扫描在隔离副本上完成；SkillSpector 默认 **关闭 LLM**，仅使用规则与静态分析。

## 在详情页哪里看

进入 Skill → **审查与评估** 面板 → **安全审查**：

1. **包级摘要**（扫描成功且已写入审查记录时）  
   - **安全分**：0–100，为 **100 − 包级风险分**；分数 **越高越放心**  
   - **包级风险分**：0–100，由多条 finding 加权汇总；与「安全分」方向相反  
   - **包级风险**：低 / 中 / 高 / 严重（对应 SkillSpector 的 LOW / MEDIUM / HIGH / CRITICAL）  
   - **安装建议**：可安装（SAFE）/ 谨慎（CAUTION）/ 不建议安装（DO_NOT_INSTALL）  
   - **模式**：通常为「仅静态扫描」

2. **Finding 列表**（SkillSpector 与 VirusTotal 等）  
   每条包含：标题、**严重度徽章**（低/中/高/严重）、**置信度**（SkillSpector 规则若提供）、说明、修复建议、命中证据片段。VirusTotal 的 malicious/suspicious 按上节 **按类别合并** 展示。

3. **VirusTotal 摘要**（已配置 API 时）  
   独立卡片展示扫描器名称、状态（已完成 / 未命中历史报告 / 扫描失败）、恶意与可疑 **检出数量**、**厂家总数**（参与扫描的 AV 引擎数）、威胁结论（若有）、SHA-256 前缀与 **VirusTotal 报告链接**（若有）。  
   **已完成** 仅当参与扫描的 **厂家总数 > 0**；hash 命中但 VT 仍在排队分析时，平台会继续轮询，超时则视为审查未完成（发布页可重试），**不会**入库为「已完成且零检出」。

4. **VirusTotal finding**（扫描 **completed** 且存在 malicious 或 suspicious 检出时）  
   按 **风险类别** 合并展示，**不是** 每个 AV 引擎单独一条：
   - **malicious** 检出 → 一条 **高** 级 finding（会触发 **已拒绝**）
   - **suspicious** 检出 → 一条 **中** 级 finding（通常为 **需复核**）

   每条合并 finding 包含：
   - **标题**：如 `VirusTotal (malicious)` / `VirusTotal (suspicious)`
   - **说明**：列出所有检出该类的 AV 厂家名称（逗号分隔），如「AhnLab-V3, Kaspersky, … classified this package as malicious.」
   - **建议**：malicious 与 suspicious 各有一条固定修复建议（与单引擎时相同）
   - **证据区**（同一类别内汇总）：

   | 字段 | 说明 |
   | --- | --- |
   | SHA-256 | 被扫描 ZIP 的哈希，整份报告唯一 |
   | Total engines | 参与扫描的 AV 厂家总数 |
   | Category | 该框的类别（`malicious` 或 `suspicious`） |
   | Result | 各引擎的检出名称，每行一条（`引擎名: 结果`） |
   | Method | 各引擎的判定方式，去重后逗号分隔（常见为 `blacklist`） |
   | Engine update | 各引擎病毒库版本日期，去重后逗号分隔（不同厂家更新节奏不同，故可能出现多个日期） |
   | Report | 该文件在 VirusTotal 上的分析页链接 |

   证据区 **不再单独列出 Engine 行**（厂家名称已在说明中）。若仅有统计、无逐引擎明细，则回退为一条 **汇总** malicious/suspicious finding。

部分 **平台合规/质量** finding（如 tags、description 规范）计入审查记录，但 **不在安全区域列表展示**；它们仍可能影响发布 verdict（通常为 **需复核**）。

## Finding 严重度分级（一句话）

每条 finding 徽章为 **低 / 中 / 高 / 严重** 之一（对应 LOW / MEDIUM / HIGH / CRITICAL）。下面帮助非技术读者理解 **单条问题** 的严重程度（与上方 **包级**「低 / 中 / 高 / 严重」不是同一计数，包级看全部问题汇总）。

| 等级 | 一句话 |
| --- | --- |
| **低** | 多为规范或习惯类提示，一般 **不会** 单独导致「不能安装」，但仍建议顺手改一改。 |
| **中** | 存在 **值得人工看一眼** 的问题；SkillSpector **medium 且置信度 ≥ 90%** 会 **拒绝发布**，其余 medium 多为 **需复核**。 |
| **高** | 有较明确的 **安全或滥用风险**；SkillSpector / VirusTotal 的 high 级 finding 会 **拒绝发布**。 |
| **严重** | 属于 **最严重** 一类（如明确恶意特征、可造成严重危害），应 **停止安装** 并优先修复或下架。 |

## 包级风险分怎么理解

SkillSpector 对每条 finding 按 **严重度** 与 **置信度** 贡献分数，同一规则重复命中有递减上限；可执行脚本上的命中可能略加重权重。分数映射关系（摘要）：

| 风险分 | 包级风险 | 安装建议 |
| --- | --- | --- |
| 0–20 | 低 | 可安装（SAFE） |
| 21–50 | 中 | 谨慎（CAUTION） |
| 51–80 | 高 | 不建议安装 |
| 81–100 | 严重 | 不建议安装 |

**注意**：单条 finding 的徽章（例如「中」）表示 **该条规则** 的严重度，与包级「中」不是同一计数方式。例如一条「中」级 MP2 finding 可能只贡献较低风险分，包级仍为「低」。

## Finding 严重度与发布（verdict）

平台 **verdict** 在审查流水线 **全部成功完成** 后，由 finding 综合判定。**自动拒绝** 仅看 SkillSpector / VirusTotal 的特定安全 finding（见下表）。

| 来源 | 已拒绝（rejected） | 需复核（needs-review） |
| --- | --- | --- |
| **SkillSpector**（已启用） | `high` / `critical`；或 `medium` 且置信度 **≥ 90%** | 其余 SkillSpector finding |
| **VirusTotal**（已启用） | `high` / `critical`（如 malicious 检出） | 其余（如 suspicious 检出） |
| **HaluCatch**（已启用） | 评估成功后的 fail 等（见质量文档） | warn 等 |
| **平台规则等** | 不自动拒绝 | 存在任意 finding 时为需复核 |
| **无任何 finding 且各启用步骤均成功** | — | **已发布（published）** |

**审查流水线未完成**（如 VirusTotal 分析超时、SkillSpector/HaluCatch 运行时不可用）时，API 返回 `review_pipeline_incomplete`，**Skill 版本不会写入注册表**；发布页会列出失败环节并提供 **重新运行完整审查**。这与「版本已入库但 verdict 为已拒绝」不同（见 [发布流程](./publish-workflow.md)）。

SkillSpector 的「不建议安装」是 **包级安全建议**，与页面「已拒绝 / 需复核」徽章相关但不完全等同。

**已拒绝** 的 Skill 不会出现在 Skill 搜索与榜单；Skill **拥有者** 可在个人中心查看并进入详情页处理 finding（见 [发布流程](./publish-workflow.md)）。

## 覆盖的安全主题（示例）

静态规则覆盖多类风险，包括但不限于：

- 提示注入、系统提示泄露、数据外泄、SSRF  
- 权限提升、供应链与混淆代码、危险 API（exec/eval/subprocess 等）  
- 记忆投毒（含无意义长重复 description）、工具滥用、Agent 窥探  
- MCP 最小权限与工具投毒、反拒绝（jailbreak）表述  
- YARA 特征命中等  

说明文案在 Web 端按 **规则 ID** 展示为 **中文**；证据区仍显示包内原文片段。

## VirusTotal API 配额与速率限制

本节说明 VirusTotal API v3 的 **quota（配额）** 与 **rate limit（速率）**，以及本平台一次发布实际会打哪些接口。规则以 [VirusTotal 官方文档](https://docs.virustotal.com/reference/public-vs-premium-api) 为准；**Public API** 与 **Premium API** 不同，下文默认指 Public 档。

### 总原则

- **一般情况下：1 次 API 调用 = 消耗 1 次 quota**（按 API Key 汇总，所有端点共用同一池子）。
- 限制对象是 **HTTP 请求次数**，不是 AV 引擎数量，也不是 ZIP 包内的文件个数。
- 超出 Public 速率或日配额时，常见响应为 HTTP **429**；扫描未完成会导致发布 **已拒绝**。

Public API 文档中的典型上限：

| 维度 | 限制 |
| --- | --- |
| 速率 | **4 次请求 / 分钟**（约每 15 秒 1 次） |
| 日配额 | **500 次请求 / 天**（UTC 0 点重置） |

Premium / 企业 Key 按合同 SLA，无公开固定数字；可用 `/users/{id}/overall_quotas` 等端点查询（需相应权限）。

### 不消耗 quota 的情况（官方例外）

| 场景 | 是否耗 quota |
| --- | --- |
| 查配额：`/users/{id}/overall_quotas`、`/users/{id}/api_usage` | 否 |
| Feeds 相关端点（含 feeds 提供的下载链接） | 否 |
| `GET /analyses/{id}` 且 `{id}` **无效** | 否 |
| **上传 VirusTotal 中尚不存在的新文件**（`POST /files`） | 否 |
| 对该新文件后续的 `GET /files/{sha256}` | 否 |
| 对该新文件后续的 `GET /analyses/{id}`（轮询分析状态） | 否 |

即：**首次把新样本送入 VT 的 upload → 轮询 → 取报告** 链路，官方写明 **不扣 quota**。

### 仍消耗 quota 的情况

| 场景 | 说明 |
| --- | --- |
| 查询 **已在库中** 的文件：`GET /files/{hash}` → 200 | 通常算 1 次 |
| 查询 **未知 hash** 返回 404 | 文档未列入免费例外，一般仍算 1 次 |
| 主动重扫：`POST /files/{sha256}/analyse` | 算 1 次（即使刚上传过） |
| 绝大多数其他普通 API 调用 | 每次 1 次 |

### 本平台：ZIP 算几个 lookup？

**一个 Skill 发布包 = 一个文件对象 = 一次 hash lookup。**

平台对 **整包 ZIP 字节** 计算 SHA-256（`skillSnapshotToZipBuffer`），再调用 `GET /files/{hash}`。包内 `SKILL.md`、脚本等 **不会** 各自再 lookup。只有在外部手动对每个内部文件分别算 hash 并查询时，才会各算 1 次 API 调用。

VirusTotal 收到 ZIP 后可能在内部解压扫描，那是 VT 侧行为，**不会** 按包内文件数倍增你的 API quota。

### 扫描流程与两种轮询

平台按以下顺序处理 VirusTotal（简化）：

```text
GET /files/{zipSha256}
    │
    ├─ 404 ──►（可选）POST /files 上传
    │              └─► GET /analyses/{id} 轮询（analysis 轮询）
    │
    └─ 200 ──► 若 last_analysis_stats 合计为 0
                   └─► GET /files/{zipSha256} 轮询（file 轮询，直至引擎数 > 0 或超时）
```

| 轮询类型 | 接口 | 典型场景 | quota（Public 档） |
| --- | --- | --- | --- |
| **analysis 轮询** | `GET /analyses/{id}` | 新文件 upload 后等本次分析任务 | 新文件链路通常 **不扣** |
| **file 轮询** | `GET /files/{hash}` | hash 已存在但 VT 仍在分析（如首次 upload 超时后重试） | 每次 lookup 通常 **算 1 次** |

hash lookup 响应 **不包含** 进行中的 `analysisId`，因此无法在无 upload 上下文时直接把 file 轮询改成 analysis 轮询；平台通过 file 轮询等待 VT 把结果写入 file 资源。

### 一次发布消耗多少次 API？

取决于 hash 是否已在 VT 库中、分析是否已完成，以及 `VIRUSTOTAL_UPLOAD_ON_MISS` 是否开启。

**路径 A1：Hash 已在 VT 且分析已完成（缓存命中，最快）**

```text
GET /files/{zipSha256}  → 200，last_analysis_stats 合计 > 0
```

→ 约 **1 次 quota** / 次发布。

**路径 A2：Hash 已在 VT 但分析尚未完成（pending）**

```text
GET /files/{zipSha256}  → 200，引擎统计为 0
GET /files/{zipSha256} × N  → 轮询直至 stats 就绪或超时
```

→ **1 + N 次 quota**（每次 file lookup 通常算 1 次）；超时则审查流水线失败，**不保存 Skill**，发布页可重试。  
常见原因：首次 upload 已成功但平台在分析完成前超时；或他人刚上传同 hash、VT 仍在排队。

**路径 B：Hash 不存在且开启 upload-on-miss**

```text
1. GET  /files/{zipSha256}     → 404（约 1 次 quota）
2. POST /files                 → 上传 ZIP（新文件：0 次 quota）
3. GET  /analyses/{id} × N     → 轮询直至 completed（新文件：0 次 quota）
4. GET  /files/{zipSha256}     → 可选，补 threat_verdict（新文件：0 次 quota）
```

→ 新包 upload 路径在 quota 上通常 **主要消耗开头那次 404 lookup**；主要瓶颈是 **分析等待时间**（轮询间隔与超时），而非多次扣 quota。

**路径 C：Hash 不存在且关闭 upload-on-miss**

```text
GET /files/{zipSha256}  → 404
```

→ 约 **1 次 quota**；审查记录为「未命中历史报告」，不上传样本。

### 并发与容量规划（Public 档粗算）

配额按 **Key** 共享，多用户同时发布会争抢同一池子。本平台 **未** 内置 VT 全局限流，运维需自行控制并发。

| 发布类型 | 每 Skill quota（约） | Public 4/min 下粗算 |
| --- | --- | --- |
| 已缓存 hash 且结果就绪（路径 A1） | 1 | 约 **4 个 / 分钟** |
| hash 命中但 pending（路径 A2） | 1 + 轮询次数 | 受 **4/min** 与轮询间隔限制；间隔不宜过短 |
| 全新包 upload-on-miss（路径 B） | 1（首查 404）+ 0（upload/analysis 轮询） | quota 通常不是瓶颈；**耗时与 429** 是瓶颈 |
| 主动重扫 | 额外 +1 / 次 | 额外占用 |

**注意：** 即使 upload 链路不扣 quota，高并发 upload 仍可能触发 **429** 或服务端排队；路径 A2 的 file 轮询每次通常消耗 quota，**不宜**把 `VIRUSTOTAL_POLL_INTERVAL_MS` 设得过短。生产环境建议：串行或队列化发布、lookup 间隔 ≥15s、加大 `VIRUSTOTAL_ANALYSIS_TIMEOUT_MS`（默认 5 分钟）以容纳 VT 排队。

本地可用 `npm run vt:stress`（`scripts/vt-lookup-stress.mjs`）探测当前 Key 的实际 429 行为。

### 文件大小与其它限制

| 项 | 限制 |
| --- | --- |
| 直传上传 | **32 MB**（`POST /files`） |
| 大文件上传 | **650 MB**（先 `GET /files/upload_url` 再 POST） |
| 单次 HTTP 超时 | 各步骤独立默认（见下）；未设专用变量时回退 `VIRUSTOTAL_TIMEOUT_MS`（默认 90s） |
| 步骤级超时 | lookup / upload_url / upload / analysis_poll / metadata_lookup 可分别配置；**超时或 transient 网络错误自动重试 1 次** |
| 分析 / pending 轮询总时长 | 默认 **300s（5 分钟）**（`VIRUSTOTAL_ANALYSIS_TIMEOUT_MS`；未设则回退 `VIRUSTOTAL_TIMEOUT_MS`，默认 90s） |
| 轮询间隔 | 默认 **30s**（`VIRUSTOTAL_POLL_INTERVAL_MS`；analysis 与 file pending 共用） |

## SkillSpector 不可用时

若 Python 或 SkillSpector 依赖缺失，审查记录中可能出现 **SkillSpector unavailable** 类 finding，平台会回退部分内置正则检查。恢复环境后应对该版本 **重跑审查** 以得到完整 SkillSpector 结果。

环境变量（运维参考，一般用户无需修改）：

- `SKILLSPECTOR_ENABLED=false` 可关闭 SkillSpector  
- `SKILLSPECTOR_PYTHON`、`SKILLSPECTOR_DIR`、`SKILLSPECTOR_TIMEOUT_MS` 用于指定解释器、目录与超时  
- `VIRUSTOTAL_API_KEY` 启用 VirusTotal（未配置则跳过 VT 扫描）  
- `VIRUSTOTAL_ENABLED=false` 可显式关闭 VirusTotal  
- `VIRUSTOTAL_UPLOAD_ON_MISS=true` 未命中 hash 时上传 ZIP 并轮询（见上文 **配额与速率**；上传新文件链路官方不扣 quota，但耗时长）  
- `VIRUSTOTAL_TIMEOUT_MS` 各步骤 HTTP 超时回退值（默认 90000）  
- `VIRUSTOTAL_LOOKUP_TIMEOUT_MS`、`VIRUSTOTAL_UPLOAD_TIMEOUT_MS`、`VIRUSTOTAL_ANALYSIS_POLL_TIMEOUT_MS` 等步骤专用超时（见 `.env.example`）  
- `VIRUSTOTAL_ANALYSIS_TIMEOUT_MS` upload 后 analysis 轮询，以及 hash 命中 pending 时 file 轮询的总超时（默认 **300000**）  
- `VIRUSTOTAL_POLL_INTERVAL_MS` 轮询间隔（默认 **30000**；Public Key 下不建议低于 15s）

## 如何修复与重新发布

1. 根据 finding **建议** 修改 SKILL.md 或相关文件（删除危险指令、缩短异常重复内容、声明权限等）。  
2. 递增 **version**，重新 [发布](./publish-workflow.md)。  
3. 对比新旧版本的包级风险分、安全分与 finding 是否减少。

## 相关文档

- [Skill 格式](./skill-format.md) — 避免 frontmatter 触发误报  
- [质量审查](./halucatch-review.md) — 质量维度与安全互补
