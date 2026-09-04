import type { ReviewReport, ReviewVerdict } from "@skill-platform/review-engine";
import type { FunctionalEvaluationReport } from "@skill-platform/evaluator";
import type { SkillManifest, SkillSnapshot } from "@skill-platform/skill-spec";
import type { SkillReviewFailureInfo, SkillReviewStage, SkillReviewStatus } from "./review-status.js";

export type { SkillReviewFailureInfo, SkillReviewStage, SkillReviewStatus } from "./review-status.js";
export {
  buildSkillReviewFailureFromError,
  buildSkillReviewFailureFromStages,
  DEFAULT_SKILL_REVIEW_STATUS,
  formatSkillReviewFailureSummary,
  isSkillReviewStage,
  isSkillReviewStatus,
  parseSkillReviewStages,
  skillReviewStageLabel,
  skillReviewStatusLabel,
  SKILL_REVIEW_STAGES,
  SKILL_REVIEW_STATUSES,
} from "./review-status.js";

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
  review: ReviewReport;
  evaluation?: FunctionalEvaluationReport;
  status: ReviewVerdict;
  releaseTags: string[];
  changelog?: string;
  downloads: number;
  published?: boolean;
  uploadedAt?: string;
  reviewStartedAt?: string;
  reviewEndedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface RegistrySkill {
  slug: string;
  name: string;
  description: string;
  ownerUserId?: string;
  latestVersion: string;
  reviewStatus: SkillReviewStatus;
  reviewFailure?: SkillReviewFailureInfo;
  reviewCompletedStages?: SkillReviewStage[];
  uploadedAt?: string;
  reviewStartedAt?: string;
  reviewEndedAt?: string;
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
  reviewStatus: SkillReviewStatus;
  reviewFailure?: SkillReviewFailureInfo;
  uploadedAt?: string;
  reviewStartedAt?: string;
  reviewEndedAt?: string;
  status: ReviewVerdict;
  scores: ReviewReport["scores"];
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
  /** Review/evaluation rows were already persisted via commitReviewResultsBeforePublish. */
  reviewAlreadyCommitted?: boolean;
}

export interface CommitReviewResultsOptions {
  releaseTags?: string[];
}

export interface PersistReviewStageResultsOptions {
  completedStages: SkillReviewStage[];
  finalize?: boolean;
}

export interface UpsertReviewOptions {
  finalize?: boolean;
}

export interface StagePendingPublishSnapshotOptions {
  releaseTags?: string[];
  changelog?: string;
  ownerUserId?: string;
  ownerUsername?: string;
}

export interface RecoverStaleReviewingSkillsOptions {
  /** Fail every reviewing skill. Use on API startup when in-process jobs cannot survive restarts. */
  recoverAll?: boolean;
  /** Fail reviewing skills whose updatedAt is older than this threshold. */
  olderThanMs?: number;
}

export interface MarkSkillReviewStatusOptions {
  name?: string;
  description?: string;
  ownerUserId?: string;
  ownerUsername?: string;
  latestVersion?: string;
  failure?: SkillReviewFailureInfo;
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
      reviewStatus?: SkillReviewStatus;
      needsPackageReupload?: boolean;
      hasStoredPackage?: boolean;
    };

export interface RegistryStore {
  markSkillReviewStatus(
    slug: string,
    reviewStatus: SkillReviewStatus,
    options?: MarkSkillReviewStatusOptions
  ): Promise<void>;
  commitReviewResultsBeforePublish(
    snapshot: SkillSnapshot,
    review: ReviewReport,
    evaluation?: FunctionalEvaluationReport,
    options?: CommitReviewResultsOptions
  ): Promise<void>;
  persistReviewStageResults(
    slug: string,
    version: string,
    review: ReviewReport,
    evaluation: FunctionalEvaluationReport | undefined,
    options: PersistReviewStageResultsOptions
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
    review: ReviewReport,
    evaluation?: FunctionalEvaluationReport,
    options?: PublishSnapshotOptions
  ): Promise<RegistryVersion>;
  upsertReview(
    slug: string,
    version: string,
    review: ReviewReport,
    options?: UpsertReviewOptions
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
  listReviewPendingSkillsForOwner(ownerUserId: string): Promise<SkillSearchResult[]>;
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
  recoverStaleReviewingSkills(options?: RecoverStaleReviewingSkillsOptions): Promise<number>;
  purgeAccountData(userId: string): Promise<void>;
  reviewAll(
    pipelineFn: (
      snapshot: SkillSnapshot,
      version: string
    ) =>
      | { review: ReviewReport; evaluation: FunctionalEvaluationReport }
      | Promise<{ review: ReviewReport; evaluation: FunctionalEvaluationReport }>
  ): Promise<RegistryVersion[]>;
}
