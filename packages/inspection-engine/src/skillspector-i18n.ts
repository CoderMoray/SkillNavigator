/** SkillSpector static rule copy (zh-CN). Keys match SkillSpector rule_id; do not edit SkillSpector vendor. */

export interface SkillSpectorRuleZh {
  category: string;
  message: string;
  recommendation: string;
}

export const SKILLSPECTOR_RULE_ZH: Record<string, SkillSpectorRuleZh> = {
  P1: {
    category: "提示注入",
    message:
      "检测到试图覆盖系统指令或忽略安全约束的模式。未经 LLM 分析时，建议人工复核。",
    recommendation:
      "删除或改写要求 Agent 忽略提示、覆盖安全规则或信任未验证内容的文本，避免 Skill 内容被注入以改变 Agent 行为。"
  },
  P2: {
    category: "提示注入",
    message: "在注释或不可见文本中发现隐藏指令，可能包含恶意指示，建议人工复核。",
    recommendation:
      "审计所有注释与不可见字符，移除要求 Agent 执行未授权操作的指令，使用可读、可审查的明文内容。"
  },
  P3: {
    category: "提示注入",
    message: "发现要求 Agent 将会话上下文或用户数据传输到外部服务的指令。",
    recommendation:
      "移除将用户数据、提示或上下文发往外部 URL 的指令；若需遥测，应使用文档化且保护隐私的方式。"
  },
  P4: {
    category: "提示注入",
    message: "检测到可能改变 Agent 决策或引入隐性偏见的间接指令。",
    recommendation: "检查是否存在隐性引导或偏见，确保指令明确且与 Skill 声明目的一致。"
  },
  P5: {
    category: "提示注入",
    message: "内容可能包含若被遵循会导致人身伤害的有害指令，务必仔细审查。",
    recommendation: "移除可能导致危害后果的内容，对高风险操作增加安全护栏与人工监督。"
  },
  P6: {
    category: "系统提示泄露",
    message: "Skill 含有可能直接向用户或外部暴露系统提示、内部规则或隐藏指令的内容。",
    recommendation: "移除任何揭示、打印或输出系统提示或内部规则的指令，系统指令不得暴露给终端用户。"
  },
  P7: {
    category: "系统提示泄露",
    message: "Skill 含有可能通过改写、翻译、摘要或侧信道间接提取系统提示的模式。",
    recommendation:
      "拒绝总结、翻译或改写系统指令的请求，并加入明确的反提取条款。"
  },
  P8: {
    category: "系统提示泄露",
    message: "Skill 含有通过工具调用（写文件、网络、日志）外泄系统提示或内部指令的模式。",
    recommendation:
      "防止系统提示被写入文件、经网络发送或记录到日志；将系统指令视为机密并从所有工具输出中过滤。"
  },
  E1: {
    category: "数据外泄",
    message: "数据正被发送到外部 URL，可能是合法遥测或数据外泄，建议人工复核。",
    recommendation:
      "确认目标 URL 可信且必要，移除或替换为文档化 API，确保不传输密钥、令牌或 PII。"
  },
  E2: {
    category: "数据外泄",
    message: "代码访问可能含密钥（API Key、令牌）的环境变量，常见于凭证窃取。",
    recommendation:
      "除非严格必要，避免读取敏感环境变量；使用密钥管理或安全配置，切勿记录或外传凭证。"
  },
  E3: {
    category: "数据外泄",
    message: "代码扫描文件系统目录以查找敏感文件，可能为凭证窃取的侦察行为。",
    recommendation:
      "移除不必要的文件系统扫描；若需访问文件，使用明确、受限路径，避免读取 ~/.ssh、~/.aws 等凭证目录。"
  },
  E4: {
    category: "数据外泄",
    message: "代码或指令将会话上下文泄露到外部服务，可能暴露敏感用户交互。",
    recommendation: "移除向外发送提示、回复或会话数据的代码，保护用户隐私，切勿外泄对话内容。"
  },
  E5: {
    category: "数据外泄",
    message: "数据上传到云存储（S3/GCS/Azure Blob），可能是备份或外泄到外部桶，建议人工复核。",
    recommendation:
      "确认目标桶可信且归你所有，切勿将凭证、密钥或工作区内容上传到外部或未验证的云存储。"
  },
  PE1: {
    category: "权限提升",
    message: "Skill 请求的权限超出其声明功能所需，请评估 elevated 访问是否合理。",
    recommendation:
      "仅申请最小必要权限，说明每项权限用途，移除「*」或「all」等宽泛权限。"
  },
  PE2: {
    category: "权限提升",
    message: "命令调用 sudo 或 root 权限，请确认是否必要且合理。",
    recommendation: "除非严格必要，避免 sudo/root；优先最小权限，若需提权应文档化理由与范围。"
  },
  PE3: {
    category: "权限提升",
    message: "代码访问凭证文件（SSH 密钥、AWS 凭证等），可能为凭证窃取。",
    recommendation:
      "移除对凭证路径的引用，使用环境变量或密钥管理；文档中使用占位路径，生产路径切勿加载 .env 或令牌文件。"
  },
  SC1: {
    category: "供应链",
    message: "依赖未固定版本，可能引入恶意包更新，建议锁定版本。",
    recommendation:
      "在 requirements.txt 或 pyproject.toml 中锁定依赖版本，使用精确版本或兼容范围，定期运行 pip-audit。"
  },
  SC2: {
    category: "供应链",
    message: "下载并执行远程代码，绕过代码审查，可能引入恶意代码。",
    recommendation:
      "避免下载执行远程脚本，使用 PyPI/npm 可信包；若必须拉取远程内容，应校验 checksum 并使用 HTTPS。"
  },
  SC3: {
    category: "供应链",
    message: "代码含混淆（Base64、十六进制编码后执行），常用于隐藏恶意功能。",
    recommendation: "移除混淆代码，使用可读实现；混淆阻碍安全审查并降低信任度。"
  },
  SC4: {
    category: "供应链",
    message: "依赖存在已知 CVE 漏洞，使用未修补包会暴露于已知 exploit。",
    recommendation: "将依赖升级到已修复 CVE 的版本，查阅 OSV 或 NVD 了解漏洞详情。"
  },
  SC5: {
    category: "供应链",
    message: "依赖疑似废弃或未维护，将不再收到安全补丁。",
    recommendation: "替换为活跃维护的替代依赖，查看仓库最近提交与 issue 状态。"
  },
  SC6: {
    category: "供应链",
    message: "包名与流行包高度相似，可能存在 typosquatting。",
    recommendation: "核对包名是否正确，与 PyPI/npm 官方名称对比，避免安装仿冒包。"
  },
  SC7: {
    category: "供应链",
    message:
      "拉取容器镜像时禁用签名或 registry 验证（如 --disable-content-trust），存在供应链篡改风险。",
    recommendation:
      "保持镜像签名验证（Docker Content Trust/cosign）与 registry TLS，仅从可信 registry 拉取已签名镜像。"
  },
  EA1: {
    category: "过度代理",
    message:
      "Skill 授予无约束的工具访问；Agent 可执行任意文件、网络、代码执行等操作。",
    recommendation: "将工具访问限制在 Skill 声明目的所需范围，使用显式 allowlist 而非 blanket 授权。"
  },
  EA2: {
    category: "过度代理",
    message: "Skill 启用无人在环的高影响自主决策，关键操作应需用户确认。",
    recommendation:
      "对破坏性、不可逆或高影响操作增加人工确认，切勿自动执行改文件、发数据或改系统状态的操作。"
  },
  EA3: {
    category: "过度代理",
    message: "Skill 行为或能力超出声明目的，扩大攻击面。",
    recommendation: "将 Skill 范围限制在文档化目的内，移除超出声明功能的指令。"
  },
  EA4: {
    category: "过度代理",
    message: "Skill 允许无界资源消耗（API、存储、算力），可能导致 DoS 或成本失控。",
    recommendation: "为 API、文件与算力设置速率限制、超时与配额，对失控循环实现熔断。"
  },
  OH1: {
    category: "输出处理",
    message: "模型输出未经验证或 sanitization 即用于下游（SQL、Shell、HTML），可导致注入与 RCE。",
    recommendation:
      "在使用前验证并清理模型输出；SQL 用参数化查询，Shell 正确引号，Web 做 HTML 编码。"
  },
  OH2: {
    category: "输出处理",
    message: "跨安全上下文使用输出且未强制边界，可能泄露信息或提权。",
    recommendation: "严格隔离上下文，跨域传递输出前必须验证并脱敏。"
  },
  OH3: {
    category: "输出处理",
    message: "输出大小或生成速率无界，可能导致资源耗尽、日志洪水或上下文填充。",
    recommendation: "限制输出长度、生成次数与速率，使用 max_tokens 与截断防止无界输出。"
  },
  MP1: {
    category: "记忆投毒",
    message: "Skill 注入设计为在多次交互中持久存在于 Agent 记忆/上下文的内容，可能长期改变行为。",
    recommendation:
      "勿让不可信输入持久化到 Agent 记忆；存储前验证内容，并在会话间隔离记忆。"
  },
  MP2: {
    category: "记忆投毒",
    message:
      "Skill 试图用填充内容占满上下文窗口，挤占合法指令与安全约束，可能降低性能或绕过安全边界。",
    recommendation:
      "实施上下文窗口管理，检测并拒绝 padding/stuffing；优先保留系统指令而非用户注入内容。"
  },
  MP3: {
    category: "记忆投毒",
    message: "Skill 操纵 Agent 记忆、状态或存储上下文，可能覆盖安全规则或导致不可预测行为。",
    recommendation:
      "保护 Agent 记忆与状态不被不可信内容修改；关键指令只读，并验证所有状态变更。"
  },
  TM1: {
    category: "工具滥用",
    message: "工具参数被构造以产生非预期或不安全行为（如 shell=True、--force、危险 glob）。",
    recommendation:
      "对工具参数做 allowlist 校验，拒绝危险参数值，使用安全默认值。"
  },
  TM2: {
    category: "工具滥用",
    message: "工具调用被链式组合以绕过单项安全检查或放大能力。",
    recommendation: "限制链式深度，逐步验证输出，多步链应需用户明确批准。"
  },
  TM3: {
    category: "工具滥用",
    message: "工具默认配置不安全或过于宽松（如关闭 TLS 验证、无认证、全局可写）。",
    recommendation: "用安全设置覆盖不安全默认（verify=True、需认证、 restrictive 权限）。"
  },
  TM4: {
    category: "工具滥用",
    message: "部署特权 Kubernetes 工作负载（privileged、hostPath、host namespace），可导致节点接管。",
    recommendation:
      "移除 privileged、hostPath 与 host namespace；使用最小权限 securityContext 并 drop capabilities。"
  },
  RA1: {
    category: "恶意 Agent",
    message: "Skill 在运行时修改自身代码、配置或行为，可能提权、关安全或植入后门。",
    recommendation: "禁止 Skill 在运行时修改自身代码、SKILL.md 或配置，运行时将 Skill 文件视为只读。"
  },
  RA2: {
    category: "恶意 Agent",
    message: "Skill 通过 cron、启动脚本或状态文件建立未授权跨会话持久化。",
    recommendation: "移除 cron、启动脚本等持久化机制；未经用户同意不应跨会话维持状态。"
  },
  TR1: {
    category: "触发滥用",
    message: "触发模式过宽，易在非预期上下文激活并 shadow 其他 Skill。",
    recommendation: "使用 narrow、与用途匹配的触发条件，避免单词或常见短语触发。"
  },
  TR2: {
    category: "触发滥用",
    message: "触发与内置命令或其他 Skill 冲突，可能拦截本属可信功能的请求。",
    recommendation: "选择不与内置或其他 Skill 冲突的触发词，必要时加唯一命名空间前缀。"
  },
  TR3: {
    category: "触发滥用",
    message: "触发使用模糊或泛化关键词以最大化激活频率。",
    recommendation: "使用能清晰表达 Skill 用途的描述性触发，而非泛化 bait 关键词。"
  },
  TT1: {
    category: "数据外泄",
    message: "数据从源（环境变量、文件、网络）直达 sink（网络输出、exec、写文件）且未经中间验证。",
    recommendation: "在源与 sink 之间增加验证或 sanitization，切勿将原始源数据直接传入 sink。"
  },
  TT2: {
    category: "数据外泄",
    message: "源数据赋给变量后传入 sink，形成变量介导的污点流。",
    recommendation: "在传入 sink 前验证污点变量，对外部数据使用 allowlist、类型检查或 sanitization。"
  },
  TT3: {
    category: "数据外泄",
    message: "凭证或环境变量流向网络 sink，高度疑似凭证外泄。",
    recommendation: "切勿经网络发送凭证或环境变量；使用安全凭证存储，避免在请求体或 URL 中传输密钥。"
  },
  TT4: {
    category: "数据外泄",
    message: "文件内容流向网络 sink，可能外泄敏感文件。",
    recommendation: "经网络发送前验证并过滤文件内容，确保凭证、配置等敏感文件不外传。"
  },
  TT5: {
    category: "权限提升",
    message: "外部输入（网络、用户）流向代码执行 sink，可导致 RCE 或命令注入。",
    recommendation:
      "未经严格验证勿将外部输入传入 exec/eval/os.system/subprocess；使用 allowlist 与参数化命令。"
  },
  AST1: {
    category: "危险代码",
    message: "直接调用 exec()，可执行任意代码，攻击者可获得进程完整权限。",
    recommendation:
      "用安全替代方案替换 exec()；若必须动态执行，使用沙箱或限制 __builtins__ 的 eval 环境。"
  },
  AST2: {
    category: "危险代码",
    message: "直接调用 eval() 可执行任意表达式，可能被利用执行恶意代码或外泄数据。",
    recommendation: "用 ast.literal_eval() 或显式解析替换 eval()，切勿 evaluate 不可信字符串。"
  },
  AST3: {
    category: "危险代码",
    message: "动态 __import__() 可在运行时加载任意模块，绕过静态分析。",
    recommendation: "使用标准 import；若需动态加载，用 importlib 并限制允许模块 allowlist。"
  },
  AST4: {
    category: "危险代码",
    message: "subprocess 调用外部命令，输入未校验时可导致命令注入。",
    recommendation: "使用 subprocess.run(shell=False) 与显式参数列表，校验所有输入。"
  },
  AST5: {
    category: "危险代码",
    message: "os.system() 等以进程完整权限执行 shell 命令，可导致任意命令执行。",
    recommendation: "用 subprocess.run(shell=False) 替换 os.system()，使用显式参数并校验输入。"
  },
  AST6: {
    category: "危险代码",
    message: "compile() 从字符串创建代码对象，与 exec/eval 组合可混淆执行。",
    recommendation: "避免对动态字符串 compile()；若需生成代码，使用模板或受控 AST 操作。"
  },
  AST7: {
    category: "危险代码",
    message: "对非常量属性名使用动态 getattr()，可能绕过访问控制。",
    recommendation: "用显式属性访问或带 allowlist 的字典查找替换动态 getattr()。"
  },
  AST8: {
    category: "危险代码",
    message: "危险执行链将 exec/eval 与动态源（网络、编码数据、动态 import）结合，高置信攻击向量。",
    recommendation:
      "移除整条执行链；切勿将网络数据、解码字节或动态 import 的代码传入 exec/eval()，改用结构化数据格式。"
  },
  AST9: {
    category: "危险代码",
    message:
      "通过 getattr 反射访问执行 sink（如 getattr(os,'system')），功能等同直接调用但规避名称检测，属刻意 evasion。",
    recommendation:
      "改为直接调用或移除；若必须反射，限制为不含执行 sink 的安全属性 allowlist。"
  },
  YR1: {
    category: "YARA 命中",
    message: "YARA 规则命中已知恶意软件特征（反弹 shell、后门、勒索、C2、窃密等）。",
    recommendation: "移除恶意载荷或受感染文件，调查进入途径并审计其他制品是否被入侵。"
  },
  YR2: {
    category: "YARA 命中",
    message: "YARA 规则命中已知 Webshell 模式（PHP/Python/JSP/ASPX 等）。",
    recommendation: "立即移除 Webshell 代码并审计 Skill 是否另有后门或持久化机制。"
  },
  YR3: {
    category: "YARA 命中",
    message: "YARA 规则命中加密货币挖矿指标（stratum、矿池、矿工二进制、cryptojacking 脚本等）。",
    recommendation: "移除所有挖矿代码、矿池引用与矿工二进制；在 Agent Skill 中未经授权挖矿属于资源滥用。"
  },
  YR4: {
    category: "YARA 命中",
    message: "YARA 规则命中黑客工具或 exploit 指标（ offensive 工具、侦察、提权、 exploit 框架等）。",
    recommendation: "移除 offensive 工具引用与 exploit 代码；合法 Agent Skill 不应包含渗透测试或 exploit 工具。"
  },
  LP1: {
    category: "MCP 最小权限",
    message: "代码使用未在声明权限中覆盖的能力（网络、Shell、写文件等），Skill 实际能力超出声明。",
    recommendation: "在 SKILL.md 中补充缺失权限，或移除需要该权限的代码。"
  },
  LP2: {
    category: "MCP 最小权限",
    message: "权限列表含通配符（「*」或「all」），授予 blanket 访问，破坏最小权限。",
    recommendation: "将通配符权限替换为所需能力的显式列表。"
  },
  LP3: {
    category: "MCP 最小权限",
    message: "manifest 无 permissions 字段但代码使用可检测能力，意图不透明且无法验证。",
    recommendation: "在 SKILL.md 增加 permissions 字段，列出 Skill 所需能力。"
  },
  LP4: {
    category: "MCP 最小权限",
    message: "声明了权限但未检测到对应代码能力，可能为预留滥用或已移除功能。",
    recommendation: "若不再使用对应能力，移除该声明权限。"
  },
  TP1: {
    category: "MCP 工具投毒",
    message: "在 Skill 元数据（description、triggers、parameters）中发现隐藏指令，可暗中 steer LLM。",
    recommendation:
      "从元数据字段移除 HTML/Markdown 注释、零宽字符、Base64 等隐藏内容，元数据应为可见明文。"
  },
  TP2: {
    category: "MCP 工具投毒",
    message: "在标识或描述中检测到 Unicode 欺骗（同形字、RTL 覆盖、不可见字符）。",
    recommendation: "将标识中的非 ASCII 替换为 ASCII 等价物，移除 RTL 覆盖与不可见格式字符。"
  },
  TP3: {
    category: "MCP 工具投毒",
    message: "在参数描述或默认值中发现指令注入模式，LLM 会读取并可能覆盖预期行为。",
    recommendation: "从参数描述与默认值中移除注入模式、系统 token 与可疑内容。"
  },
  TP4: {
    category: "MCP 工具投毒",
    message: "Skill 描述与实际代码行为不一致，存在欺骗可能。",
    recommendation: "更新描述以准确反映全部能力，或移除未声明功能。"
  },
  AS1: {
    category: "Agent 窥探",
    message:
      "Skill 读取 Agent 配置目录（.claude/、.codex/、.gemini/ 等），可能含 API Key 与个人设置。",
    recommendation:
      "移除访问 Agent 配置目录的代码或指令；若需配置值，应通过参数或环境变量显式传入，勿读 Agent 自有配置。"
  },
  AS2: {
    category: "Agent 窥探",
    message: "Skill 访问 MCP 配置文件（mcp.json），含 URL、令牌与工具定义。",
    recommendation: "移除读取 mcp.json 的代码；MCP 应由运行时管理，不应由单个 Skill 读取。"
  },
  AS3: {
    category: "Agent 窥探",
    message: "Skill 枚举或读取其他已安装 Skill，可能泄露他人 prompt 与密钥。",
    recommendation: "移除跨 Skill 读取文件或目录的代码；Skill 应独立运行，禁止 peer 提权访问。"
  },
  AR1: {
    category: "反拒绝",
    message: "Skill 要求 Agent 永不拒绝或始终服从，削弱核心安全控制。",
    recommendation: "移除要求永不拒绝或始终 comply 的指令，Agent 必须能拒绝不安全或越界请求。"
  },
  AR2: {
    category: "反拒绝",
    message: "Skill 要求 Agent 省略警告、免责声明或伦理说明，常见于 jailbreak 前言。",
    recommendation: "移除抑制警告或免责声明的指令，让 Agent 向用户呈现安全相关 caveat。"
  },
  AR3: {
    category: "反拒绝",
    message: "Skill 试图使 Agent 安全策略失效（如「无任何限制」「忽略指南」），属直接 jailbreak。",
    recommendation: "移除 nullify 安全策略的 jailbreak 表述，Skill 不得 instruct Agent 忽略 guardrails。"
  },
  SSRF1: {
    category: "SSRF",
    message: "代码访问云实例元数据端点（如 169.254.169.254），一次请求即可获取临时 IAM 凭证。",
    recommendation:
      "除非严格必要，移除对云元数据端点的访问；若必须，限制为 IMDSv2 等并切勿暴露返回凭证。"
  },
  SSRF2: {
    category: "SSRF",
    message: "代码请求 loopback、链路本地或私网地址，可访问不应暴露的内网服务。",
    recommendation:
      "避免从 Skill 代码请求内网主机；若确需内网访问，应文档化并对目标做 allowlist 校验。"
  },
  SSRF3: {
    category: "SSRF",
    message: "请求目标主机由动态或不可信值构造，攻击者可影响主机从而 SSRF 到内网或元数据。",
    recommendation: "勿用不可信输入构造 URL；对主机做 allowlist，拒绝内网与元数据地址后再发请求。"
  }
};

const DEFAULT_RULE_ZH: SkillSpectorRuleZh = {
  category: "安全",
  message: "检测到潜在安全问题，建议人工审查。",
  recommendation: "审查标记内容是否存在安全风险，确保未暴露凭证、密钥或敏感数据。"
};

const RULE_ID_SORTED = Object.keys(SKILLSPECTOR_RULE_ZH).sort((a, b) => b.length - a.length);

function sanitizeId(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "finding";
}

export function extractSkillSpectorRuleId(findingId: string): string | null {
  if (!findingId.startsWith("skillspector-")) {
    return null;
  }
  const body = findingId.slice("skillspector-".length);
  const indexMatch = body.match(/-(\d+)$/);
  if (!indexMatch) {
    return null;
  }
  const withoutIndex = body.slice(0, -indexMatch[0].length);
  for (const ruleId of RULE_ID_SORTED) {
    const prefix = sanitizeId(ruleId);
    if (withoutIndex === prefix || withoutIndex.startsWith(`${prefix}-`)) {
      return ruleId;
    }
  }
  return null;
}

function extractLocationSuffix(message: string): string {
  const match = message.match(/(\s*\([^)]+:\d+\))\s*$/);
  return match?.[1] ?? "";
}

export interface LocalizableSkillSpectorFinding {
  id: string;
  title: string;
  message: string;
  recommendation: string;
}

export function localizeSkillSpectorFinding<T extends LocalizableSkillSpectorFinding>(finding: T): T {
  const ruleId = extractSkillSpectorRuleId(finding.id);
  if (!ruleId) {
    return finding;
  }
  const zh = SKILLSPECTOR_RULE_ZH[ruleId] ?? DEFAULT_RULE_ZH;
  const locationSuffix = extractLocationSuffix(finding.message);
  return {
    ...finding,
    title: zh.category,
    message: locationSuffix ? `${zh.message}${locationSuffix}` : zh.message,
    recommendation: zh.recommendation
  };
}

export function localizeSkillSpectorFindingByRuleId<T extends LocalizableSkillSpectorFinding>(
  finding: T,
  ruleId: string
): T {
  const normalized = ruleId.trim().toUpperCase();
  const zh = SKILLSPECTOR_RULE_ZH[normalized] ?? DEFAULT_RULE_ZH;
  const locationSuffix = extractLocationSuffix(finding.message);
  return {
    ...finding,
    title: zh.category,
    message: locationSuffix ? `${zh.message}${locationSuffix}` : zh.message,
    recommendation: zh.recommendation
  };
}
