import type { InspectionFinding } from "../lib/types";

export type FindingSource = "SkillSpector" | "VirusTotal" | "平台规则";

/**
 * Attribute a finding to the scanner that produced it. The security list on
 * the skill detail page mixes three sources (scanner findings by id prefix +
 * platform built-in rules by category); without the badge they are
 * indistinguishable to users.
 */
export function findingSourceLabel(finding: Pick<InspectionFinding, "id" | "category">): FindingSource {
  if (finding.id.startsWith("skillspector-")) {
    return "SkillSpector";
  }
  if (finding.id.startsWith("virustotal-")) {
    return "VirusTotal";
  }
  return "平台规则";
}

export function FindingSourceBadge({ finding }: { finding: Pick<InspectionFinding, "id" | "category"> }) {
  return <span className="badge">{findingSourceLabel(finding)}</span>;
}
