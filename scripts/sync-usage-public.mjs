import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = path.join(repoRoot, "usage");
const target = path.join(repoRoot, "apps", "web", "public", "usage");
const DEFAULT_BRAND_NAME = "SkillNavigator";
const BRAND_PLACEHOLDER = "{{brand_name}}";

function loadBrandName() {
  const envPath = path.join(repoRoot, ".env");
  if (!existsSync(envPath)) {
    return DEFAULT_BRAND_NAME;
  }
  const match = readFileSync(envPath, "utf8").match(/^BRAND_NAME=(.+)$/m);
  const value = match?.[1]?.trim();
  return value || DEFAULT_BRAND_NAME;
}

function applyBrandName(content, brandName) {
  return content.replaceAll(BRAND_PLACEHOLDER, brandName);
}

if (!existsSync(source)) {
  process.exit(0);
}

mkdirSync(target, { recursive: true });
cpSync(source, target, { recursive: true });

const brandName = loadBrandName();
for (const filename of ["monoskillnavigator.md"]) {
  const filePath = path.join(target, filename);
  if (!existsSync(filePath)) {
    continue;
  }
  const content = readFileSync(filePath, "utf8");
  writeFileSync(filePath, applyBrandName(content, brandName), "utf8");
}
