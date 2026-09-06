import { defineConfig } from "vitest/config";
import { transform as transformWithEsbuild } from "esbuild";

// vitest 4 / rolldown 对 .tsx 的 JSX 自动转换不可靠：显式用 esbuild 把 JSX
// 编译为 automatic runtime（React 19 无需显式 import React）。
const tsxJsxAutomatic = {
  name: "vitest-tsx-jsx-automatic",
  enforce: "pre" as const,
  async transform(code: string, id: string) {
    if (!id.endsWith(".tsx") || id.includes("node_modules")) {
      return null;
    }
    const result = await transformWithEsbuild(code, {
      loader: "tsx",
      jsx: "automatic",
      sourcemap: true,
      tsconfigRaw: { compilerOptions: { jsx: "react-jsx" } }
    });
    return { code: result.code, map: (result.map as { toString?: () => string } | null) ?? null };
  }
};

export default defineConfig({
  plugins: [tsxJsxAutomatic],
  test: {
    globals: true,
    testTimeout: 15_000,
    setupFiles: ["./tests/setup.ts"]
  }
});
