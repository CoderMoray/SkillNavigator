import { AlertTriangle, CircleAlert, Lightbulb } from "lucide-react";
import { formatNumber } from "../lib/format";
import { parseHaluCatchSummaryCounts } from "../lib/halucatch-report";

const summaryCards = [
  {
    key: "critical" as const,
    label: "严重",
    Icon: CircleAlert,
    toneClass: "halucatch-summary-card-critical"
  },
  {
    key: "warning" as const,
    label: "注意",
    Icon: AlertTriangle,
    toneClass: "halucatch-summary-card-warning"
  },
  {
    key: "optimizable" as const,
    label: "可优化",
    Icon: Lightbulb,
    toneClass: "halucatch-summary-card-optimizable"
  }
];

export function HaluCatchReportSummary({ summaryMarkdown }: { summaryMarkdown: string }) {
  const counts = parseHaluCatchSummaryCounts(summaryMarkdown);

  return (
    <div className="halucatch-summary-grid" role="list" aria-label="HaluCatch 报告摘要">
      {summaryCards.map(({ key, label, Icon, toneClass }) => (
        <div className={`halucatch-summary-card ${toneClass}`} key={key} role="listitem">
          <Icon aria-hidden className="halucatch-summary-card-icon" size={20} strokeWidth={2.25} />
          <strong className="halucatch-summary-card-value">
            {formatNumber(counts[key])}个{label}
          </strong>
        </div>
      ))}
    </div>
  );
}
