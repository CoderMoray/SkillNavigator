import cors from "@fastify/cors";
import Fastify, { type FastifyInstance, type FastifyReply } from "fastify";
import { pathToFileURL } from "node:url";
import { evaluateSkillSnapshot } from "@skill-platform/evaluator";
import { reviewAndEvaluateSkillSnapshot } from "@skill-platform/review-engine";
import { freeDevListenPort } from "./free-port.js";
import {
  applySkillAuthor,
  applySkillPublishMetadata,
  buildSkillDownloadFileName,
  findSkillEntryFile,
  getSkillSlug,
  parseSkillFrontmatterHints,
  readSkillZipBuffer,
  readSkillZipBufferLoose,
  readSkillZipFrontmatterHints,
  skillSnapshotToZipBuffer,
  type SkillPublishMetadata,
  type SkillSnapshot
} from "@skill-platform/skill-spec";
import {
  aggregateCreators,
  assertAssignableContributorRole,
  assertPublishPreflight,
  createAuthStoreFromEnv,
  createEmptyCreatorSummary,
  createRegistryStoreFromEnv,
  getApiBodyLimitBytes,
  isSkillContributor,
  isSkillOwner,
  listCreators,
  loadDotEnvIfPresent,
  mergeOwnerUnpublishedSkills,
  mergeOwnerRejectedSkills,
  normalizeCategoryFilters,
  normalizeHandle,
  PublishPreflightError,
  PublishRateLimiter,
  VerificationEmailRateLimiter,
  getPasswordResetExpiresMs,
  getRegistrationVerifyExpiresMs,
  getRegistrationUnverifiedRetentionDays,
  getWebPublicUrl,
  isPublicRegistrationEnabled,
  isRegistrationEmailVerificationRequired,
  isRegistrationEmailConfigured,
  sendPasswordResetEmail,
  sendRegistrationVerificationEmail,
  type AuthStore,
  type ContributorRole,
  type IssueSeverity,
  type IssueStatus,
  type IssueType,
  type LeaderboardSort,
  type PublicUser,
  type RegistrySkill,
  type RegistryStore
} from "@skill-platform/storage";

loadDotEnvIfPresent();

interface PublishBody {
  snapshot?: SkillSnapshot;
  archiveBase64?: string;
  version?: string;
  metadata?: SkillPublishMetadata;
  changelog?: string;
}

interface ReviewBody {
  snapshot?: SkillSnapshot;
  archiveBase64?: string;
  version?: string;
}

interface ContributorBody {
  name: string;
  role?: ContributorRole;
}

interface IssueBody {
  type: IssueType;
  severity?: IssueSeverity;
  title: string;
  body?: string;
  createdBy?: string;
}

interface RatingBody {
  version?: string;
  user?: string;
  score: number;
  comment?: string;
}

interface RegisterBody {
  username: string;
  password: string;
  email: string;
}

interface LoginBody {
  username: string;
  password: string;
}

interface ForgotPasswordBody {
  identifier: string;
}

interface ResetPasswordBody {
  token: string;
  newPassword: string;
}

interface ChangePasswordBody {
  currentPassword: string;
  newPassword: string;
}

interface DeleteAccountBody {
  password: string;
}

interface VerifyEmailBody {
  token: string;
}

interface SkillParams {
  slug: string;
}

interface CreatorParams {
  username: string;
}

interface VersionParams {
  slug: string;
  version: string;
}

interface ContributorParams {
  slug: string;
  contributorId: string;
}

type LeaderboardQuerySort = LeaderboardSort | "compliance" | "privacy";

function filterSkillVersionsForViewer(skill: RegistrySkill, user: PublicUser | undefined): RegistrySkill {
  if (user && isSkillOwner(skill, user)) {
    return skill;
  }

  return {
    ...skill,
    versions: Object.fromEntries(
      Object.entries(skill.versions).filter(([, version]) => version.published !== false)
    )
  };
}

function canAccessVersion(
  skill: RegistrySkill | undefined,
  version: { published?: boolean } | undefined,
  user: PublicUser | undefined
): boolean {
  if (!skill || !version) {
    return false;
  }
  if (version.published !== false) {
    return true;
  }
  return Boolean(user && isSkillOwner(skill, user));
}

function versionManageErrorStatus(message: string): number {
  if (message === "cannot_unpublish_latest_version") {
    return 400;
  }
  if (message === "version_already_unpublished" || message === "version_already_published") {
    return 409;
  }
  if (message.includes("Version not found") || message.includes("Skill not found")) {
    return 404;
  }
  return 400;
}

export function buildServer() {
  const bodyLimit = getApiBodyLimitBytes();
  const app = Fastify({
    logger: true,
    bodyLimit
  });
  const store = createRegistryStoreFromEnv();
  const authStore = createAuthStoreFromEnv();
  const publishRateLimiter = new PublishRateLimiter();
  const verificationEmailRateLimiter = new VerificationEmailRateLimiter();

  const runRecycleBinPurge = () => {
    void store
      .purgeExpiredRecycleBinSkills()
      .then((count) => {
        if (count > 0) {
          app.log.info({ count }, "Purged expired recycle-bin skills");
        }
      })
      .catch((error) => {
        app.log.error({ err: error }, "Recycle-bin purge failed");
      });
  };
  runRecycleBinPurge();
  const recycleBinPurgeTimer = setInterval(runRecycleBinPurge, 6 * 60 * 60 * 1000);
  recycleBinPurgeTimer.unref?.();

  const runUnverifiedUserPurge = () => {
    if (!isRegistrationEmailVerificationRequired()) {
      return;
    }

    const retentionDays = getRegistrationUnverifiedRetentionDays();
    if (retentionDays <= 0) {
      return;
    }

    void authStore
      .purgeExpiredUnverifiedUsers(retentionDays)
      .then((count) => {
        if (count > 0) {
          app.log.info({ count, retentionDays }, "Purged expired unverified users");
        }
      })
      .catch((error) => {
        app.log.error({ err: error }, "Unverified user purge failed");
      });
  };
  runUnverifiedUserPurge();
  const unverifiedUserPurgeTimer = setInterval(runUnverifiedUserPurge, 6 * 60 * 60 * 1000);
  unverifiedUserPurgeTimer.unref?.();

  app.register(cors, {
    origin: true,
    methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    exposedHeaders: ["Content-Disposition"]
  });

  app.get("/health", async () => ({
    ok: true,
    service: "skill-platform-api",
    timestamp: new Date().toISOString()
  }));

  app.post<{ Body: RegisterBody }>("/auth/register", async (request, reply) => {
    if (!isPublicRegistrationEnabled()) {
      return reply.code(403).send({ error: "Registration is disabled" });
    }

    try {
      const autoVerifyEmail = !isRegistrationEmailVerificationRequired();
      const user = await authStore.register(
        request.body.username,
        request.body.password,
        request.body.email,
        { autoVerifyEmail }
      );

      if (autoVerifyEmail) {
        const session = await authStore.login(request.body.username, request.body.password);
        return reply.code(201).send({ user, token: session.token, expiresAt: session.expiresAt });
      }

      if (!isRegistrationEmailConfigured()) {
        return reply.code(503).send({ error: "registration_email_not_configured" });
      }

      try {
        await sendRegistrationVerificationForUser(authStore, user, verificationEmailRateLimiter);
      } catch (error) {
        const message = errorMessage(error);
        if (message === "verification_email_rate_limited") {
          return reply.code(429).send({
            error: message,
            retryAfterSeconds: getVerificationEmailRateLimitRetryAfter(error)
          });
        }
        return reply.code(503).send({ error: message });
      }
      return reply.code(201).send({ user, verificationRequired: true });
    } catch (error) {
      return reply.code(400).send({ error: errorMessage(error) });
    }
  });

  app.post<{ Body: VerifyEmailBody }>("/auth/verify-email", async (request, reply) => {
    try {
      const user = await authStore.verifyEmail(request.body.token);
      return { user, verified: true };
    } catch (error) {
      return reply.code(400).send({ error: errorMessage(error) });
    }
  });

  app.post<{ Body: LoginBody }>("/auth/resend-verification", async (request, reply) => {
    try {
      if (!isRegistrationEmailVerificationRequired()) {
        return reply.code(400).send({ error: "registration_email_verification_disabled" });
      }

      if (!isRegistrationEmailConfigured()) {
        return reply.code(503).send({ error: "registration_email_not_configured" });
      }

      const expiresMs = getRegistrationVerifyExpiresMs();
      const user = await authStore.validateUnverifiedUserForVerification(
        request.body.username,
        request.body.password
      );
      const rateLimit = verificationEmailRateLimiter.check(user.id);
      if (!rateLimit.allowed) {
        return reply
          .code(429)
          .header("Retry-After", String(rateLimit.retryAfterSeconds))
          .send({
            error: "verification_email_rate_limited",
            retryAfterSeconds: rateLimit.retryAfterSeconds
          });
      }
      verificationEmailRateLimiter.recordAttempt(user.id);

      const token = await authStore.createEmailVerificationToken(user.id, expiresMs);
      if (!user.email) {
        return reply.code(400).send({ error: "User email is missing" });
      }

      const verifyUrl = `${getWebPublicUrl()}/verify-email?token=${encodeURIComponent(token)}`;
      await sendRegistrationVerificationEmail({
        to: user.email,
        username: user.username,
        verifyUrl
      });

      return { ok: true, email: user.email };
    } catch (error) {
      const message = errorMessage(error);
      const status =
        message === "Invalid username or password"
          ? 401
          : message === "verification_email_rate_limited"
            ? 429
            : 400;
      return reply.code(status).send({
        error: message,
        retryAfterSeconds: getVerificationEmailRateLimitRetryAfter(error)
      });
    }
  });

  app.post<{ Body: LoginBody }>("/auth/login", async (request, reply) => {
    try {
      const session = await authStore.login(request.body.username, request.body.password);
      return { user: session.user, token: session.token, expiresAt: session.expiresAt };
    } catch (error) {
      return reply.code(401).send({ error: errorMessage(error) });
    }
  });

  app.post<{ Body: ForgotPasswordBody }>("/auth/forgot-password", async (request, reply) => {
    // Always return ok:true regardless of whether the identifier exists,
    // so the endpoint cannot be used to enumerate registered accounts.
    if (!isRegistrationEmailConfigured()) {
      return reply.code(503).send({ error: "registration_email_not_configured" });
    }

    try {
      const { user, token } = await authStore.requestPasswordReset(
        request.body.identifier,
        getPasswordResetExpiresMs()
      );
      if (!user.email) {
        return reply.code(400).send({ error: "User email is missing" });
      }
      const resetUrl = `${getWebPublicUrl()}/reset-password?token=${encodeURIComponent(token)}`;
      await sendPasswordResetEmail({
        to: user.email,
        username: user.username,
        resetUrl,
        mailType: "password_reset"
      });
      return { ok: true };
    } catch (error) {
      const message = errorMessage(error);
      if (message === "Invalid username" || message === "User email is missing") {
        return { ok: true };
      }
      return reply.code(400).send({ error: message });
    }
  });

  app.post<{ Body: ResetPasswordBody }>("/auth/reset-password", async (request, reply) => {
    try {
      const user = await authStore.resetPassword(request.body.token, request.body.newPassword);
      return { ok: true, user };
    } catch (error) {
      return reply.code(400).send({ error: errorMessage(error) });
    }
  });

  app.post("/auth/logout", async (request, reply) => {
    const token = readBearerToken(request.headers.authorization);
    if (!token) {
      return reply.code(401).send({ error: "Unauthorized" });
    }

    await authStore.logout(token);
    return { ok: true };
  });

  app.get("/auth/me", async (request, reply) => {
    const token = readBearerToken(request.headers.authorization);
    const user = token ? await authStore.getUserByToken(token) : undefined;
    if (!user) {
      return reply.code(401).send({ error: "Unauthorized" });
    }
    return { user };
  });

  app.post<{ Body: ChangePasswordBody }>("/auth/change-password", async (request, reply) => {
    const token = readBearerToken(request.headers.authorization);
    if (!token) {
      return reply.code(401).send({ error: "Unauthorized" });
    }

    try {
      const user = await authStore.changePassword(
        token,
        request.body.currentPassword,
        request.body.newPassword
      );
      return { user };
    } catch (error) {
      const message = errorMessage(error);
      return reply.code(message === "Unauthorized" ? 401 : 400).send({ error: message });
    }
  });

  app.post<{ Body: DeleteAccountBody }>("/auth/delete-account", async (request, reply) => {
    const token = readBearerToken(request.headers.authorization);
    if (!token) {
      return reply.code(401).send({ error: "Unauthorized" });
    }

    const user = await authStore.getUserByToken(token);
    if (!user) {
      return reply.code(401).send({ error: "Unauthorized" });
    }

    try {
      await store.purgeAccountData(user.id);
      await authStore.deleteAccount(token, request.body.password);
      return { ok: true };
    } catch (error) {
      const message = errorMessage(error);
      if (message === "Unauthorized") {
        return reply.code(401).send({ error: message });
      }
      return reply.code(400).send({ error: message });
    }
  });

  app.get<{ Querystring: { query?: string; category?: string | string[] } }>("/skills", async (request) => {
    return {
      items: await store.search(request.query.query ?? "", normalizeCategoryFilters(request.query.category))
    };
  });

  app.get<{ Querystring: { query?: string } }>("/audits", async (request) => {
    return {
      items: await store.listAuditSkills(request.query.query ?? "")
    };
  });

  app.get<{ Querystring: { query?: string } }>("/creators", async (request) => {
    const skills = await store.search("");
    const users = await authStore.listUsers();
    const normalizedQuery = request.query.query?.trim().toLowerCase() ?? "";
    const items = listCreators(skills, users).filter((creator) => {
      if (!normalizedQuery) {
        return true;
      }
      return (
        creator.name.toLowerCase().includes(normalizedQuery) ||
        creator.handle.includes(normalizedQuery)
      );
    });

    return { items };
  });

  app.get<{ Params: CreatorParams }>("/creators/:username", async (request, reply) => {
    const handle = normalizeHandle(request.params.username);
    const viewer = await getAuthenticatedUser(request.headers.authorization, authStore);
    const skills = await store.search("");
    const isProfileOwner = Boolean(viewer && normalizeHandle(viewer.username) === handle);
    let unpublished: Awaited<ReturnType<typeof store.listUnpublishedSkillsForOwner>> = [];
    let rejected: Awaited<ReturnType<typeof store.listRejectedSkillsForOwner>> = [];
    if (isProfileOwner && viewer) {
      [unpublished, rejected] = await Promise.all([
        store.listUnpublishedSkillsForOwner(viewer.id),
        store.listRejectedSkillsForOwner(viewer.id)
      ]);
    }

    const mergeOwnerOnlySkills = (creator: ReturnType<typeof createEmptyCreatorSummary>) =>
      mergeOwnerRejectedSkills(mergeOwnerUnpublishedSkills(creator, unpublished), rejected);

    const matched = aggregateCreators(skills).find((item) => item.handle === handle);
    if (matched) {
      return {
        creator: isProfileOwner ? mergeOwnerOnlySkills(matched) : matched
      };
    }

    const user = await authStore.getUserByUsername(handle);
    if (!user) {
      return reply.code(404).send({ error: "Creator not found" });
    }

    let creator = createEmptyCreatorSummary(user.username);
    if (isProfileOwner) {
      creator = mergeOwnerOnlySkills(creator);
    }
    return { creator };
  });

  app.post<{ Body: PublishBody }>("/skills/publish/preview", async (request, reply) => {
    const user = await getAuthenticatedUser(request.headers.authorization, authStore);
    if (!user) {
      return reply.code(401).send({ error: "Unauthorized" });
    }

    try {
      if (request.body.metadata) {
        const prepared = preparePublishRequest(request.body, user.username);
        const existingSkill = await store.getSkill(prepared.slug);
        assertPublishPreflight({
          slug: prepared.slug,
          version: prepared.version,
          releaseTags: prepared.releaseTags,
          existingSkill,
          user,
        });
        return extractPublishPreview(prepared.snapshot);
      }

      if (request.body.archiveBase64) {
        const buffer = Buffer.from(stripDataUrlPrefix(request.body.archiveBase64), "base64");
        const preview = readSkillZipFrontmatterHints(buffer);
        return {
          entryPath: preview.entryPath,
          frontmatter: preview.frontmatter ?? {}
        };
      }

      const uploaded = readSkillFromBody(request.body);
      return extractPublishPreview(uploaded.snapshot);
    } catch (error) {
      return sendPublishError(reply, error);
    }
  });

  app.post<{ Body: PublishBody }>("/skills/publish", async (request, reply) => {
    const user = await getAuthenticatedUser(request.headers.authorization, authStore);
    if (!user) {
      return reply.code(401).send({ error: "Unauthorized" });
    }

    const rateLimit = publishRateLimiter.check(user.id);
    if (!rateLimit.allowed) {
      return reply
        .code(429)
        .header("Retry-After", String(rateLimit.retryAfterSeconds))
        .send({
          error: "publish_rate_limited",
          retryAfterSeconds: rateLimit.retryAfterSeconds
        });
    }
    try {
      const changelog = normalizeChangelog(request.body.changelog);
      const prepared = preparePublishRequest(request.body, user.username);
      const existingSkill = await store.getSkill(prepared.slug);
      assertPublishPreflight({
        slug: prepared.slug,
        version: prepared.version,
        releaseTags: prepared.releaseTags,
        existingSkill,
        user,
      });
      publishRateLimiter.recordAttempt(user.id);

      const { review, evaluation, failedStages } = await reviewAndEvaluateSkillSnapshot(
        prepared.snapshot,
        prepared.version
      );
      if (failedStages.length > 0) {
        return reply.code(503).send({
          error: "review_pipeline_incomplete",
          retryable: true,
          failedStages
        });
      }

      const registryVersion = await store.publishSnapshot(prepared.snapshot, review, evaluation, {
        owner: {
          userId: user.id,
          username: user.username
        },
        releaseTags: prepared.releaseTags,
        changelog
      });

      return reply.code(201).send({
        slug: prepared.slug,
        name: registryVersion.manifest.name,
        version: registryVersion.version,
        releaseTags: registryVersion.releaseTags,
        status: registryVersion.status,
        contentHash: registryVersion.contentHash,
        review: registryVersion.review,
        evaluation: registryVersion.evaluation,
        changelog: registryVersion.changelog
      });
    } catch (error) {
      return sendPublishError(reply, error);
    }
  });

  app.post<{ Body: ReviewBody }>("/reviews/run", async (request, reply) => {
    const user = await requireAuthenticatedUser(request.headers.authorization, authStore, reply);
    if (!user) {
      return;
    }

    const { snapshot, version } = readSkillFromBody(request.body);
    const { review, evaluation, failedStages } = await reviewAndEvaluateSkillSnapshot(snapshot, version);
    return { review, evaluation, failedStages };
  });

  app.post<{ Body: ReviewBody }>("/evaluations/run", async (request) => {
    const { snapshot } = readSkillFromBody(request.body);
    return {
      evaluation: await evaluateSkillSnapshot(snapshot)
    };
  });

  app.post("/reviews/rebuild", async (request, reply) => {
    const user = await requireAuthenticatedUser(request.headers.authorization, authStore, reply);
    if (!user) {
      return;
    }
    if (user.role !== "admin") {
      return reply.code(403).send({ error: "Forbidden" });
    }

    const reviewed = await store.reviewAll((snapshot, version) => reviewAndEvaluateSkillSnapshot(snapshot, version));
    return {
      reviewed: reviewed.length,
      items: reviewed.map((item) => ({
        slug: getSkillSlug(item.manifest),
        name: item.manifest.name,
        version: item.version,
        status: item.status,
        scores: item.review.scores,
        evaluation: item.evaluation
      }))
    };
  });

  app.get<{ Querystring: { sort?: LeaderboardQuerySort; limit?: string; category?: string | string[] } }>("/leaderboard", async (request) => {
    return {
      items: await store.leaderboard(
        normalizeLeaderboardSort(request.query.sort),
        Number(request.query.limit ?? 20),
        normalizeCategoryFilters(request.query.category)
      )
    };
  });

  app.post<{ Params: SkillParams; Body: ContributorBody }>("/skills/:slug/contributors", async (request, reply) => {
      const user = await getAuthenticatedUser(request.headers.authorization, authStore);
      if (!user) {
        return reply.code(401).send({ error: "Unauthorized" });
      }

      const skill = await store.getSkill(request.params.slug);
      if (!skill) {
        return reply.code(404).send({ error: "skill_not_found" });
      }
    if (!isSkillOwner(skill, user)) {
      return reply.code(403).send({ error: "only_owner_can_add_contributors" });
    }

    const contributorName = request.body.name.trim();
    if (!contributorName) {
      return reply.code(400).send({ error: "contributor_username_required" });
    }

    let contributorUser: Awaited<ReturnType<typeof authStore.getUserByUsername>>;
    try {
      contributorUser = await authStore.getUserByUsername(contributorName);
    } catch {
      return reply.code(404).send({ error: "user_not_found" });
    }
    if (!contributorUser) {
      return reply.code(404).send({ error: "user_not_found" });
    }

    try {
      assertAssignableContributorRole(request.body.role ?? "contributor");
    } catch {
      return reply.code(400).send({ error: "invalid_contributor_role" });
    }

    try {
      const contributor = await store.addContributor(request.params.slug, {
        role: "contributor",
        name: contributorUser.username,
        username: contributorUser.username,
        userId: contributorUser.id
      });
      return reply.code(201).send({ contributor });
    } catch (error) {
      const message = errorMessage(error);
      if (message === "cannot_modify_owner_contributor") {
        return reply.code(400).send({ error: message });
      }
      if (message === "contributor_already_exists") {
        return reply.code(409).send({ error: message });
      }
      throw error;
    }
  });

  app.delete<{ Params: ContributorParams }>("/skills/:slug/contributors/:contributorId", async (request, reply) => {
    const user = await getAuthenticatedUser(request.headers.authorization, authStore);
    if (!user) {
      return reply.code(401).send({ error: "Unauthorized" });
    }

    const skill = await store.getSkill(request.params.slug);
    if (!skill) {
      return reply.code(404).send({ error: "skill_not_found" });
    }
    if (!isSkillOwner(skill, user)) {
      return reply.code(403).send({ error: "only_owner_can_remove_contributors" });
    }

    try {
      await store.removeContributor(request.params.slug, request.params.contributorId);
      return { ok: true };
    } catch (error) {
      const message = errorMessage(error);
      if (message === "contributor_not_found") {
        return reply.code(404).send({ error: message });
      }
      if (message === "cannot_modify_owner_contributor") {
        return reply.code(400).send({ error: message });
      }
      throw error;
    }
  });

  app.post<{ Params: SkillParams; Body: IssueBody }>("/skills/:slug/issues", async (request, reply) => {
    const user = await requireAuthenticatedUser(request.headers.authorization, authStore, reply);
    if (!user) {
      return;
    }

    try {
      const issue = await store.createIssue(request.params.slug, {
        ...request.body,
        createdBy: user.username
      });
      return reply.code(201).send({ issue });
    } catch {
      return reply.code(404).send({ error: "skill_not_found" });
    }
  });

  app.get<{ Params: SkillParams; Querystring: { status?: IssueStatus } }>(
    "/skills/:slug/issues",
    async (request, reply) => {
      const skill = await store.getSkill(request.params.slug);
      if (!skill) {
        return reply.code(404).send({ error: "skill_not_found" });
      }

      return {
        items: await store.listIssues(request.params.slug, request.query.status)
      };
    }
  );

  app.post<{ Params: SkillParams; Body: RatingBody }>("/skills/:slug/ratings", async (request, reply) => {
    const user = await requireAuthenticatedUser(request.headers.authorization, authStore, reply);
    if (!user) {
      return;
    }

    try {
      const rating = await store.addRating(request.params.slug, {
        ...request.body,
        user: user.username
      });
      const skill = await store.getSkill(request.params.slug);
      return reply.code(201).send({
        rating,
        averageRating: skill?.averageRating ?? 0,
        ratingCount: skill?.ratingCount ?? 0
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "rating_failed";
      const status =
        message === "rating_already_submitted" ? 409 : message.includes("score") ? 400 : 404;
      return reply.code(status).send({ error: message });
    }
  });

  app.get<{ Params: SkillParams }>("/skills/:slug/availability", async (request) => {
    const availability = await store.getSkillSlugAvailability(request.params.slug);
    if (availability.status !== "active") {
      return availability;
    }

    const user = await getAuthenticatedUser(request.headers.authorization, authStore);
    if (!user) {
      return availability;
    }

    const skill = await store.getSkill(request.params.slug);
    return {
      ...availability,
      viewerCanPublish: skill ? isSkillContributor(skill, user) : false,
    };
  });

  app.get<{ Params: SkillParams }>("/skills/:slug", async (request, reply) => {
    const skill = await store.getSkill(request.params.slug);
    if (!skill) {
      return reply.code(404).send({ error: "skill_not_found" });
    }

    if (skill.published === false) {
      const user = await getAuthenticatedUser(request.headers.authorization, authStore);
      if (!user || !isSkillOwner(skill, user)) {
        return reply.code(404).send({ error: "skill_not_found" });
      }
    }

    if (skill.deletedAt) {
      return reply.code(404).send({ error: "skill_not_found" });
    }

    const user = await getAuthenticatedUser(request.headers.authorization, authStore);
    const bookmarkedByViewer = user
      ? await store.isSkillBookmarked(user.id, request.params.slug)
      : undefined;

    return {
      ...filterSkillVersionsForViewer(skill, user),
      bookmarkedByViewer
    };
  });

  app.get<{ Params: VersionParams }>("/skills/:slug/versions/:version", async (request, reply) => {
    const skill = await store.getSkill(request.params.slug);
    const registryVersion = await store.getVersion(request.params.slug, request.params.version);
    if (!registryVersion) {
      return reply.code(404).send({ error: "version_not_found" });
    }

    const user = await getAuthenticatedUser(request.headers.authorization, authStore);
    if (!canAccessVersion(skill, registryVersion, user)) {
      return reply.code(404).send({ error: "version_not_found" });
    }

    const { snapshot: _snapshot, ...metadata } = registryVersion;
    return metadata;
  });

  app.get<{ Params: VersionParams }>("/skills/:slug/versions/:version/download", async (request, reply) => {
    const user = await requireAuthenticatedUser(request.headers.authorization, authStore, reply);
    if (!user) {
      return;
    }

    const skill = await store.getSkill(request.params.slug);
    if (!skill) {
      return reply.code(404).send({ error: "skill_not_found" });
    }
    if (skill.deletedAt) {
      return reply.code(404).send({ error: "skill_not_found" });
    }

    if (skill.published === false && !isSkillOwner(skill, user)) {
      return reply.code(404).send({ error: "skill_unpublished" });
    }

    const registryVersion = await store.getVersion(request.params.slug, request.params.version);
    if (!registryVersion || !canAccessVersion(skill, registryVersion, user)) {
      return reply.code(404).send({ error: registryVersion ? "version_unpublished" : "version_not_found" });
    }

    const snapshot = await store.downloadSnapshot(request.params.slug, request.params.version);
    if (!snapshot) {
      return reply.code(404).send({ error: "version_not_found" });
    }

    const fileName = buildSkillDownloadFileName(skill.name, registryVersion.version);
    return reply
      .header("content-type", "application/zip")
      .header("content-disposition", `attachment; filename="${fileName}"`)
      .send(skillSnapshotToZipBuffer(snapshot));
  });

  app.post<{ Params: SkillParams }>("/skills/:slug/unpublish", async (request, reply) => {
    const user = await requireAuthenticatedUser(request.headers.authorization, authStore, reply);
    if (!user) {
      return;
    }

    const skill = await store.getSkill(request.params.slug);
    if (!skill) {
      return reply.code(404).send({ error: "skill_not_found" });
    }
    if (!isSkillOwner(skill, user)) {
      return reply.code(403).send({ error: "Forbidden" });
    }

    try {
      const updated = await store.unpublishSkill(request.params.slug);
      return { skill: updated };
    } catch {
      return reply.code(404).send({ error: "skill_not_found" });
    }
  });

  app.post<{ Params: SkillParams }>("/skills/:slug/republish", async (request, reply) => {
    const user = await requireAuthenticatedUser(request.headers.authorization, authStore, reply);
    if (!user) {
      return;
    }

    const skill = await store.getSkill(request.params.slug);
    if (!skill) {
      return reply.code(404).send({ error: "skill_not_found" });
    }
    if (!isSkillOwner(skill, user)) {
      return reply.code(403).send({ error: "Forbidden" });
    }
    if (skill.published !== false) {
      return reply.code(400).send({ error: "skill_already_published" });
    }

    try {
      const updated = await store.republishSkill(request.params.slug);
      return { skill: updated };
    } catch {
      return reply.code(404).send({ error: "skill_not_found" });
    }
  });

  app.post<{ Params: VersionParams }>("/skills/:slug/versions/:version/unpublish", async (request, reply) => {
    const user = await requireAuthenticatedUser(request.headers.authorization, authStore, reply);
    if (!user) {
      return;
    }

    const skill = await store.getSkill(request.params.slug);
    if (!skill) {
      return reply.code(404).send({ error: "skill_not_found" });
    }
    if (!isSkillOwner(skill, user)) {
      return reply.code(403).send({ error: "Forbidden" });
    }

    try {
      const updated = await store.unpublishVersion(request.params.slug, request.params.version);
      return { skill: filterSkillVersionsForViewer(updated, user) };
    } catch (error) {
      const message = errorMessage(error);
      return reply.code(versionManageErrorStatus(message)).send({ error: message });
    }
  });

  app.post<{ Params: VersionParams }>("/skills/:slug/versions/:version/republish", async (request, reply) => {
    const user = await requireAuthenticatedUser(request.headers.authorization, authStore, reply);
    if (!user) {
      return;
    }

    const skill = await store.getSkill(request.params.slug);
    if (!skill) {
      return reply.code(404).send({ error: "skill_not_found" });
    }
    if (!isSkillOwner(skill, user)) {
      return reply.code(403).send({ error: "Forbidden" });
    }

    try {
      const updated = await store.republishVersion(request.params.slug, request.params.version);
      return { skill: filterSkillVersionsForViewer(updated, user) };
    } catch (error) {
      const message = errorMessage(error);
      return reply.code(versionManageErrorStatus(message)).send({ error: message });
    }
  });

  app.delete<{ Params: SkillParams }>("/skills/:slug", async (request, reply) => {
    const user = await requireAuthenticatedUser(request.headers.authorization, authStore, reply);
    if (!user) {
      return;
    }

    const skill = await store.getSkill(request.params.slug);
    if (!skill) {
      return reply.code(404).send({ error: "skill_not_found" });
    }
    if (!isSkillOwner(skill, user)) {
      return reply.code(403).send({ error: "Forbidden" });
    }

    try {
      await store.deleteSkill(request.params.slug);
      const deletedAt = new Date();
      const { skillRecyclePurgeAt } = await import("@skill-platform/storage");
      return {
        ok: true,
        recycleBin: true,
        deletedAt: deletedAt.toISOString(),
        purgeAt: skillRecyclePurgeAt(deletedAt).toISOString()
      };
    } catch {
      return reply.code(404).send({ error: "skill_not_found" });
    }
  });

  app.post<{ Params: SkillParams }>("/skills/:slug/restore", async (request, reply) => {
    const user = await requireAuthenticatedUser(request.headers.authorization, authStore, reply);
    if (!user) {
      return;
    }

    const skill = await store.getSkill(request.params.slug);
    if (!skill?.deletedAt) {
      return reply.code(404).send({ error: "skill_not_in_recycle_bin" });
    }
    if (!isSkillOwner(skill, user)) {
      return reply.code(403).send({ error: "Forbidden" });
    }

    try {
      const restored = await store.restoreSkill(request.params.slug);
      return { skill: restored };
    } catch {
      return reply.code(404).send({ error: "skill_not_in_recycle_bin" });
    }
  });

  app.delete<{ Params: SkillParams }>("/skills/:slug/purge", async (request, reply) => {
    const user = await requireAuthenticatedUser(request.headers.authorization, authStore, reply);
    if (!user) {
      return;
    }

    const skill = await store.getSkill(request.params.slug);
    if (!skill?.deletedAt) {
      return reply.code(404).send({ error: "skill_not_in_recycle_bin" });
    }
    if (!isSkillOwner(skill, user)) {
      return reply.code(403).send({ error: "Forbidden" });
    }

    try {
      await store.purgeRecycleBinSkill(request.params.slug);
      return { ok: true, purged: true, slug: request.params.slug };
    } catch {
      return reply.code(404).send({ error: "skill_not_in_recycle_bin" });
    }
  });

  app.get("/users/me/recycle-bin", async (request, reply) => {
    const user = await requireAuthenticatedUser(request.headers.authorization, authStore, reply);
    if (!user) {
      return;
    }

    return { items: await store.listRecycleBinForOwner(user.id) };
  });

  app.get("/users/me/bookmarks", async (request, reply) => {
    const user = await requireAuthenticatedUser(request.headers.authorization, authStore, reply);
    if (!user) {
      return;
    }

    return { items: await store.listBookmarkedSkills(user.id) };
  });

  app.put<{ Params: SkillParams }>("/skills/:slug/bookmark", async (request, reply) => {
    const user = await requireAuthenticatedUser(request.headers.authorization, authStore, reply);
    if (!user) {
      return;
    }

    const skill = await store.getSkill(request.params.slug);
    if (!skill || skill.deletedAt) {
      return reply.code(404).send({ error: "skill_not_found" });
    }
    if (skill.published === false && !isSkillOwner(skill, user)) {
      return reply.code(404).send({ error: "skill_not_found" });
    }

    try {
      await store.bookmarkSkill(user.id, request.params.slug);
      return { ok: true, bookmarked: true };
    } catch (error) {
      return reply.code(400).send({ error: errorMessage(error) });
    }
  });

  app.delete<{ Params: SkillParams }>("/skills/:slug/bookmark", async (request, reply) => {
    const user = await requireAuthenticatedUser(request.headers.authorization, authStore, reply);
    if (!user) {
      return;
    }

    await store.unbookmarkSkill(user.id, request.params.slug);
    return { ok: true, bookmarked: false };
  });

  const dispose = async (): Promise<void> => {
    clearInterval(recycleBinPurgeTimer);
    await closeRegistryStore(store);
  };

  return { app, dispose };
}

async function closeRegistryStore(store: RegistryStore): Promise<void> {
  if ("close" in store && typeof store.close === "function") {
    await store.close();
  }
}

function readBearerToken(authorization: string | undefined): string | undefined {
  if (!authorization?.startsWith("Bearer ")) {
    return undefined;
  }
  return authorization.slice("Bearer ".length).trim();
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unexpected error";
}

async function getAuthenticatedUser(
  authorization: string | undefined,
  authStore: ReturnType<typeof createAuthStoreFromEnv>
): Promise<PublicUser | undefined> {
  const token = readBearerToken(authorization);
  return token ? authStore.getUserByToken(token) : undefined;
}

async function requireAuthenticatedUser(
  authorization: string | undefined,
  authStore: ReturnType<typeof createAuthStoreFromEnv>,
  reply: FastifyReply
): Promise<PublicUser | undefined> {
  const user = await getAuthenticatedUser(authorization, authStore);
  if (!user) {
    reply.code(401).send({ error: "Unauthorized" });
    return undefined;
  }
  return user;
}

function extractPublishPreview(snapshot: SkillSnapshot) {
  const entry = findSkillEntryFile(snapshot.files);
  if (!entry) {
    throw new Error("Skill package must include SKILL.md, skill.md, or skills.md");
  }

  const frontmatter = parseSkillFrontmatterHints(entry.content);
  return {
    entryPath: entry.path,
    frontmatter: frontmatter ?? {}
  };
}

interface PreparedPublishRequest {
  snapshot: SkillSnapshot;
  version: string;
  slug: string;
  releaseTags: string[];
}

function preparePublishRequest(body: PublishBody, username: string): PreparedPublishRequest {
  const uploaded = readSkillFromBody(body, { looseEntry: Boolean(body.metadata) });
  let snapshot = body.metadata
    ? applySkillPublishMetadata(uploaded.snapshot, body.metadata)
    : uploaded.snapshot;
  snapshot = applySkillAuthor(snapshot, username);
  const version = body.metadata?.version ?? uploaded.version ?? snapshot.manifest.version ?? "0.1.0";
  const slug = getSkillSlug(snapshot.manifest);
  const releaseTags = body.metadata?.releaseTags ??
    (Array.isArray(snapshot.manifest["release-tags"])
      ? snapshot.manifest["release-tags"].map(String)
      : ["latest"]);
  return { snapshot, version, slug, releaseTags };
}

function sendPublishError(reply: FastifyReply, error: unknown) {
  if (error instanceof PublishPreflightError) {
    return reply.code(error.statusCode).send({ error: error.message });
  }
  const message = errorMessage(error);
  return reply.code(
    message.includes("already exists") || message === "skill_in_recycle_bin" ? 409 : 400
  ).send({ error: message });
}

function readSkillFromBody(
  body: PublishBody | ReviewBody,
  options?: { looseEntry?: boolean }
): { snapshot: SkillSnapshot; version?: string } {
  if (body.archiveBase64) {
    const buffer = Buffer.from(stripDataUrlPrefix(body.archiveBase64), "base64");
    return {
      snapshot: options?.looseEntry ? readSkillZipBufferLoose(buffer) : readSkillZipBuffer(buffer),
      version: body.version
    };
  }

  if (body.snapshot) {
    return {
      snapshot: body.snapshot,
      version: body.version
    };
  }

  throw new Error("Request body must include snapshot or archiveBase64");
}

function stripDataUrlPrefix(value: string): string {
  const commaIndex = value.indexOf(",");
  return value.startsWith("data:") && commaIndex >= 0 ? value.slice(commaIndex + 1) : value;
}

async function sendRegistrationVerificationForUser(
  authStore: AuthStore,
  user: { id: string; username: string; email: string | null },
  rateLimiter: VerificationEmailRateLimiter
): Promise<void> {
  if (!user.email) {
    throw new Error("User email is missing");
  }

  const rateLimit = rateLimiter.check(user.id);
  if (!rateLimit.allowed) {
    const error = new Error("verification_email_rate_limited") as Error & { retryAfterSeconds?: number };
    error.retryAfterSeconds = rateLimit.retryAfterSeconds;
    throw error;
  }
  rateLimiter.recordAttempt(user.id);

  const expiresMs = getRegistrationVerifyExpiresMs();
  const token = await authStore.createEmailVerificationToken(user.id, expiresMs);
  const verifyUrl = `${getWebPublicUrl()}/verify-email?token=${encodeURIComponent(token)}`;
  await sendRegistrationVerificationEmail({
    to: user.email,
    username: user.username,
    verifyUrl
  });
}

function getVerificationEmailRateLimitRetryAfter(error: unknown): number | undefined {
  if (
    typeof error === "object" &&
    error !== null &&
    "retryAfterSeconds" in error &&
    typeof (error as { retryAfterSeconds?: unknown }).retryAfterSeconds === "number"
  ) {
    return (error as { retryAfterSeconds: number }).retryAfterSeconds;
  }
  return undefined;
}

function normalizeChangelog(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string") {
    throw new Error("Changelog must be text");
  }

  const changelog = value.trim();
  if (changelog.length > 10_000) {
    throw new Error("Changelog must not exceed 10000 characters");
  }
  return changelog || undefined;
}

function normalizeLeaderboardSort(sort: LeaderboardQuerySort | undefined): LeaderboardSort {
  if (sort === "compliance") {
    return "quality";
  }
  if (sort === "privacy") {
    return "security";
  }
  return sort ?? "downloads";
}

function printStartupError(phase: string, error: unknown): void {
  const err = error as NodeJS.ErrnoException;
  const message = err instanceof Error ? err.message : String(error);

  console.error("");
  console.error(`[skill-platform-api] Startup failed during: ${phase}`);
  console.error(`  message: ${message}`);
  if (err.code) {
    console.error(`  code: ${err.code}`);
  }

  if (err.code === "EADDRINUSE") {
    const port = Number(process.env.PORT ?? 3000);
    console.error(`  hint: Port ${port} is already in use. Stop other API dev processes or set PORT in .env.`);
    console.error(`  hint: Windows check — netstat -ano | findstr :${port}`);
  }

  if (error instanceof Error && error.stack) {
    console.error(error.stack);
  }
  console.error("");
}

async function listenWithRetry(app: FastifyInstance, port: number, host: string): Promise<void> {
  const maxAttempts = 5;

  await freeDevListenPort(port);

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await app.listen({ port, host });
      return;
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err.code === "EADDRINUSE" && attempt < maxAttempts) {
        app.log.warn({ port, host, attempt, maxAttempts }, "Port in use during startup; freeing port and retrying listen");
        await freeDevListenPort(port);
        await new Promise((resolve) => setTimeout(resolve, 300 * attempt));
        continue;
      }
      throw error;
    }
  }
}

async function startServer(): Promise<void> {
  const port = Number(process.env.PORT ?? 3000);
  const host = process.env.HOST ?? "127.0.0.1";

  let server: ReturnType<typeof buildServer>;
  try {
    server = buildServer();
  } catch (error) {
    printStartupError("server setup", error);
    process.exit(1);
  }

  let shuttingDown = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    server.app.log.info({ signal }, "Shutting down skill platform API");

    try {
      await server.app.close();
      await server.dispose();
    } catch (error) {
      server.app.log.error({ err: error }, "Error during shutdown");
    }

    process.exit(0);
  };

  process.once("SIGTERM", () => {
    void shutdown("SIGTERM");
  });
  process.once("SIGINT", () => {
    void shutdown("SIGINT");
  });

  try {
    await listenWithRetry(server.app, port, host);
  } catch (error) {
    printStartupError("listen", error);
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startServer().catch((error) => {
    printStartupError("startup", error);
    process.exit(1);
  });
}
