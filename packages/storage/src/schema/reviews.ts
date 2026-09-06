import { pgTable, text, integer, timestamp, uniqueIndex, real } from "drizzle-orm/pg-core";

export const skillReviews = pgTable("skill_reviews", {
  skillSlug: text("skill_slug").notNull(),
  version: text("version").notNull(),
  reviewId: text("review_id").notNull(),
  reportVersion: text("report_version").notNull(),
  contentHash: text("content_hash").notNull(),
  verdict: text("verdict").notNull(),
  qualityScore: integer("quality_score").notNull(),
  securityScore: integer("security_score").notNull(),
  reliabilityScore: integer("reliability_score").notNull(),
  skillspectorProvider: text("skillspector_provider"),
  skillspectorRiskScore: integer("skillspector_risk_score"),
  skillspectorRiskSeverity: text("skillspector_risk_severity"),
  skillspectorRecommendation: text("skillspector_recommendation"),
  skillspectorScanMode: text("skillspector_scan_mode"),
  virustotalProvider: text("virustotal_provider"),
  virustotalSha256: text("virustotal_sha256"),
  virustotalStatus: text("virustotal_status"),
  virustotalMalicious: integer("virustotal_malicious"),
  virustotalSuspicious: integer("virustotal_suspicious"),
  virustotalHarmless: integer("virustotal_harmless"),
  virustotalUndetected: integer("virustotal_undetected"),
  virustotalTotalEngines: integer("virustotal_total_engines"),
  virustotalAnalysisUrl: text("virustotal_analysis_url"),
  virustotalError: text("virustotal_error"),
  virustotalThreatVerdict: text("virustotal_threat_verdict"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
}, (table) => [
  uniqueIndex("skill_reviews_pkey").on(table.skillSlug, table.version),
]);

export const skillReviewFindings = pgTable("skill_review_findings", {
  skillSlug: text("skill_slug").notNull(),
  version: text("version").notNull(),
  position: integer("position").notNull(),
  findingId: text("finding_id").notNull(),
  category: text("category").notNull(),
  severity: text("severity").notNull(),
  title: text("title").notNull(),
  message: text("message").notNull(),
  path: text("path"),
  evidence: text("evidence"),
  recommendation: text("recommendation").notNull(),
  confidence: real("confidence"),
}, (table) => [
  uniqueIndex("skill_review_findings_pkey").on(table.skillSlug, table.version, table.position),
]);
