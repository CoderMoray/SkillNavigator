import type { InspectionReport, InspectionVerdict } from "@skill-platform/inspection-engine";
import type { FunctionalEvaluationReport } from "@skill-platform/evaluator";
import type { SkillManifest, SkillSnapshot } from "@skill-platform/skill-spec";
import type {
  InspectionStageStatuses,
  SkillInspectionFailureInfo,
  SkillInspectionStage,
  SkillInspectionStatus,
} from "./inspection-status.js";

export type { SkillInspectionFailureInfo, SkillInspectionStage, SkillInspectionStatus } from "./inspection-status.js";
export {
  buildSkillInspectionFailureFromError,
  buildSkillInspectionFailureFromStages,
  DEFAULT_SKILL_INSPECTION_STATUS,
  formatSkillInspectionFailureSummary,
  isSkillInspectionStage,
  isSkillInspectionStatus,
  parseSkillInspectionStages,
  skillInspectionStageLabel,
  skillInspectionStatusLabel,
  inspectionAggregateStatusLabel,
  resolveInspectionAggregateStatus,
  parseInspectionStageStatuses,
  mapStageStatusesToColumns,
  interruptInFlightStageStatuses,
  inspectionStageStatusLabel,
  SKILL_INSPECTION_STAGES,
  SKILL_INSPECTION_STATUSES,
} from "./inspection-status.js";

export type {
  InspectionStageStatuses,
  SkillSpectorStageStatus,
  VirusTotalStageStatus,
  HaluCatchStageStatus,
  InspectionStageDisplayStatus,
} from "./inspection-status.js";

export type ContributorRole = "owner" | "contributor";
export type IssueType = "bug" | "security" | "compatibility" | "feature" | "docs";
export type IssueStatus = "open" | "triaged" | "closed";
export type IssueSeverity = "low" | "medium" | "high" | "critical";
export type LeaderboardSort =
  | "downloads"
  | "rating"
  | "quality"
  | "security"
  | "reliability"
  | "recent";
export type ArtifactProvider = "minio";

export interface ArtifactDescriptor {
  provider: ArtifactProvider;
  bucket: string;
  objectKey: string;
  contentHash: string;
  size: number;
  storedAt: string;
}

export interface ArtifactStore {
  putSnapshot(slug: string, version: string, snapshot: SkillSnapshot): Promise<ArtifactDescriptor>;
  getSnapshot(descriptor: ArtifactDescriptor): Promise<SkillSnapshot>;
}

export interface RegistryContributor {
  id: string;
  userId?: string;
  username?: string;
  name: string;
  role: ContributorRole;
  addedAt: string;
}

export interface RegistryIssue {
  id: string;
  type: IssueType;
  status: IssueStatus;
  severity: IssueSeverity;
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
  artifact?: ArtifactDescriptor;
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
  inspectionStageStatuses?: InspectionStageStatuses;
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
  inspectionCompletedStages?: SkillInspectionStage[];
  inspectionStageStatuses?: InspectionStageStatuses;
  uploadedAt?: string;
  inspectionStartedAt?: string;
  inspectionEndedAt?: string;
  versions: Record<string, RegistryVersion>;
  contributors: RegistryContributor[];
  issues: RegistryIssue[];
  ratings: RegistryRating[];
  averageRating: number;
  ratingCount: number;
  published?: boolean;
  deletedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface RegistryData {
  skills: Record<string, RegistrySkill>;
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
  scores: InspectionReport["scores"];
  categories: string[];
  averageRating: number;
  ratingCount: number;
  openIssues: number;
  contributors: RegistryContributor[];
  downloads: number;
  updatedAt: string;
  /** Latest version publish time; used for "recent" sort */
  latestVersionCreatedAt?: string;
  /** Omitted or true for public search; false when listed only on owner profile */
  published?: boolean;
}

export interface CreateIssueInput {
  type: IssueType;
  severity?: IssueSeverity;
  title: string;
  body?: string;
  createdBy?: string;
}

export interface CreateRatingInput {
  version?: string;
  user: string;
  score: number;
  comment?: string;
}

export interface PublishSnapshotOptions {
  owner?: {
    userId: string;
    username: string;
  };
  releaseTags?: string[];
  changelog?: string;
  /** Review/evaluation rows were already persisted via commitInspectionResultsBeforePublish. */
  inspectionAlreadyCommitted?: boolean;
}

export interface CommitInspectionResultsOptions {
  releaseTags?: string[];
}

export interface PersistInspectionStageResultsOptions {
  completedStages?: SkillInspectionStage[];
  stageStatuses: InspectionStageStatuses;
  finalize?: boolean;
}

export interface UpsertInspectionOptions {
  finalize?: boolean;
}

export interface StagePendingPublishSnapshotOptions {
  releaseTags?: string[];
  changelog?: string;
  ownerUserId?: string;
  ownerUsername?: string;
}

export interface RecoverStaleInspectingSkillsOptions {
  /** Fail every inspecting skill. Use on API startup when in-process jobs cannot survive restarts. */
  recoverAll?: boolean;
  /** Fail inspecting skills whose updatedAt is older than this threshold. */
  olderThanMs?: number;
}

export interface MarkSkillInspectionStatusOptions {
  name?: string;
  description?: string;
  ownerUserId?: string;
  ownerUsername?: string;
  /** Version row to update (required for per-version review state). */
  version?: string;
  /** Updates skills.latest_version when publishing a new version. */
  setLatestVersion?: string;
  /** @deprecated Use version + setLatestVersion instead. */
  latestVersion?: string;
  failure?: SkillInspectionFailureInfo;
  stageStatuses?: InspectionStageStatuses;
}

export interface PostgresRegistryStoreOptions {
  artifactStore?: ArtifactStore;
}

export interface FileRegistryStoreOptions {
  artifactStore?: ArtifactStore;
}

export interface MinioArtifactStoreOptions {
  endPoint: string;
  port: number;
  useSSL: boolean;
  accessKey: string;
  secretKey: string;
  bucket: string;
  region?: string;
}

export interface RecycleBinSkill {
  slug: string;
  name: string;
  description: string;
  latestVersion: string;
  deletedAt: string;
  purgeAt: string;
}

export type SkillSlugAvailability =
  | { status: "available" }
  | {
      status: "recycle_bin";
      slug: string;
      name: string;
      deletedAt: string;
      purgeAt: string;
    }
  | {
      status: "active";
      slug: string;
      name: string;
      latestVersion: string;
      published: boolean;
      inspectionStatus?: SkillInspectionStatus;
      needsPackageReupload?: boolean;
      hasStoredPackage?: boolean;
    };

export interface RegistryStore {
  markSkillInspectionStatus(
    slug: string,
    inspectionStatus: SkillInspectionStatus,
    options?: MarkSkillInspectionStatusOptions
  ): Promise<void>;
  commitInspectionResultsBeforePublish(
    snapshot: SkillSnapshot,
    inspection: InspectionReport,
    evaluation?: FunctionalEvaluationReport,
    options?: CommitInspectionResultsOptions
  ): Promise<void>;
  persistInspectionStageResults(
    slug: string,
    version: string,
    inspection: InspectionReport,
    evaluation: FunctionalEvaluationReport | undefined,
    options: PersistInspectionStageResultsOptions
  ): Promise<void>;
  rollbackPendingPublishVersion(slug: string, version: string): Promise<void>;
  stagePendingPublishSnapshot(
    snapshot: SkillSnapshot,
    version: string,
    options?: StagePendingPublishSnapshotOptions
  ): Promise<void>;
  loadStoredSnapshot(slug: string, version: string): Promise<SkillSnapshot | undefined>;
  publishSnapshot(
    snapshot: SkillSnapshot,
    inspection: InspectionReport,
    evaluation?: FunctionalEvaluationReport,
    options?: PublishSnapshotOptions
  ): Promise<RegistryVersion>;
  upsertInspection(
    slug: string,
    version: string,
    inspection: InspectionReport,
    options?: UpsertInspectionOptions
  ): Promise<RegistryVersion>;
  upsertEvaluation(slug: string, version: string, evaluation: FunctionalEvaluationReport): Promise<RegistryVersion>;
  addContributor(slug: string, contributor: Omit<RegistryContributor, "id" | "addedAt">): Promise<RegistryContributor>;
  removeContributor(slug: string, contributorId: string): Promise<void>;
  createIssue(slug: string, issue: CreateIssueInput): Promise<RegistryIssue>;
  listIssues(slug: string, status?: IssueStatus): Promise<RegistryIssue[]>;
  addRating(slug: string, rating: CreateRatingInput): Promise<RegistryRating>;
  search(query?: string, categories?: string[]): Promise<SkillSearchResult[]>;
  listAuditSkills(query?: string): Promise<SkillSearchResult[]>;
  listUnpublishedSkillsForOwner(ownerUserId: string): Promise<SkillSearchResult[]>;
  listRejectedSkillsForOwner(ownerUserId: string): Promise<SkillSearchResult[]>;
  listInspectionPendingSkillsForOwner(ownerUserId: string): Promise<SkillSearchResult[]>;
  getSkill(slug: string): Promise<RegistrySkill | undefined>;
  getSkillSlugAvailability(slug: string): Promise<SkillSlugAvailability>;
  getVersion(slug: string, version?: string): Promise<RegistryVersion | undefined>;
  leaderboard(sort?: LeaderboardSort, limit?: number, categories?: string[]): Promise<SkillSearchResult[]>;
  downloadSnapshot(slug: string, version?: string): Promise<SkillSnapshot | undefined>;
  unpublishSkill(slug: string): Promise<RegistrySkill>;
  republishSkill(slug: string): Promise<RegistrySkill>;
  unpublishVersion(slug: string, version: string): Promise<RegistrySkill>;
  republishVersion(slug: string, version: string): Promise<RegistrySkill>;
  deleteSkill(slug: string): Promise<void>;
  restoreSkill(slug: string): Promise<RegistrySkill>;
  purgeRecycleBinSkill(slug: string): Promise<void>;
  listRecycleBinForOwner(ownerUserId: string): Promise<RecycleBinSkill[]>;
  bookmarkSkill(userId: string, slug: string): Promise<void>;
  unbookmarkSkill(userId: string, slug: string): Promise<void>;
  listBookmarkedSkills(userId: string): Promise<SkillSearchResult[]>;
  isSkillBookmarked(userId: string, slug: string): Promise<boolean>;
  purgeExpiredRecycleBinSkills(): Promise<number>;
  recoverStaleInspectingSkills(options?: RecoverStaleInspectingSkillsOptions): Promise<number>;
  purgeAccountData(userId: string): Promise<void>;
  inspectAll(
    pipelineFn: (
      snapshot: SkillSnapshot,
      version: string
    ) =>
      | { inspection: InspectionReport; evaluation: FunctionalEvaluationReport }
      | Promise<{ inspection: InspectionReport; evaluation: FunctionalEvaluationReport }>
  ): Promise<RegistryVersion[]>;
}
