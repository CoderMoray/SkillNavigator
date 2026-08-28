import type {
  ApiKeySummary,
  FunctionalEvaluationReport,
  PublicUser,
  RegistryContributor,
  RegistryIssue,
  RegistryRating,
  RegistrySkill,
  ReviewReport,
  SkillSearchResult
} from "./types";
import type { CreatorSummary } from "./creators";
import { buildSkillDownloadFileName, parseSkillDownloadVersion } from "@skill-platform/skill-spec/skill-format";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:3000";

/**
 * Build an API URL that preserves the base path prefix (e.g. "/MonoSkillNavigator/api").
 * Using new URL(path, base) with an absolute path would override the base path entirely;
 * appending "/" makes the reference relative so the prefix survives.
 */
export function apiUrl(path: string): URL {
  return new URL(path.replace(/^\/+/, ""), `${API_BASE_URL.replace(/\/+$/, "")}/`);
}

export async function getSkills(query = "", categories: string[] = []): Promise<SkillSearchResult[]> {
  const url = apiUrl("/skills");
  if (query.trim()) {
    url.searchParams.set("query", query.trim());
  }
  for (const category of categories) {
    if (category.trim()) {
      url.searchParams.append("category", category.trim());
    }
  }

  const data = await request<{ items: SkillSearchResult[] }>(url);
  return data.items;
}

export async function getAuditSkills(query = ""): Promise<SkillSearchResult[]> {
  const url = apiUrl("/audits");
  if (query.trim()) {
    url.searchParams.set("query", query.trim());
  }

  const data = await request<{ items: SkillSearchResult[] }>(url);
  return data.items;
}

export async function getLeaderboard(sort = "downloads", limit = 8, categories: string[] = []): Promise<SkillSearchResult[]> {
  const url = apiUrl("/leaderboard");
  url.searchParams.set("sort", sort);
  url.searchParams.set("limit", String(limit));
  for (const category of categories) {
    if (category.trim()) {
      url.searchParams.append("category", category.trim());
    }
  }

  const data = await request<{ items: SkillSearchResult[] }>(url);
  return data.items;
}

export async function getCreators(query = ""): Promise<CreatorSummary[]> {
  const url = apiUrl("/creators");
  if (query.trim()) {
    url.searchParams.set("query", query.trim());
  }

  const data = await request<{ items: CreatorSummary[] }>(url);
  return data.items;
}

export async function getCreatorProfile(username: string, token?: string): Promise<CreatorSummary> {
  const data = await request<{ creator: CreatorSummary }>(
    apiUrl(`/creators/${encodeURIComponent(username)}`),
    { token }
  );
  return data.creator;
}

export async function getSkill(slug: string, token?: string): Promise<RegistrySkill> {
  return request<RegistrySkill>(apiUrl(`/skills/${encodeURIComponent(slug)}`), { token });
}

export type SkillSlugAvailabilityResponse =
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
      viewerCanPublish?: boolean;
    };

export async function checkSkillSlugAvailability(
  slug: string,
  token?: string
): Promise<SkillSlugAvailabilityResponse> {
  return request<SkillSlugAvailabilityResponse>(
    apiUrl(`/skills/${encodeURIComponent(slug)}/availability`),
    { token }
  );
}

export interface SkillDownloadResult {
  blob: Blob;
  fileName: string;
}

export async function downloadSkillVersion(
  token: string,
  slug: string,
  version: string,
  skillName?: string
): Promise<SkillDownloadResult> {
  const url = apiUrl(`/skills/${encodeURIComponent(slug)}/versions/${encodeURIComponent(version)}/download`);

  const response = await fetch(url.toString(), {
    headers: {
      authorization: `Bearer ${token}`
    },
    cache: "no-store"
  });

  if (!response.ok) {
    const data = (await response.json().catch(() => undefined)) as { error?: string } | undefined;
    throw new Error(data?.error ?? `Download failed: ${response.status} ${response.statusText}`);
  }

  const headerFileName = parseContentDispositionFilename(response.headers.get("content-disposition"));
  const fallbackVersion = version === "latest" ? undefined : version;
  const fileName =
    headerFileName ??
    (skillName && fallbackVersion
      ? buildSkillDownloadFileName(skillName, fallbackVersion)
      : `${slug}-${version}.zip`);

  return {
    blob: await response.blob(),
    fileName
  };
}

export function resolveDownloadedSkillVersion(fileName: string, skillName: string, requestedVersion: string): string {
  return (
    parseSkillDownloadVersion(fileName, skillName) ??
    (requestedVersion === "latest" ? "latest" : requestedVersion)
  );
}

export function saveBlobAsFile(blob: Blob, fileName: string): void {
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = fileName;
  anchor.rel = "noopener";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(objectUrl);
}

export function getApiBaseUrl(): string {
  return API_BASE_URL;
}

export async function registerUser(
  username: string,
  password: string,
  email: string
): Promise<RegisterAuthResponse> {
  return request<RegisterAuthResponse>(apiUrl("/auth/register"), {
    method: "POST",
    body: JSON.stringify({ username, password, email })
  });
}

export async function verifyEmailToken(token: string): Promise<{ user: PublicUser; verified: true }> {
  return request<{ user: PublicUser; verified: true }>(apiUrl("/auth/verify-email"), {
    method: "POST",
    body: JSON.stringify({ token })
  });
}

export async function resendVerificationEmail(username: string, password: string): Promise<{ ok: true; email: string }> {
  return request<{ ok: true; email: string }>(apiUrl("/auth/resend-verification"), {
    method: "POST",
    body: JSON.stringify({ username, password })
  });
}

export async function loginUser(username: string, password: string): Promise<AuthResponse> {
  return request<AuthResponse>(apiUrl("/auth/login"), {
    method: "POST",
    body: JSON.stringify({ username, password })
  });
}

export async function forgotPassword(identifier: string): Promise<{ ok: true }> {
  return request<{ ok: true }>(apiUrl("/auth/forgot-password"), {
    method: "POST",
    body: JSON.stringify({ identifier })
  });
}

export async function resetPassword(token: string, newPassword: string): Promise<{ ok: true }> {
  return request<{ ok: true }>(apiUrl("/auth/reset-password"), {
    method: "POST",
    body: JSON.stringify({ token, newPassword })
  });
}

export async function logoutUser(token: string): Promise<void> {
  await request<{ ok: boolean }>(apiUrl("/auth/logout"), {
    method: "POST",
    token
  });
}

export async function getCurrentUser(token: string): Promise<PublicUser> {
  const data = await request<{ user: PublicUser }>(apiUrl("/auth/me"), { token });
  return data.user;
}

export async function changePassword(
  token: string,
  currentPassword: string,
  newPassword: string
): Promise<PublicUser> {
  const data = await request<{ user: PublicUser }>(apiUrl("/auth/change-password"), {
    method: "POST",
    token,
    body: JSON.stringify({ currentPassword, newPassword })
  });
  return data.user;
}

export async function updateProfile(
  token: string,
  input: { displayName?: string | null; about?: string | null }
): Promise<PublicUser> {
  const data = await request<{ user: PublicUser }>(apiUrl("/auth/profile"), {
    method: "PATCH",
    token,
    body: JSON.stringify(input)
  });
  return data.user;
}

export async function deleteAccount(token: string, password: string): Promise<void> {
  await request<{ ok: boolean }>(apiUrl("/auth/delete-account"), {
    method: "POST",
    token,
    body: JSON.stringify({ password })
  });
}

export async function listApiKeys(token: string): Promise<ApiKeySummary[]> {
  const data = await request<{ items: ApiKeySummary[] }>(apiUrl("/auth/api-keys"), { token });
  return data.items;
}

export async function createApiKey(
  token: string,
  input: { name: string; expiresAt?: string | null }
): Promise<{ apiKey: ApiKeySummary; secret: string }> {
  return request<{ apiKey: ApiKeySummary; secret: string }>(apiUrl("/auth/api-keys"), {
    method: "POST",
    token,
    body: JSON.stringify(input)
  });
}

export async function updateApiKey(
  token: string,
  keyId: string,
  patch: { isActive: boolean }
): Promise<ApiKeySummary> {
  const data = await request<{ apiKey: ApiKeySummary }>(
    apiUrl(`/auth/api-keys/${encodeURIComponent(keyId)}`),
    {
      method: "PATCH",
      token,
      body: JSON.stringify(patch)
    }
  );
  return data.apiKey;
}

export async function deleteApiKey(token: string, keyId: string): Promise<void> {
  await request<{ ok: boolean }>(apiUrl(`/auth/api-keys/${encodeURIComponent(keyId)}`), {
    method: "DELETE",
    token
  });
}

export interface PublishSkillFrontmatter {
  name?: string;
  description?: string;
  slug?: string;
  version?: string;
  categories?: string[];
  topics?: string[];
}

export type ReviewStage = "skillspector" | "virustotal" | "halucatch";

export interface ReviewStageFailure {
  stage: ReviewStage;
  message: string;
}

export interface ReviewPipelineIncompleteResponse {
  error: "review_pipeline_incomplete";
  retryable: true;
  failedStages: ReviewStageFailure[];
}

export interface PublishPreviewResponse {
  entryPath: string;
  frontmatter: PublishSkillFrontmatter;
}

export async function previewSkillArchive(
  token: string,
  archiveBase64: string
): Promise<PublishPreviewResponse> {
  return request<PublishPreviewResponse>(apiUrl("/skills/publish/preview"), {
    method: "POST",
    token,
    body: JSON.stringify({ archiveBase64 })
  });
}

export async function publishSkillArchive(
  token: string,
  archiveBase64: string,
  metadata: PublishSkillMetadata,
  changelog?: string
): Promise<PublishSkillResponse> {
  return request<PublishSkillResponse>(apiUrl("/skills/publish"), {
    method: "POST",
    token,
    body: JSON.stringify({
      archiveBase64,
      metadata,
      ...(changelog?.trim() ? { changelog: changelog.trim() } : {})
    })
  });
}

export async function addSkillContributor(
  token: string,
  skillSlug: string,
  name: string
): Promise<RegistryContributor> {
  const data = await request<{ contributor: RegistryContributor }>(
    apiUrl(`/skills/${encodeURIComponent(skillSlug)}/contributors`),
    {
      method: "POST",
      token,
      body: JSON.stringify({ name, role: "contributor" })
    }
  );
  return data.contributor;
}

export async function removeSkillContributor(
  token: string,
  skillSlug: string,
  contributorId: string
): Promise<void> {
  await request<{ ok: true }>(
    apiUrl(`/skills/${encodeURIComponent(skillSlug)}/contributors/${encodeURIComponent(contributorId)}`),
    {
      method: "DELETE",
      token
    }
  );
}

export async function createSkillIssue(
  token: string,
  skillSlug: string,
  input: {
    type: RegistryIssue["type"];
    severity?: RegistryIssue["severity"];
    title: string;
    body?: string;
  }
): Promise<RegistryIssue> {
  const data = await request<{ issue: RegistryIssue }>(
    apiUrl(`/skills/${encodeURIComponent(skillSlug)}/issues`),
    {
      method: "POST",
      token,
      body: JSON.stringify(input)
    }
  );
  return data.issue;
}

export async function addSkillRating(
  token: string,
  skillSlug: string,
  input: {
    score: number;
    version?: string;
    comment?: string;
  }
): Promise<{ rating: RegistryRating; averageRating: number; ratingCount: number }> {
  return request<{ rating: RegistryRating; averageRating: number; ratingCount: number }>(
    apiUrl(`/skills/${encodeURIComponent(skillSlug)}/ratings`),
    {
      method: "POST",
      token,
      body: JSON.stringify(input)
    }
  );
}

export async function unpublishSkill(token: string, slug: string): Promise<RegistrySkill> {
  const data = await request<{ skill: RegistrySkill }>(
    apiUrl(`/skills/${encodeURIComponent(slug)}/unpublish`),
    {
      method: "POST",
      token
    }
  );
  return data.skill;
}

export async function republishSkill(token: string, slug: string): Promise<RegistrySkill> {
  const data = await request<{ skill: RegistrySkill }>(
    apiUrl(`/skills/${encodeURIComponent(slug)}/republish`),
    {
      method: "POST",
      token
    }
  );
  return data.skill;
}

export async function unpublishSkillVersion(token: string, slug: string, version: string): Promise<RegistrySkill> {
  const data = await request<{ skill: RegistrySkill }>(
    apiUrl(`/skills/${encodeURIComponent(slug)}/versions/${encodeURIComponent(version)}/unpublish`),
    {
      method: "POST",
      token
    }
  );
  return data.skill;
}

export async function republishSkillVersion(token: string, slug: string, version: string): Promise<RegistrySkill> {
  const data = await request<{ skill: RegistrySkill }>(
    apiUrl(`/skills/${encodeURIComponent(slug)}/versions/${encodeURIComponent(version)}/republish`),
    {
      method: "POST",
      token
    }
  );
  return data.skill;
}

export async function deleteSkill(
  token: string,
  slug: string
): Promise<{ ok: true; recycleBin: true; deletedAt: string; purgeAt: string }> {
  return request<{ ok: true; recycleBin: true; deletedAt: string; purgeAt: string }>(
    apiUrl(`/skills/${encodeURIComponent(slug)}`),
    {
      method: "DELETE",
      token
    }
  );
}

export async function restoreSkill(token: string, slug: string): Promise<RegistrySkill> {
  const data = await request<{ skill: RegistrySkill }>(
    apiUrl(`/skills/${encodeURIComponent(slug)}/restore`),
    {
      method: "POST",
      token
    }
  );
  return data.skill;
}

export async function purgeRecycleBinSkill(
  token: string,
  slug: string
): Promise<{ ok: true; purged: true; slug: string }> {
  return request<{ ok: true; purged: true; slug: string }>(
    apiUrl(`/skills/${encodeURIComponent(slug)}/purge`),
    {
      method: "DELETE",
      token
    }
  );
}

export interface RecycleBinSkill {
  slug: string;
  name: string;
  description: string;
  latestVersion: string;
  deletedAt: string;
  purgeAt: string;
}

export async function getRecycleBin(token: string): Promise<RecycleBinSkill[]> {
  const data = await request<{ items: RecycleBinSkill[] }>(apiUrl("/users/me/recycle-bin"), {
    token
  });
  return data.items;
}

export async function getBookmarkedSkills(token: string): Promise<SkillSearchResult[]> {
  const data = await request<{ items: SkillSearchResult[] }>(apiUrl("/users/me/bookmarks"), {
    token
  });
  return data.items;
}

export async function bookmarkSkill(token: string, slug: string): Promise<void> {
  await request<{ ok: true; bookmarked: true }>(
    apiUrl(`/skills/${encodeURIComponent(slug)}/bookmark`),
    {
      method: "PUT",
      token
    }
  );
}

export async function unbookmarkSkill(token: string, slug: string): Promise<void> {
  await request<{ ok: true; bookmarked: false }>(
    apiUrl(`/skills/${encodeURIComponent(slug)}/bookmark`),
    {
      method: "DELETE",
      token
    }
  );
}

interface AuthResponse {
  user: PublicUser;
  token: string;
  expiresAt: string;
}

type RegisterAuthResponse =
  | AuthResponse
  | {
      user: PublicUser;
      verificationRequired: true;
    };

export interface PublishSkillResponse {
  slug: string;
  name: string;
  version: string;
  releaseTags: string[];
  status: string;
  contentHash: string;
  review: ReviewReport;
  evaluation?: FunctionalEvaluationReport;
  changelog?: string;
}

export interface PublishSkillMetadata {
  displayName: string;
  slug: string;
  summary: string;
  categories: string[];
  topics: string[];
  version: string;
  releaseTags: string[];
}

interface RequestOptions {
  method?: string;
  body?: BodyInit;
  token?: string;
}

interface ApiErrorResponse {
  error?: string;
  retryable?: boolean;
  retryAfterSeconds?: number;
  failedStages?: ReviewStageFailure[];
}

export class ApiRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly response?: ApiErrorResponse
  ) {
    super(message);
    this.name = "ApiRequestError";
  }
}

export function getRetryableReviewFailure(error: unknown): ReviewPipelineIncompleteResponse | undefined {
  if (
    !(error instanceof ApiRequestError) ||
    error.response?.error !== "review_pipeline_incomplete" ||
    error.response.retryable !== true ||
    !Array.isArray(error.response.failedStages)
  ) {
    return undefined;
  }

  return {
    error: "review_pipeline_incomplete",
    retryable: true,
    failedStages: error.response.failedStages
  };
}

function parseContentDispositionFilename(header: string | null): string | undefined {
  if (!header) {
    return undefined;
  }

  const utf8Match = header.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1]);
    } catch {
      return utf8Match[1];
    }
  }

  const asciiMatch = header.match(/filename="([^"]+)"/i) ?? header.match(/filename=([^;]+)/i);
  return asciiMatch?.[1]?.trim();
}

async function request<T>(url: URL, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {
    accept: "application/json"
  };
  if (options.body) {
    headers["content-type"] = "application/json";
  }
  if (options.token) {
    headers.authorization = `Bearer ${options.token}`;
  }

  const response = await fetch(url.toString(), {
    method: options.method ?? "GET",
    headers: {
      ...headers
    },
    body: options.body,
    cache: "no-store"
  });

  if (!response.ok) {
    const data = (await response.json().catch(() => undefined)) as ApiErrorResponse | undefined;
    throw new ApiRequestError(
      data?.error ?? `API request failed: ${response.status} ${response.statusText}`,
      response.status,
      data
    );
  }

  return (await response.json()) as T;
}
