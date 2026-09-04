import { pgTable, text, integer, boolean, bigint, timestamp, numeric, uniqueIndex, index } from "drizzle-orm/pg-core";

export const skills = pgTable("skills", {
  slug: text("slug").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  ownerUserId: text("owner_user_id"),
  latestVersion: text("latest_version").notNull(),
  reviewStatus: text("review_status").notNull().default("completed"),
  reviewFailedStages: text("review_failed_stages").array().notNull().default([]),
  reviewFailedMessage: text("review_failed_message"),
  reviewCompletedStages: text("review_completed_stages").array().notNull().default([]),
  uploadedAt: timestamp("uploaded_at", { withTimezone: true }),
  reviewStartedAt: timestamp("review_started_at", { withTimezone: true }),
  reviewEndedAt: timestamp("review_ended_at", { withTimezone: true }),
  averageRating: numeric("average_rating", { precision: 3, scale: 1 }).notNull().default("0"),
  ratingCount: integer("rating_count").notNull().default(0),
  published: boolean("published").notNull().default(true),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
}, (table) => [
  index("skills_updated_at_idx").on(table.updatedAt.desc()),
  index("skills_owner_user_id_idx").on(table.ownerUserId),
  index("skills_deleted_at_idx").on(table.deletedAt),
  index("skills_review_status_idx").on(table.reviewStatus),
]);

export const skillVersions = pgTable("skill_versions", {
  skillSlug: text("skill_slug").notNull().references(() => skills.slug, { onDelete: "cascade" }),
  version: text("version").notNull(),
  manifestName: text("manifest_name").notNull(),
  manifestDescription: text("manifest_description").notNull(),
  manifestVersion: text("manifest_version"),
  manifestAuthor: text("manifest_author"),
  manifestLicense: text("manifest_license"),
  tagsDefined: boolean("tags_defined").notNull().default(false),
  supportedAgents: text("supported_agents").array().notNull().default([]),
  supportedAgentsDefined: boolean("supported_agents_defined").notNull().default(false),
  allowedTools: text("allowed_tools").array().notNull().default([]),
  allowedToolsDefined: boolean("allowed_tools_defined").notNull().default(false),
  allowedToolsIsScalar: boolean("allowed_tools_is_scalar").notNull().default(false),
  disallowedTools: text("disallowed_tools").array().notNull().default([]),
  disallowedToolsDefined: boolean("disallowed_tools_defined").notNull().default(false),
  disallowedToolsIsScalar: boolean("disallowed_tools_is_scalar").notNull().default(false),
  categories: text("categories").array().notNull().default([]),
  topics: text("topics").array().notNull().default([]),
  releaseTags: text("release_tags").array().notNull().default([]),
  changelog: text("changelog"),
  contentHash: text("content_hash").notNull(),
  readme: text("readme").notNull(),
  snapshotCreatedAt: timestamp("snapshot_created_at", { withTimezone: true }).notNull(),
  uploadedAt: timestamp("uploaded_at", { withTimezone: true }),
  reviewStartedAt: timestamp("review_started_at", { withTimezone: true }),
  reviewEndedAt: timestamp("review_ended_at", { withTimezone: true }),
  reviewCompletedStages: text("review_completed_stages").array().notNull().default([]),
  status: text("status").notNull(),
  published: boolean("published").notNull().default(true),
  downloads: integer("downloads").notNull().default(0),
  artifactProvider: text("artifact_provider"),
  artifactBucket: text("artifact_bucket"),
  artifactObjectKey: text("artifact_object_key"),
  artifactContentHash: text("artifact_content_hash"),
  artifactSize: bigint("artifact_size", { mode: "number" }),
  artifactStoredAt: timestamp("artifact_stored_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
}, (table) => [
  uniqueIndex("skill_versions_pkey").on(table.skillSlug, table.version),
  index("skill_versions_status_updated_at_idx").on(table.status, table.updatedAt.desc()),
  index("skill_versions_content_hash_idx").on(table.contentHash),
  index("skill_versions_published_idx").on(table.skillSlug, table.published),
]);

export const skillVersionTags = pgTable("skill_version_tags", {
  skillSlug: text("skill_slug").notNull(),
  version: text("version").notNull(),
  position: integer("position").notNull(),
  tag: text("tag").notNull(),
}, (table) => [
  uniqueIndex("skill_version_tags_pkey").on(table.skillSlug, table.version, table.position),
  index("skill_version_tags_tag_idx").on(table.tag),
]);

export const skillVersionManifestProperties = pgTable("skill_version_manifest_properties", {
  skillSlug: text("skill_slug").notNull(),
  version: text("version").notNull(),
  propertyKey: text("property_key").notNull(),
  valueKind: text("value_kind").notNull(),
  valueText: text("value_text"),
}, (table) => [
  uniqueIndex("skill_version_manifest_properties_pkey").on(table.skillSlug, table.version, table.propertyKey),
]);

export const skillVersionFiles = pgTable("skill_version_files", {
  skillSlug: text("skill_slug").notNull(),
  version: text("version").notNull(),
  path: text("path").notNull(),
  // File bodies live in the artifact store when MinIO is enabled. PostgreSQL
  // retains only the file metadata in that mode, while legacy/local records
  // can continue to keep their content here.
  content: text("content"),
  size: integer("size").notNull(),
  sha256: text("sha256").notNull(),
}, (table) => [
  uniqueIndex("skill_version_files_pkey").on(table.skillSlug, table.version, table.path),
]);
