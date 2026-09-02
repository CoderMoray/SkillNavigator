/** Placeholders for skillnav CLI examples shown in the Web UI. */
export const SKILLNAV_API_KEY_PLACEHOLDER = "sk_…";

export function skillnavLoginExample(apiKey = SKILLNAV_API_KEY_PLACEHOLDER): string {
  return `skillnav login --api-key ${apiKey}`;
}

export function skillnavPublishExample(packagePath = "./my-skill"): string {
  return `skillnav publish ${packagePath}`;
}

export function skillnavDownloadExample(slug = "demo-skill", output = "demo-skill.zip"): string {
  return `skillnav download ${slug} -o ${output}`;
}

export function skillnavInstallExample(slug: string, version?: string): string {
  if (!version || version === "latest") {
    return `skillnav install ${slug}`;
  }
  return `skillnav install ${slug} --version ${version}`;
}

export function skillnavInstallWithRegistryExample(
  slug: string,
  version: string,
  registryUrl: string
): string {
  const versionFlag = version && version !== "latest" ? ` --version ${version}` : "";
  return `skillnav --registry ${registryUrl} install ${slug}${versionFlag}`;
}

export function skillnavHomeCliExamples(): string {
  return [
    `$ ${skillnavLoginExample()}`,
    `$ ${skillnavPublishExample()}`,
    `$ ${skillnavDownloadExample()}`,
  ].join("\n");
}

/**
 * Multi-line prompt for copying into an AI agent that operates the registry
 * via the skillnav CLI: covers CLI login, install, publish, and doc links.
 */
export function skillnavAgentInstallPrompt(): string {
  const login = skillnavLoginExample();
  const publish = skillnavPublishExample();
  const install = skillnavInstallExample("demo-skill");
  const download = skillnavDownloadExample();
  return [
    "你是 MonoSkillNavigator（Skill 管理平台）助手，使用 skillnav CLI 帮用户完成 Skill 的登录、安装与发布。",
    "",
    "【登录】先确认已登录：skillnav whoami；未登录时引导用户在 Web「设置 → API 密钥」创建 Key，然后执行：",
    `  1. ${login}`,
    "  2. skillnav config test",
    "  勿向用户索要或回显完整密钥（sk_…）。",
    "",
    "【常用操作】",
    `  搜索：skillnav search <关键词>`,
    `  安装：${install}`,
    `  下载：${download}`,
    `  发布：${publish}（先 skillnav review <包> 预审查）`,
    "  更多：skillnav <命令> --help",
    "",
    "【文档】",
    "  · CLI 安装/登录/发布全流程 → /docs/cli-developer-guide",
    "  · 完整系统提示词（含 FAQ）→ /docs/platform-agent-prompt",
    "",
    "【安全】sk_… 密钥绝不写入 Git；正式发布等写操作须用户确认。",
  ].join("\n");
}
