export type InspectionVerdict = "published" | "needs-inspection" | "rejected";

export interface InspectionFinding {
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
const INSPECTION_HALUCATCH_UNAVAILABLE_FINDING_ID = "inspection-halucatch-unavailable";
const MEDIUM_CONFIDENCE_REJECT_PERCENT = 90;

export function isSkillSpectorInspectionFinding(finding: InspectionFinding): boolean {
  return (
    finding.id.startsWith(SKILLSPECTOR_FINDING_PREFIX) &&
    finding.id !== SKILLSPECTOR_UNAVAILABLE_FINDING_ID
  );
}

export function isVirusTotalInspectionFinding(finding: InspectionFinding): boolean {
  return finding.id.startsWith(VIRUSTOTAL_FINDING_PREFIX);
}

export function shouldRejectSkillSpectorFinding(finding: InspectionFinding): boolean {
  if (finding.id === SKILLSPECTOR_UNAVAILABLE_FINDING_ID) {
    return finding.severity === "critical" || finding.severity === "high";
  }

  if (!isSkillSpectorInspectionFinding(finding)) {
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

export function shouldRejectVirusTotalFinding(finding: InspectionFinding): boolean {
  return isVirusTotalInspectionFinding(finding) && (finding.severity === "critical" || finding.severity === "high");
}

export function shouldRejectInspectionInfrastructureFinding(finding: InspectionFinding): boolean {
  return (
    finding.id === INSPECTION_HALUCATCH_UNAVAILABLE_FINDING_ID &&
    (finding.severity === "critical" || finding.severity === "high")
  );
}

export function calculateInspectionVerdict(findings: InspectionFinding[]): InspectionVerdict {
  if (
    findings.some(shouldRejectSkillSpectorFinding) ||
    findings.some(shouldRejectVirusTotalFinding) ||
    findings.some(shouldRejectInspectionInfrastructureFinding)
  ) {
    return "rejected";
  }

  if (findings.length > 0) {
    return "needs-inspection";
  }

  return "published";
}
