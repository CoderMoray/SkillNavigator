import { describe, expect, it } from "vitest";
import { extractHaluCatchSummary, parseHaluCatchSummaryCounts } from "./halucatch-report";

describe("parseHaluCatchSummaryCounts", () => {
  it("parses combined risk and optimizable counts", () => {
    expect(parseHaluCatchSummaryCounts("🔴 1 严重 · ⚠️ 8 注意 · 💡 2 可优化")).toEqual({
      critical: 1,
      warning: 8,
      optimizable: 2
    });
  });

  it("parses optimizable-only summary", () => {
    expect(parseHaluCatchSummaryCounts("✅ 核心检查通过，💡 3 项可优化")).toEqual({
      critical: 0,
      warning: 0,
      optimizable: 3
    });
  });

  it("returns zeros for clean pass summary", () => {
    expect(parseHaluCatchSummaryCounts("✅ 全部检查通过，未发现风险")).toEqual({
      critical: 0,
      warning: 0,
      optimizable: 0
    });
  });
});

describe("extractHaluCatchSummary", () => {
  it("reads TL;DR from simple report heading", () => {
    const markdown = `# Title

### 一句话总结
🔴 2 严重 · ⚠️ 1 注意

## 审查结果
`;
    expect(extractHaluCatchSummary(markdown)).toBe("🔴 2 严重 · ⚠️ 1 注意");
  });
});
