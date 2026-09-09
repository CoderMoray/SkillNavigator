export type InspectionVerdict = "published" | "needs-inspection" | "rejected";
export type SkillInspectionStatus = "inspecting" | "completed" | "interrupted" | "rejected";
export type SkillInspectionStage = "skillspector" | "virustotal" | "halucatch";

export interface SkillInspectionFailureInfo {
  stages: SkillInspectionStage[];
  message: string;
}
export type InspectionSeverity = "low" | "medium" | "high" | "critical";
export type InspectionCategory =
  | "compliance"
  | "quality"
  | "leakage"
  | "privacy"
  | "security"
  | "reliability";
export type EvaluationStatus = "passed" | "partial" | "failed" | "not-configured";

export interface InspectionScores {
  qualityScore: number;
  securityScore: number;
  reliabilityScore: number;
}

export interface InspectionFinding {
  id: string;
  category: InspectionCategory;
  severity: InspectionSeverity;
  title: string;
  message: string;
  path?: string;
  evidence?: string;
  recommendation: string;
  confidence?: number;
}

export interface InspectionReport {
  id: string;
  skillSlug: string;
  skillName: string;
  version: string;
  contentHash: string;
  verdict: InspectionVerdict;
  scores: InspectionScores;
  findings: InspectionFinding[];
  skillSpector?: SkillSpectorScanSummary;
  virusTotal?: VirusTotalScanSummary;
  createdAt: string;
}

export interface SkillSpectorScanSummary {
  provider: "skillspector-static";
  riskScore: number;
  riskSeverity: string;
  recommendation: string;
  scanMode: "static-only";
}

export interface VirusTotalEngineResult {
  engine: string;
  category: string;
  result: string;
  method?: string;
  engineUpdate?: string;
}

export type VirusTotalThreatVerdict =
  | "VERDICT_UNKNOWN"
  | "VERDICT_UNDETECTED"
  | "VERDICT_SUSPICIOUS"
  | "VERDICT_MALICIOUS";

export interface VirusTotalScanSummary {
  provider: "virustotal";
  sha256: string;
  status: "completed" | "not_found" | "failed";
  malicious: number;
  suspicious: number;
  harmless: number;
  undetected: number;
  totalEngines: number;
  analysisUrl?: string;
  error?: string;
  threatVerdict?: VirusTotalThreatVerdict;
  engineResults?: VirusTotalEngineResult[];
}

export interface FunctionalEvaluationFinding {
  id: string;
  task?: string;
  severity: "low" | "medium" | "high";
  message: string;
  recommendation: string;
}

export interface FunctionalEvaluationTaskResult {
  name: string;
  score: number;
  findings: FunctionalEvaluationFinding[];
}

export interface HaluCatchReportBundle {
  skillType: string;
  weightProfile?: "code-engineered" | "methodology";
  dimensionWeights?: Record<
    "foundation" | "code" | "rules" | "guardrails" | "complexity",
    number
  >;
  language: "zh-CN" | "en";
  professional: string;
  simple: string;
  action: string;
}

export interface FunctionalEvaluationReport {
  id: string;
  provider: "static-taskset" | "halucatch-adapter";
  status: EvaluationStatus;
  score: number;
  tasksTotal: number;
  tasksPassed: number;
  taskResults: FunctionalEvaluationTaskResult[];
  findings: FunctionalEvaluationFinding[];
  haluCatchReport?: HaluCatchReportBundle;
  createdAt: string;
}

export interface SkillManifest {
  slug: string;
  name: string;
  description: string;
  version?: string;
  categories?: string[];
  topics?: string[];
  "release-tags"?: string[];
  author?: string;
  license?: string;
  tags?: string[];
  supportedAgents?: string[];
  "allowed-tools"?: string[] | string;
  "disallowed-tools"?: string[] | string;
}

export interface SkillFile {
  path: string;
  content: string;
  size: number;
  sha256: string;
}

export interface SkillSnapshot {
  readme: string;
  files: SkillFile[];
  contentHash: string;
  createdAt: string;
}

export interface RegistryContributor {
  id: string;
  userId?: string;
  username?: string;
  name: string;
  role: "owner" | "contributor";
  addedAt: string;
}

export interface RegistryIssue {
  id: string;
  type: "bug" | "security" | "compatibility" | "feature" | "docs";
  status: "open" | "triaged" | "closed";
  severity: InspectionSeverity;
  title: string;
  body?: string;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface RegistryRating {
  id: string;
  version?: string;
  user: string;
  score: number;
  comment?: string;
  createdAt: string;
}

export interface RegistryVersion {
  version: string;
  manifest: SkillManifest;
  contentHash: string;
  snapshot: SkillSnapshot;
  inspection: InspectionReport;
  evaluation?: FunctionalEvaluationReport;
  status: InspectionVerdict;
  releaseTags: string[];
  changelog?: string;
  downloads: number;
  published?: boolean;
  uploadedAt?: string;
  inspectionStartedAt?: string;
  inspectionEndedAt?: string;
  inspectionStatus?: SkillInspectionStatus;
  inspectionFailure?: SkillInspectionFailureInfo;
  inspectionCompletedStages?: SkillInspectionStage[];
  createdAt: string;
  updatedAt: string;
}

export interface RegistrySkill {
  slug: string;
  name: string;
  description: string;
  ownerUserId?: string;
  latestVersion: string;
  inspectionStatus: SkillInspectionStatus;
  inspectionFailure?: SkillInspectionFailureInfo;
  uploadedAt?: string;
  inspectionStartedAt?: string;
  inspectionEndedAt?: string;
  inspectionCompletedStages?: SkillInspectionStage[];
  hasStoredPackage?: boolean;
  versions: Record<string, RegistryVersion>;
  contributors: RegistryContributor[];
  issues: RegistryIssue[];
  ratings: RegistryRating[];
  averageRating: number;
  ratingCount: number;
  published?: boolean;
  createdAt: string;
  updatedAt: string;
  bookmarkedByViewer?: boolean;
}

export interface SkillSearchResult {
  slug: string;
  name: string;
  description: string;
  latestVersion: string;
  inspectionStatus: SkillInspectionStatus;
  inspectionFailure?: SkillInspectionFailureInfo;
  uploadedAt?: string;
  inspectionStartedAt?: string;
  inspectionEndedAt?: string;
  status: InspectionVerdict;
  scores: InspectionScores;
  categories: string[];
  averageRating: number;
  ratingCount: number;
  openIssues: number;
  contributors: RegistryContributor[];
  downloads: number;
  updatedAt: string;
  latestVersionCreatedAt?: string;
  published?: boolean;
}

export interface PublicUser {
  id: string;
  username: string;
  email: string | null;
  emailVerified: boolean;
  role: "admin" | "user";
  displayName: string | null;
  about: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ApiKeySummary {
  id: string;
  name: string;
  prefix: string;
  isActive: boolean;
  createdAt: string;
  expiresAt: string | null;
  lastUsedAt: string | null;
}

export interface UserSearchResult {
  username: string;
  displayName: string | null;
}
