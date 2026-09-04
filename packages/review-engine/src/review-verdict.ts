export type ReviewVerdict = "published" | "needs-review" | "rejected";

export interface ReviewFinding {
  id: string;
  category: string;
  severity: "low" | "medium" | "high" | "critical";
  title: string;
  message: string;
  path?: string;
  evidence?: string;
  recommendation: string;
  confidence?: number;
}

const SKILLSPECTOR_FINDING_PREFIX = "skillspector-";
const VIRUSTOTAL_FINDING_PREFIX = "virustotal-";
const SKILLSPECTOR_UNAVAILABLE_FINDING_ID = "skillspector-unavailable";
const REVIEW_HALUCATCH_UNAVAILABLE_FINDING_ID = "review-halucatch-unavailable";
const MEDIUM_CONFIDENCE_REJECT_PERCENT = 90;

export function isSkillSpectorReviewFinding(finding: ReviewFinding): boolean {
  return (
    finding.id.startsWith(SKILLSPECTOR_FINDING_PREFIX) &&
    finding.id !== SKILLSPECTOR_UNAVAILABLE_FINDING_ID
  );
}

export function isVirusTotalReviewFinding(finding: ReviewFinding): boolean {
  return finding.id.startsWith(VIRUSTOTAL_FINDING_PREFIX);
}

export function shouldRejectSkillSpectorFinding(finding: ReviewFinding): boolean {
  if (finding.id === SKILLSPECTOR_UNAVAILABLE_FINDING_ID) {
    return finding.severity === "critical" || finding.severity === "high";
  }

  if (!isSkillSpectorReviewFinding(finding)) {
    return false;
  }

  if (finding.severity === "critical" || finding.severity === "high") {
    return true;
  }

  if (finding.severity === "medium" && finding.confidence !== undefined) {
    const confidencePercent = finding.confidence <= 1 ? finding.confidence * 100 : finding.confidence;
    return confidencePercent >= MEDIUM_CONFIDENCE_REJECT_PERCENT;
  }

  return false;
}

export function shouldRejectVirusTotalFinding(finding: ReviewFinding): boolean {
  return isVirusTotalReviewFinding(finding) && (finding.severity === "critical" || finding.severity === "high");
}

export function shouldRejectReviewInfrastructureFinding(finding: ReviewFinding): boolean {
  return (
    finding.id === REVIEW_HALUCATCH_UNAVAILABLE_FINDING_ID &&
    (finding.severity === "critical" || finding.severity === "high")
  );
}

export function calculateReviewVerdict(findings: ReviewFinding[]): ReviewVerdict {
  if (
    findings.some(shouldRejectSkillSpectorFinding) ||
    findings.some(shouldRejectVirusTotalFinding) ||
    findings.some(shouldRejectReviewInfrastructureFinding)
  ) {
    return "rejected";
  }

  if (findings.length > 0) {
    return "needs-review";
  }

  return "published";
}
