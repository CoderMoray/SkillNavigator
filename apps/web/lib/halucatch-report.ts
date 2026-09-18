import { saveBlobAsFile } from "./api";

export function buildHaluCatchReportPath(skillSlug: string, version: string): string {
  const params = new URLSearchParams({ version });
  return `/skills/${encodeURIComponent(skillSlug)}/halucatch?${params.toString()}`;
}

export type HaluCatchSummaryCounts = {
  critical: number;
  warning: number;
  optimizable: number;
};

function parseSummaryCount(text: string, pattern: RegExp): number {
  const match = text.match(pattern);
  if (!match?.[1]) {
    return 0;
  }
  const value = Number.parseInt(match[1], 10);
  return Number.isFinite(value) ? value : 0;
}

/** Parse TL;DR markdown like "🔴 1 严重 · ⚠️ 8 注意 · 💡 2 可优化". */
export function parseHaluCatchSummaryCounts(summaryMarkdown: string): HaluCatchSummaryCounts {
  const text = summaryMarkdown.replace(/\s+/g, " ").trim();
  return {
    critical: parseSummaryCount(text, /(\d+)\s*严重/),
    warning: parseSummaryCount(text, /(\d+)\s*注意/),
    optimizable: parseSummaryCount(text, /(\d+)\s*(?:项)?可优化/)
  };
}

export function extractHaluCatchSummary(markdown: string): string {
  const normalized = markdown.replace(/\r\n/g, "\n");
  const tldrMatch = normalized.match(
    /###\s*(?:一句话总结|TL;DR|TLDR)[^\n]*\n+([\s\S]*?)(?:\n##|\n###|$)/i
  );
  if (tldrMatch?.[1]?.trim()) {
    return tldrMatch[1].trim();
  }

  const lines = normalized.split("\n").filter((line) => line.trim());
  return lines.slice(0, 6).join("\n").trim();
}

export function buildHaluCatchActionReportFileName(skillSlug: string, version: string): string {
  const safeSlug = skillSlug.replace(/[^a-z0-9-]+/gi, "-").replace(/^-+|-+$/g, "") || "skill";
  const safeVersion = version.replace(/[^a-z0-9._-]+/gi, "-") || "0.0.0";
  return `${safeSlug}-v${safeVersion}-halucatch-action.md`;
}

export function downloadHaluCatchActionReport(markdown: string, fileName: string): void {
  const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
  saveBlobAsFile(blob, fileName);
}
