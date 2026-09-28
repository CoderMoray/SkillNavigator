import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { loadEnvFile } from "node:process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = path.join(repoRoot, "usage");
const target = path.join(repoRoot, "apps", "web", "public", "usage");
const publicDir = path.join(repoRoot, "apps", "web", "public");
const installScriptSource = path.join(source, "install.sh");
const DEFAULT_BRAND_NAME = "SkillNavigator";
/** Dev-only fallback for {{web_url}}; same value as registry-install-guide.ts. */
const DEV_WEB_ORIGIN = "http://127.0.0.1:3001";
const BRAND_PLACEHOLDER = "{{brand_name}}";
const BRAND_SLUG_PLACEHOLDER = "{{brand_slug}}";
const REGISTRY_API_URL_PLACEHOLDER = "{{registry_api_url}}";
const WEB_URL_PLACEHOLDER = "{{web_url}}";

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

/**
 * Public file name of the install script. Extension-less by default (cloud
 * WAFs block `.sh` paths); NEXT_PUBLIC_CLI_INSTALL_PATH renames it
 * consistently for the web app and for this synced artifact.
 */
function cliInstallPublicFilename() {
  const configured = process.env.NEXT_PUBLIC_CLI_INSTALL_PATH?.trim() || "/install";
  const name = path.basename(configured.replace(/\/+$/, ""));
  return name || "install";
}

const installScriptTarget = path.join(publicDir, cliInstallPublicFilename());

// The generated artifacts (apps/web/public/install, public/usage/*) are served
// statically and are git-ignored: they bake deployment URLs in at build time, so
// they are per-machine snapshots rather than repo content. `--strict` (used by
// the web app's `prebuild`) refuses to render the "ask the maintainer" notices,
// because a missing URL there means the deploy build is misconfigured.
const strict = process.argv.includes("--strict");
const allowUnconfigured = process.argv.includes("--allow-unconfigured");

const UNSET_REGISTRY_NOTICE = "（部署方未配置 Registry API 地址——请向平台维护者索取）";
const UNSET_WEB_NOTICE = "（部署方未配置对外 Web 地址——请向平台维护者索取）";

/**
 * Slug form of the brand name — used as the example CLI profile name. Same rule
 * as the agent guide in usage/skillnavigator.md: lowercase, camel-case word
 * boundaries and every other non-alphanumeric run collapsed into `-`.
 * BRAND_SLUG / NEXT_PUBLIC_BRAND_SLUG pins the value for a deployment whose
 * brand name does not slugify to the name it wants (e.g. "mono").
 */
function resolveBrandSlug(brandName) {
  const explicit = process.env.BRAND_SLUG?.trim() || process.env.NEXT_PUBLIC_BRAND_SLUG?.trim();
  if (explicit) {
    return explicit;
  }
  return brandName
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1-$2")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
}

function deploymentConfig() {
  const explicitRegistryApiUrl = process.env.NEXT_PUBLIC_REGISTRY_API_URL?.trim();
  const explicitWebUrl =
    process.env.NEXT_PUBLIC_WEB_URL?.trim() || process.env.WEB_PUBLIC_URL?.trim();

  if (strict && !allowUnconfigured) {
    const missing = [];
    if (!explicitRegistryApiUrl) {
      missing.push("NEXT_PUBLIC_REGISTRY_API_URL");
    }
    if (!explicitWebUrl) {
      missing.push("NEXT_PUBLIC_WEB_URL (or WEB_PUBLIC_URL)");
    }
    if (missing.length > 0) {
      console.error(
        `sync-usage-public: refusing to render placeholder notices — missing ${missing.join(", ")}.`
      );
      console.error(
        "Set them in your dotenv file (.env / .env.rapid), or re-run with --allow-unconfigured " +
          "to render the notices instead."
      );
      process.exit(1);
    }
  }

  // Dev fallbacks, applied *after* the strict check above reads the explicit
  // variables: on a dev machine these are the local API/web ports, while a
  // release build has to spell both out — the user-facing registry address is
  // often a different, externally reachable one than the browser's.
  const registryApiUrl = explicitRegistryApiUrl || process.env.NEXT_PUBLIC_API_URL?.trim();
  const webUrl = explicitWebUrl || DEV_WEB_ORIGIN;

  const brandName = process.env.BRAND_NAME?.trim() || DEFAULT_BRAND_NAME;
  return {
    brandName,
    brandSlug: resolveBrandSlug(brandName),
    registryApiUrl: registryApiUrl || UNSET_REGISTRY_NOTICE,
    webUrl: webUrl || UNSET_WEB_NOTICE,
  };
}

function applyDeploymentConfig(content, config) {
  return content
    .replaceAll(REGISTRY_API_URL_PLACEHOLDER, config.registryApiUrl)
    .replaceAll(WEB_URL_PLACEHOLDER, config.webUrl)
    .replaceAll(BRAND_SLUG_PLACEHOLDER, config.brandSlug)
    .replaceAll(BRAND_PLACEHOLDER, config.brandName);
}

if (!existsSync(source)) {
  process.exit(0);
}

mkdirSync(target, { recursive: true });
cpSync(source, target, { recursive: true });

const config = deploymentConfig();

// The platform agent prompt is authored with the docs (it is a page too) but must
// also be fetchable as raw markdown under /usage/: an agent cannot use the
// rendered HTML page, and the copy button only helps a human.
const agentPromptSource = path.join(
  repoRoot,
  "apps",
  "web",
  "content",
  "docs",
  "platform-agent-prompt.md"
);
if (existsSync(agentPromptSource)) {
  writeFileSync(
    path.join(target, "platform-agent-prompt.md"),
    applyDeploymentConfig(readFileSync(agentPromptSource, "utf8"), config),
    "utf8"
  );
}
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

// The install script lives at the web app root (/install by default), not under /usage/.
if (existsSync(installScriptSource)) {
  const installContent = readFileSync(installScriptSource, "utf8");
  writeFileSync(installScriptTarget, applyDeploymentConfig(installContent, config), "utf8");
}
const strayInstallInUsage = path.join(target, "install.sh");
if (existsSync(strayInstallInUsage)) {
  rmSync(strayInstallInUsage);
}

// Retire public copies that must not be served any more: the old `.sh` path
// (blocked by cloud WAFs) and the default name when an override renames it.
for (const staleName of ["install", "install.sh"]) {
  const stalePath = path.join(publicDir, staleName);
  if (stalePath !== installScriptTarget && existsSync(stalePath)) {
    rmSync(stalePath);
  }
}

// The detail page's "copy prompt" text has to be editable by non-developers, so
// it lives as a markdown template (content/prompts/) and is compiled here into
// a TS constant — the page is a client component and cannot read files at
// runtime. Deployment-level placeholders are resolved now; `{{skill_slug}}`
// stays behind for buildSkillInstallPrompt() to fill in per skill.
const skillInstallPromptSource = path.join(
  repoRoot,
  "apps",
  "web",
  "content",
  "prompts",
  "skill-install-prompt.md"
);
const generatedLibDir = path.join(repoRoot, "apps", "web", "lib", "generated");
const skillInstallPromptTarget = path.join(generatedLibDir, "skill-install-prompt.ts");
if (existsSync(skillInstallPromptSource)) {
  const template = applyDeploymentConfig(
    readFileSync(skillInstallPromptSource, "utf8"),
    config
  )
    // Normalize line endings and drop the trailing newline editors add, so the
    // copied prompt never ends with a stray blank line.
    .replace(/\r\n/g, "\n")
    .replace(/\n+$/, "");
  mkdirSync(generatedLibDir, { recursive: true });
  writeFileSync(
    skillInstallPromptTarget,
    [
      "// AUTO-GENERATED by scripts/sync-usage-public.mjs — do not edit, do not commit.",
      "// Source: apps/web/content/prompts/skill-install-prompt.md",
      "// Deployment placeholders are applied already; {{skill_slug}} is filled in per skill.",
      `export const SKILL_INSTALL_PROMPT_TEMPLATE = ${JSON.stringify(template)};`,
      "",
    ].join("\n"),
    "utf8"
  );
}
