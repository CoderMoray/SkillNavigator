import { loadEnvFile } from "node:process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const webDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(webDir, "../..");

for (const envFile of [path.join(repoRoot, ".env"), path.join(webDir, ".env")]) {
  try {
    loadEnvFile(envFile);
  } catch {
    // Missing env file is fine.
  }
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
    NEXT_PUBLIC_BRAND_NAME: configuredBrandName,
  },
  basePath: process.env.NEXT_PUBLIC_BASE_PATH ?? "",
  reactStrictMode: true,
  transpilePackages: ["@skill-platform/skill-spec"],
  allowedDevOrigins: ["127.0.0.1"]
};

export default nextConfig;
