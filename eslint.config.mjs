import { defineConfig, globalIgnores } from "eslint/config";
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import globals from "globals";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// Next preset 条目默认覆盖全仓，这里收窄到 apps/web（monorepo 中 api/cli/packages 非 React）。
const webFiles = ["apps/web/**/*.{ts,tsx}"];
const scopeToWeb = (preset) =>
  preset.map((entry) => ({ ...entry, files: webFiles }));

export default defineConfig([
  globalIgnores([
    "**/node_modules/**",
    "**/.next/**",
    "**/out/**",
    "**/dist/**",
    "**/coverage/**",
    "**/test-results/**",
    "**/playwright-report/**",
    "**/__pycache__/**",
    "apps/web/public/**",
    "**/*.py"
  ]),

  // 纯 JS（scripts / 根配置文件）
  {
    files: ["**/*.{js,mjs,cjs}"],
    ...js.configs.recommended,
    languageOptions: { globals: globals.node }
  },

  // TypeScript 全仓推荐规则
  ...tseslint.configs.recommended,

  // Node 端（API / CLI / 包 / 脚本 / 测试 / e2e / 根配置）
  {
    files: [
      "apps/api/**/*.ts",
      "apps/cli/**/*.ts",
      "packages/**/*.ts",
      "scripts/**/*.{ts,mjs,js}",
      "tests/**/*.ts",
      "e2e/**/*.ts",
      "*.{ts,mjs,js}"
    ],
    languageOptions: { globals: globals.node }
  },

  // vitest 全局（globals: true）
  {
    files: ["tests/**/*.ts"],
    languageOptions: { globals: { ...globals.node, ...globals.vitest } }
  },

  // Web：浏览器 + Node（Next 服务端组件/路由处理器用到 process 等）
  {
    files: webFiles,
    languageOptions: { globals: { ...globals.browser, ...globals.node } }
  },

  // Next 官方规则（仅 apps/web）
  ...scopeToWeb(nextVitals),
  ...scopeToWeb(nextTs),

  // 项目惯例：`_` 前缀表示"有意未用"（占位/解构/预留），允许保留。
  // （no-explicit-any / react-hooks/set-state-in-effect 的债务已清理，
  //  恢复各 preset 的默认严格级别；lint 链另以 --max-warnings=0 阻断一切新告警。）
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_"
        }
      ]
    }
  }
]);
