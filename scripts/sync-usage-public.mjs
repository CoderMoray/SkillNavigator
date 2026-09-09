import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { loadEnvFile } from "node:process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = path.join(repoRoot, "usage");
const target = path.join(repoRoot, "apps", "web", "public", "usage");
const DEFAULT_BRAND_NAME = "SkillNavigator";
const DEFAULT_PIP_INDEX_URL = "https://pypi.org/simple";
const BRAND_PLACEHOLDER = "{{brand_name}}";
const REGISTRY_API_URL_PLACEHOLDER = "{{registry_api_url}}";
const WEB_URL_PLACEHOLDER = "{{web_url}}";
const PIP_INDEX_URL_PLACEHOLDER = "{{pip_index_url}}";

// Same dotenv resolution as packages/storage/src/env.ts (DOTENV_FILE > .env >
// .env.rapid); values already in the process env win (loadEnvFile semantics).
const dotenvOverride = process.env.DOTENV_FILE?.trim();
const dotenvFile = dotenvOverride
  ? path.resolve(repoRoot, dotenvOverride)
  : existsSync(path.join(repoRoot, ".env"))
    ? path.join(repoRoot, ".env")
    : path.join(repoRoot, ".env.rapid");
try {
  loadEnvFile(dotenvFile);
} catch {
  // Missing dotenv file is fine — placeholders render as explicit notices.
}

// Deployment configuration placeholders render as explicit "ask the maintainer"
// notices when unset (Option B): .env is a required bootstrap file, so a
// properly configured instance always injects real values here.
function deploymentConfig() {
  return {
    brandName: process.env.BRAND_NAME?.trim() || DEFAULT_BRAND_NAME,
    registryApiUrl:
      process.env.NEXT_PUBLIC_REGISTRY_API_URL?.trim() ||
      "（部署方未配置 Registry API 地址——请向平台维护者索取）",
    webUrl:
      process.env.NEXT_PUBLIC_WEB_URL?.trim() ||
      process.env.WEB_PUBLIC_URL?.trim() ||
      "（部署方未配置对外 Web 地址——请向平台维护者索取）",
    pipIndexUrl: process.env.NEXT_PUBLIC_PIP_INDEX_URL?.trim() || DEFAULT_PIP_INDEX_URL,
  };
}

function applyDeploymentConfig(content, config) {
  return content
    .replaceAll(REGISTRY_API_URL_PLACEHOLDER, config.registryApiUrl)
    .replaceAll(WEB_URL_PLACEHOLDER, config.webUrl)
    .replaceAll(PIP_INDEX_URL_PLACEHOLDER, config.pipIndexUrl)
    .replaceAll(BRAND_PLACEHOLDER, config.brandName);
}

if (!existsSync(source)) {
  process.exit(0);
}

mkdirSync(target, { recursive: true });
cpSync(source, target, { recursive: true });

const config = deploymentConfig();
for (const filename of ["skillnavigator.md"]) {
  const filePath = path.join(target, filename);
  if (!existsSync(filePath)) {
    continue;
  }
  const content = readFileSync(filePath, "utf8");
  writeFileSync(filePath, applyDeploymentConfig(content, config), "utf8");
}

const legacyGuide = path.join(target, "monoskillnavigator.md");
if (existsSync(legacyGuide)) {
  rmSync(legacyGuide);
}
