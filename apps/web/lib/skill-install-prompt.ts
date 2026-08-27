import {
  skillnavInstallWithRegistryExample,
  skillnavLoginExample,
} from "./cli-examples";
import type { RegistrySkill } from "./types";

const REGISTRY_API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:3000";

export function buildSkillInstallPrompt(input: {
  skill: RegistrySkill;
  version: string;
  pageUrl: string;
  registryUrl?: string;
}): string {
  const { skill, version, pageUrl } = input;
  const registryUrl = input.registryUrl ?? REGISTRY_API_URL;
  const installCommand = skillnavInstallWithRegistryExample(skill.slug, version, registryUrl);
  const author = skill.versions[version]?.manifest.author ?? "未声明";

  return [
    "请帮我从 Skill 管理平台安装以下 Agent Skill。",
    "",
    "Skill 信息：",
    `- 名称：${skill.name}`,
    `- Slug：${skill.slug}`,
    `- 版本：v${version}`,
    `- 作者：${author}`,
    `- 详情页：${pageUrl}`,
    `- Registry API：${registryUrl}`,
    "",
    "安装步骤：",
    "1. 安装 skillnav CLI（pipx install skillnav 或 pip install skillnav）",
    `2. ${skillnavLoginExample("<从 Web 账户创建的 API Key>")}`,
    `3. ${installCommand}`,
    "",
    "约束：",
    "- 仅安装上述 Skill，不要修改无关项目文件。",
    "- 若涉及第三方依赖或 CLI，请先说明来源并征求我确认后再安装。",
    "- 若命令失败，请根据错误信息排查并向我说明，不要编造安装结果。"
  ].join("\n");
}
