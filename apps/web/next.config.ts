import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const webDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(webDir, "../..");

// Same dotenv resolution as packages/storage/src/env.ts (DOTENV_FILE > .env >
// .env.rapid, plus the legacy webDir/.env) — otherwise Rapid-style deployments
// that only ship .env.rapid get no build-time env at all.
const dotenvOverride = process.env.DOTENV_FILE?.trim();
const dotenvCandidates = dotenvOverride
  ? [path.resolve(repoRoot, dotenvOverride), dotenvOverride, path.join(webDir, ".env")]
  : [
      path.join(repoRoot, ".env"),
      path.join(repoRoot, ".env.rapid"),
      path.join(webDir, ".env"),
    ];

for (const envFile of dotenvCandidates) {
  try {
    loadEnvFile(envFile);
  } catch {
    // Missing env file is fine.
  }
}

// .env is a required bootstrap file (see .env.example). Fail fast — running
// without it silently falls back to development defaults, which produce
// broken install guides on deployed instances.
const hasDotenv = dotenvCandidates.some(existsSync);
if (!hasDotenv) {
  console.error("❌ Missing .env — copy .env.example to .env and configure it before running the web app.");
  console.error("   See .env.example for the full list of deployment variables.");
  process.exit(1);
}

const configuredWebUrl =
  process.env.NEXT_PUBLIC_WEB_URL?.trim() ||
  process.env.WEB_PUBLIC_URL?.trim() ||
  "";

const configuredBrandName =
  process.env.BRAND_NAME?.trim() ||
  process.env.NEXT_PUBLIC_BRAND_NAME?.trim() ||
  "SkillNavigator";

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_WEB_URL: configuredWebUrl,
    NEXT_PUBLIC_REGISTRY_INSTALL_GUIDE_URL:
      process.env.NEXT_PUBLIC_REGISTRY_INSTALL_GUIDE_URL?.trim() || "",
    NEXT_PUBLIC_REGISTRY_API_URL: process.env.NEXT_PUBLIC_REGISTRY_API_URL?.trim() || "",
    NEXT_PUBLIC_PIP_INDEX_URL: process.env.NEXT_PUBLIC_PIP_INDEX_URL?.trim() || "",
    NEXT_PUBLIC_BRAND_NAME: configuredBrandName,
  },
  basePath: process.env.NEXT_PUBLIC_BASE_PATH ?? "",
  reactStrictMode: true,
  transpilePackages: ["@skill-platform/skill-spec"],
  allowedDevOrigins: ["127.0.0.1"],
  async redirects() {
    return [
      { source: "/reviews", destination: "/inspections", permanent: true },
      { source: "/docs/halucatch-review", destination: "/docs/halucatch-inspection", permanent: true },
    ];
  },
};

export default nextConfig;
