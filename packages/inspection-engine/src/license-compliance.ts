import type { SkillManifest } from "@skill-platform/skill-spec";
import type { InspectionFinding } from "./index.js";

const MIT_LICENSE_PATTERN = /^MIT(-0)?$/i;

/** When true, missing/non-MIT-0 license fields produce review findings. Default: off for this platform. */
export function isSkillLicenseValidationEnabled(): boolean {
  return process.env.SKILL_LICENSE_VALIDATION_ENABLED === "true";
}

/** License compliance findings (MIT-0 policy). Call only when {@link isSkillLicenseValidationEnabled} is true. */
export function collectSkillLicenseFindings(manifest: SkillManifest): InspectionFinding[] {
  const findings: InspectionFinding[] = [];
  const license = manifest.license?.trim();

  if (license && !MIT_LICENSE_PATTERN.test(license)) {
    findings.push({
      id: "license-not-mit0",
      category: "compliance",
      severity: "low",
      title: "Non-default license declared",
      message: `ClawHub publishes all skills under MIT-0. This manifest declares ${manifest.license}.`,
      recommendation: "Remove conflicting license terms from SKILL.md or align with MIT-0 redistribution terms."
    });
  } else if (!license) {
    findings.push({
      id: "license-missing",
      category: "compliance",
      severity: "low",
      title: "License is missing",
      message: "ClawHub skills are published under MIT-0.",
      recommendation: "Add license: MIT-0 to frontmatter for clarity."
    });
  }

  return findings;
}
