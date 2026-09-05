import { randomBytes, scryptSync, timingSafeEqual, createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import pg from "pg";
import { isLoginErrorStrict, isRegistrationEmailVerificationRequired } from "./env";
import {
  assertApiKeyExpiry,
  assertRequiredApiKeyName,
  type ApiKeySummary,
  type CreateApiKeyOptions,
  type CreateApiKeyResult,
  generateApiKeySecret,
  hashApiKey,
  isApiKeyCredential,
  isApiKeyCurrentlyValid,
  isDuplicateApiKeyName,
  isSessionCredential,
  apiKeyPrefix
} from "./api-keys.js";

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

export interface UpdateProfileInput {
  displayName?: string | null;
  about?: string | null;
}

interface StoredUser extends PublicUser {
  passwordHash: string;
  emailVerifiedAt: string | null;
  pendingEmailVerification?: {
    tokenHash: string;
    expiresAt: string;
  };
  /** 已消费的邮箱验证 token 痕迹（tokenHash → 消费时间/原过期时间），用于识别"链接已使用"。 */
  usedEmailVerificationTokens?: Record<string, { usedAt: string; expiresAt: string }>;
  pendingPasswordReset?: {
    tokenHash: string;
    expiresAt: string;
  };
}

interface StoredSession {
  id: string;
  tokenHash: string;
  userId: string;
  createdAt: string;
  expiresAt: string;
}

interface StoredApiKey {
  id: string;
  userId: string;
  name: string;
  keyHash: string;
  keyPrefix: string;
  isActive: boolean;
  createdAt: string;
  expiresAt: string | null;
  lastUsedAt: string | null;
}

interface AuthData {
  users: Record<string, StoredUser>;
  sessions: Record<string, StoredSession>;
  apiKeys: Record<string, StoredApiKey>;
}

export interface LoginResult {
  token: string;
  user: PublicUser;
  expiresAt: string;
}

export type VerificationTokenErrorCode = "other_account" | "used_self" | "used_other" | "invalid";

/**
 * 邮箱验证 token 无法/不应完成激活时的分类错误。
 * - other_account：有效但归属其他已登录账号（token 已被服务端作废）
 * - used_self / used_other：token 已消费过，按归属与当前登录账号是否一致区分
 * - invalid：token 无效、已过期或无法归属
 */
export class VerificationTokenError extends Error {
  constructor(
    readonly code: VerificationTokenErrorCode,
    readonly username?: string
  ) {
    super(
      code === "other_account"
        ? "Verification token belongs to another account"
        : code === "invalid"
          ? "Invalid or expired verification token"
          : "Verification token already used"
    );
    this.name = "VerificationTokenError";
  }
}

function throwUsedVerificationError(
  sessionUserId: string | undefined,
  ownerUserId: string,
  ownerUsername: string
): never {
  if (sessionUserId === undefined) {
    throw new VerificationTokenError("invalid");
  }
  throw new VerificationTokenError(
    sessionUserId === ownerUserId ? "used_self" : "used_other",
    ownerUsername
  );
}

export interface AuthStore {
  register(username: string, password: string, email: string, options?: RegisterOptions): Promise<PublicUser>;
  login(username: string, password: string): Promise<LoginResult>;
  logout(token: string): Promise<void>;
  getUserByToken(token: string): Promise<PublicUser | undefined>;
  getUserByUsername(username: string): Promise<PublicUser | undefined>;
  listUsers(): Promise<PublicUser[]>;
  changePassword(token: string, currentPassword: string, newPassword: string): Promise<PublicUser>;
  updateProfile(sessionToken: string, input: UpdateProfileInput): Promise<PublicUser>;
  deleteAccount(token: string, password: string): Promise<void>;
  /** Promote a user to the admin role (idempotent). */
  promoteToAdmin(userId: string): Promise<void>;
  createEmailVerificationToken(userId: string, expiresMs: number): Promise<string>;
  /**
   * 校验并消费邮箱验证 token。
   * @param sessionUserId 当前已登录用户 id（无登录态时为 undefined），用于判定链接归属场景。
   * @throws VerificationTokenError 按 code 区分 four scenarios。
   */
  verifyEmail(token: string, sessionUserId?: string): Promise<LoginResult>;
  resendEmailVerification(username: string, password: string, expiresMs: number): Promise<{ user: PublicUser; token: string }>;
  validateUnverifiedUserForVerification(username: string, password: string): Promise<PublicUser>;
  purgeExpiredUnverifiedUsers(retentionDays: number): Promise<number>;
  requestPasswordReset(identifier: string, expiresMs: number): Promise<{ user: PublicUser; token: string }>;
  resetPassword(token: string, newPassword: string): Promise<PublicUser>;
  createApiKey(sessionToken: string, options: CreateApiKeyOptions): Promise<CreateApiKeyResult>;
  listApiKeys(sessionToken: string): Promise<ApiKeySummary[]>;
  updateApiKey(sessionToken: string, keyId: string, patch: { isActive?: boolean }): Promise<ApiKeySummary>;
  deleteApiKey(sessionToken: string, keyId: string): Promise<void>;
}

export interface RegisterOptions {
  autoVerifyEmail?: boolean;
}

const emptyAuthData: AuthData = {
  users: {},
  sessions: {},
  apiKeys: {}
};

abstract class JsonAuthStore implements AuthStore {
  async register(
    username: string,
    password: string,
    email: string,
    options: RegisterOptions = {}
  ): Promise<PublicUser> {
    const normalizedUsername = normalizeUsername(username);
    const normalizedEmail = normalizeEmail(email);
    assertPassword(password);
    const data = await this.load();

    if (Object.values(data.users).some((user) => user.username.toLowerCase() === normalizedUsername.toLowerCase())) {
      throw new Error("Username already exists");
    }

    if (
      Object.values(data.users).some(
        (user) => user.email !== null && user.email.toLowerCase() === normalizedEmail
      )
    ) {
      throw new Error("Email already exists");
    }

    const now = new Date().toISOString();
    const isFirstUser = Object.keys(data.users).length === 0;
    const user: StoredUser = {
      id: randomUUID(),
      username: normalizedUsername,
      email: normalizedEmail,
      emailVerified: options.autoVerifyEmail === true,
      emailVerifiedAt: options.autoVerifyEmail === true ? now : null,
      role: isFirstUser ? "admin" : "user",
      displayName: null,
      about: null,
      passwordHash: hashPassword(password),
      createdAt: now,
      updatedAt: now
    };

    data.users[user.id] = user;
    await this.save(data);
    return toPublicUser(user);
  }

  async login(username: string, password: string): Promise<LoginResult> {
    const lookup = resolveLoginIdentifier(username);
    const data = await this.load();
    const user = Object.values(data.users).find((item) => {
      if (item.username.toLowerCase() === lookup.raw.toLowerCase()) {
        return true;
      }
      return item.email !== null && item.email.toLowerCase() === lookup.raw.toLowerCase();
    });

    if (!user) {
      throw loginError("username");
    }
    if (!verifyPassword(password, user.passwordHash)) {
      throw loginError("password");
    }

    if (isRegistrationEmailVerificationRequired() && !user.emailVerifiedAt) {
      throw new Error("Email not verified");
    }

    const token = `skp_${randomBytes(32).toString("base64url")}`;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 1000 * 60 * 60 * 24 * 7).toISOString();
    const session: StoredSession = {
      id: randomUUID(),
      tokenHash: hashToken(token),
      userId: user.id,
      createdAt: now.toISOString(),
      expiresAt
    };

    data.sessions[session.id] = session;
    pruneExpiredSessions(data);
    await this.save(data);

    return {
      token,
      user: toPublicUser(user),
      expiresAt
    };
  }

  async logout(token: string): Promise<void> {
    if (isApiKeyCredential(token)) {
      return;
    }
    const data = await this.load();
    const tokenHash = hashToken(token);

    for (const [id, session] of Object.entries(data.sessions)) {
      if (session.tokenHash === tokenHash) {
        delete data.sessions[id];
      }
    }

    await this.save(data);
  }

  async getUserByToken(token: string): Promise<PublicUser | undefined> {
    const data = await this.load();
    if (isApiKeyCredential(token)) {
      return this.getUserByApiKey(token, data);
    }
    pruneExpiredSessions(data);
    const tokenHash = hashToken(token);
    const session = Object.values(data.sessions).find((item) => item.tokenHash === tokenHash);
    if (!session) {
      await this.save(data);
      return undefined;
    }

    const user = data.users[session.userId];
    await this.save(data);
    return user ? toPublicUser(user) : undefined;
  }

  async getUserByUsername(username: string): Promise<PublicUser | undefined> {
    const normalizedUsername = normalizeUsername(username);
    const data = await this.load();
    const user = Object.values(data.users).find(
      (item) => item.username.toLowerCase() === normalizedUsername.toLowerCase()
    );
    return user ? toPublicUser(user) : undefined;
  }

  async listUsers(): Promise<PublicUser[]> {
    const data = await this.load();
    return Object.values(data.users)
      .map(toPublicUser)
      .sort((a, b) => a.username.localeCompare(b.username));
  }

  async changePassword(token: string, currentPassword: string, newPassword: string): Promise<PublicUser> {
    assertPassword(newPassword);
    const data = await this.load();
    pruneExpiredSessions(data);
    const tokenHash = hashToken(token);
    const session = Object.values(data.sessions).find((item) => item.tokenHash === tokenHash);
    const user = session ? data.users[session.userId] : undefined;

    if (!user) {
      throw new Error("Unauthorized");
    }

    if (!verifyPassword(currentPassword, user.passwordHash)) {
      throw new Error("Current password is incorrect");
    }

    user.passwordHash = hashPassword(newPassword);
    user.updatedAt = new Date().toISOString();
    await this.save(data);
    return toPublicUser(user);
  }

  async updateProfile(sessionToken: string, input: UpdateProfileInput): Promise<PublicUser> {
    const data = await this.load();
    pruneExpiredSessions(data);
    const user = await this.requireSessionUser(sessionToken, data);

    if (input.displayName !== undefined) {
      const normalized = normalizeProfileField(input.displayName);
      assertDisplayName(normalized);
      user.displayName = normalized;
    }
    if (input.about !== undefined) {
      const normalized = normalizeProfileField(input.about);
      assertAbout(normalized);
      user.about = normalized;
    }

    user.updatedAt = new Date().toISOString();
    await this.save(data);
    return toPublicUser(user);
  }

  async deleteAccount(token: string, password: string): Promise<void> {
    const data = await this.load();
    pruneExpiredSessions(data);
    const tokenHash = hashToken(token);
    const session = Object.values(data.sessions).find((item) => item.tokenHash === tokenHash);
    const user = session ? data.users[session.userId] : undefined;

    if (!user) {
      throw new Error("Unauthorized");
    }

    if (!verifyPassword(password, user.passwordHash)) {
      throw new Error("Current password is incorrect");
    }

    assertCanDeleteUser(user, Object.values(data.users));

    for (const [id, item] of Object.entries(data.sessions)) {
      if (item.userId === user.id) {
        delete data.sessions[id];
      }
    }
    delete data.users[user.id];
    await this.save(data);
  }

  async createEmailVerificationToken(userId: string, expiresMs: number): Promise<string> {
    const data = await this.load();
    const user = data.users[userId];
    if (!user) {
      throw new Error("User not found");
    }
    if (user.emailVerifiedAt) {
      throw new Error("Email already verified");
    }
    if (!user.email) {
      throw new Error("User email is missing");
    }

    const rawToken = `ev_${randomBytes(32).toString("base64url")}`;
    user.pendingEmailVerification = {
      tokenHash: hashToken(rawToken),
      expiresAt: new Date(Date.now() + expiresMs).toISOString()
    };
    user.updatedAt = new Date().toISOString();
    await this.save(data);
    return rawToken;
  }

  async verifyEmail(token: string, sessionUserId?: string): Promise<LoginResult> {
    const data = await this.load();
    const tokenHash = hashToken(token.trim());
    const user = Object.values(data.users).find(
      (item) =>
        item.pendingEmailVerification?.tokenHash === tokenHash ||
        item.usedEmailVerificationTokens?.[tokenHash] !== undefined
    );

    if (!user || !user.email) {
      throw new VerificationTokenError("invalid");
    }

    const nowMs = Date.now();
    const pending = user.pendingEmailVerification;

    if (pending?.tokenHash === tokenHash) {
      if (new Date(pending.expiresAt).getTime() <= nowMs) {
        delete user.pendingEmailVerification;
        await this.save(data);
        throw new VerificationTokenError("invalid");
      }
      if (sessionUserId !== undefined && sessionUserId !== user.id) {
        // 有效链接属于其他已登录账号：作废该链接（删除 pending）。
        delete user.pendingEmailVerification;
        await this.save(data);
        throw new VerificationTokenError("other_account", user.username);
      }
      if (user.emailVerifiedAt) {
        // 历史残留：账号已激活却仍有 pending，按"已使用"处理。
        user.usedEmailVerificationTokens ??= {};
        user.usedEmailVerificationTokens[tokenHash] = {
          usedAt: new Date().toISOString(),
          expiresAt: pending.expiresAt
        };
        delete user.pendingEmailVerification;
        await this.save(data);
        throwUsedVerificationError(sessionUserId, user.id, user.username);
      }

      const now = new Date().toISOString();
      const sessionToken = `skp_${randomBytes(32).toString("base64url")}`;
      const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7).toISOString();
      const session: StoredSession = {
        id: randomUUID(),
        tokenHash: hashToken(sessionToken),
        userId: user.id,
        createdAt: now,
        expiresAt
      };
      data.sessions[session.id] = session;
      pruneExpiredSessions(data);

      user.emailVerifiedAt = now;
      user.emailVerified = true;
      user.updatedAt = now;
      user.usedEmailVerificationTokens ??= {};
      user.usedEmailVerificationTokens[tokenHash] = { usedAt: now, expiresAt: pending.expiresAt };
      delete user.pendingEmailVerification;
      await this.save(data);

      return {
        token: sessionToken,
        user: toPublicUser(user),
        expiresAt
      };
    }

    // 命中"已使用"痕迹：仍在有效期内 → 按归属区分；已过期 → 视为无效。
    const used = user.usedEmailVerificationTokens?.[tokenHash];
    if (used) {
      if (new Date(used.expiresAt).getTime() <= nowMs) {
        delete user.usedEmailVerificationTokens?.[tokenHash];
        await this.save(data);
        throw new VerificationTokenError("invalid");
      }
      throwUsedVerificationError(sessionUserId, user.id, user.username);
    }

    throw new VerificationTokenError("invalid");
  }

  async resendEmailVerification(
    username: string,
    password: string,
    expiresMs: number
  ): Promise<{ user: PublicUser; token: string }> {
    const user = await this.validateUnverifiedUserForVerification(username, password);
    const token = await this.createEmailVerificationToken(user.id, expiresMs);
    const data = await this.load();
    const refreshed = data.users[user.id];
    if (!refreshed) {
      throw new Error("User not found");
    }
    return { user: toPublicUser(refreshed), token };
  }

  async validateUnverifiedUserForVerification(username: string, password: string): Promise<PublicUser> {
    const lookup = resolveLoginIdentifier(username);
    const data = await this.load();
    const user = findUserByIdentifier(Object.values(data.users), lookup.raw);

    if (!user || !verifyPassword(password, user.passwordHash)) {
      throw new Error("Invalid username or password");
    }
    if (user.emailVerifiedAt) {
      throw new Error("Email already verified");
    }
    if (!user.email) {
      throw new Error("User email is missing");
    }

    return toPublicUser(user);
  }

  async requestPasswordReset(identifier: string, expiresMs: number): Promise<{ user: PublicUser; token: string }> {
    const lookup = resolveLoginIdentifier(identifier);
    const data = await this.load();
    const user = findUserByIdentifier(Object.values(data.users), lookup.raw);
    if (!user) {
      throw new Error("Invalid username");
    }
    if (!user.email) {
      throw new Error("User email is missing");
    }

    const rawToken = `pr_${randomBytes(32).toString("base64url")}`;
    user.pendingPasswordReset = {
      tokenHash: hashToken(rawToken),
      expiresAt: new Date(Date.now() + expiresMs).toISOString()
    };
    user.updatedAt = new Date().toISOString();
    await this.save(data);
    return { user: toPublicUser(user), token: rawToken };
  }

  async resetPassword(token: string, newPassword: string): Promise<PublicUser> {
    assertPassword(newPassword);
    const data = await this.load();
    const tokenHash = hashToken(token.trim());
    const user = Object.values(data.users).find(
      (item) => item.pendingPasswordReset?.tokenHash === tokenHash
    );

    if (!user?.pendingPasswordReset) {
      throw new Error("Invalid or expired reset token");
    }
    if (new Date(user.pendingPasswordReset.expiresAt).getTime() <= Date.now()) {
      delete user.pendingPasswordReset;
      await this.save(data);
      throw new Error("Invalid or expired reset token");
    }

    const now = new Date().toISOString();
    user.passwordHash = hashPassword(newPassword);
    delete user.pendingPasswordReset;
    user.updatedAt = now;
    await this.save(data);
    return toPublicUser(user);
  }

  async purgeExpiredUnverifiedUsers(retentionDays: number): Promise<number> {
    if (retentionDays <= 0) {
      return 0;
    }

    const data = await this.load();
    const cutoffMs = Date.now() - retentionDays * 86_400_000;
    const adminCount = Object.values(data.users).filter((user) => user.role === "admin").length;
    let adminsMarkedForDeletion = 0;
    const userIdsToDelete: string[] = [];

    for (const user of Object.values(data.users)) {
      if (user.emailVerifiedAt) {
        continue;
      }
      if (new Date(user.createdAt).getTime() > cutoffMs) {
        continue;
      }
      if (user.role === "admin") {
        if (adminCount - adminsMarkedForDeletion <= 1) {
          continue;
        }
        adminsMarkedForDeletion += 1;
      }
      userIdsToDelete.push(user.id);
    }

    if (userIdsToDelete.length === 0) {
      return 0;
    }

    const deleteSet = new Set(userIdsToDelete);
    for (const userId of userIdsToDelete) {
      delete data.users[userId];
    }
    for (const [sessionId, session] of Object.entries(data.sessions)) {
      if (deleteSet.has(session.userId)) {
        delete data.sessions[sessionId];
      }
    }

    await this.save(data);
    return userIdsToDelete.length;
  }

  async createApiKey(sessionToken: string, options: CreateApiKeyOptions): Promise<CreateApiKeyResult> {
    const data = await this.load();
    const user = await this.requireSessionUser(sessionToken, data);
    const name = assertRequiredApiKeyName(options.name);
    const existingNames = Object.values(data.apiKeys)
      .filter((item) => item.userId === user.id)
      .map((item) => item.name);
    if (isDuplicateApiKeyName(name, existingNames)) {
      throw new Error("API key name already exists");
    }
    const secret = generateApiKeySecret();
    const now = new Date().toISOString();
    const record: StoredApiKey = {
      id: randomUUID(),
      userId: user.id,
      name,
      keyHash: hashApiKey(secret),
      keyPrefix: apiKeyPrefix(secret),
      isActive: true,
      createdAt: now,
      expiresAt: assertApiKeyExpiry(options.expiresAt),
      lastUsedAt: null
    };
    data.apiKeys[record.id] = record;
    await this.save(data);
    return { apiKey: toApiKeySummary(record), secret };
  }

  async listApiKeys(sessionToken: string): Promise<ApiKeySummary[]> {
    const data = await this.load();
    const user = await this.requireSessionUser(sessionToken, data);
    return Object.values(data.apiKeys)
      .filter((item) => item.userId === user.id)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map(toApiKeySummary);
  }

  async updateApiKey(
    sessionToken: string,
    keyId: string,
    patch: { isActive?: boolean }
  ): Promise<ApiKeySummary> {
    const data = await this.load();
    const user = await this.requireSessionUser(sessionToken, data);
    const record = data.apiKeys[keyId];
    if (!record || record.userId !== user.id) {
      throw new Error("API key not found");
    }
    if (patch.isActive !== undefined) {
      record.isActive = patch.isActive;
    }
    await this.save(data);
    return toApiKeySummary(record);
  }

  async deleteApiKey(sessionToken: string, keyId: string): Promise<void> {
    const data = await this.load();
    const user = await this.requireSessionUser(sessionToken, data);
    const record = data.apiKeys[keyId];
    if (!record || record.userId !== user.id) {
      throw new Error("API key not found");
    }
    delete data.apiKeys[keyId];
    await this.save(data);
  }

  private async requireSessionUser(sessionToken: string, data: AuthData): Promise<StoredUser> {
    if (!isSessionCredential(sessionToken)) {
      throw new Error("Session login required");
    }
    pruneExpiredSessions(data);
    const tokenHash = hashToken(sessionToken);
    const session = Object.values(data.sessions).find((item) => item.tokenHash === tokenHash);
    if (!session) {
      throw new Error("Unauthorized");
    }
    const user = data.users[session.userId];
    if (!user) {
      throw new Error("Unauthorized");
    }
    return user;
  }

  private async getUserByApiKey(secret: string, data: AuthData): Promise<PublicUser | undefined> {
    const tokenHash = hashApiKey(secret);
    const record = Object.values(data.apiKeys).find((item) => item.keyHash === tokenHash);
    if (!record || !isApiKeyCurrentlyValid(record)) {
      return undefined;
    }
    record.lastUsedAt = new Date().toISOString();
    const user = data.users[record.userId];
    await this.save(data);
    return user ? toPublicUser(user) : undefined;
  }

  protected abstract load(): Promise<AuthData>;
  protected abstract save(data: AuthData): Promise<void>;
  abstract promoteToAdmin(userId: string): Promise<void>;
}

export class FileAuthStore extends JsonAuthStore {
  private readonly usersPath: string;

  constructor(dataDir = ".data") {
    super();
    const baseDir = path.isAbsolute(dataDir) ? "" : process.env.INIT_CWD ?? process.cwd();
    this.usersPath = path.join(path.resolve(baseDir, dataDir), "users.json");
  }

  protected async load(): Promise<AuthData> {
    try {
      const raw = await readFile(this.usersPath, "utf8");
      return normalizeAuthData(JSON.parse(raw) as AuthData);
    } catch (error) {
      if (isNotFoundError(error)) {
        return structuredClone(emptyAuthData);
      }
      throw error;
    }
  }

  async promoteToAdmin(userId: string): Promise<void> {
    const data = await this.load();
    const user = data.users[userId];
    if (!user) {
      throw new Error("User not found");
    }
    if (user.role !== "admin") {
      user.role = "admin";
      user.updatedAt = new Date().toISOString();
      await this.save(data);
    }
  }

  protected async save(data: AuthData): Promise<void> {
    await mkdir(path.dirname(this.usersPath), { recursive: true });
    const tempPath = `${this.usersPath}.tmp`;
    await writeFile(tempPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
    await rename(tempPath, this.usersPath);
  }
}

type AuthDatabaseTimestamp = Date | string;

interface DatabaseUserRow {
  id: string;
  username: string;
  email: string | null;
  email_verified_at: AuthDatabaseTimestamp | null;
  role: "admin" | "user";
  password_hash: string;
  display_name: string | null;
  about: string | null;
  created_at: AuthDatabaseTimestamp;
  updated_at: AuthDatabaseTimestamp;
}

const USER_COLUMNS =
  "id, username, email, email_verified_at, role, password_hash, display_name, about, created_at, updated_at";
const USER_COLUMNS_U =
  "u.id, u.username, u.email, u.email_verified_at, u.role, u.password_hash, u.display_name, u.about, u.created_at, u.updated_at";

export class PostgresAuthStore implements AuthStore {
  private readonly pool: pg.Pool;
  private schemaReady?: Promise<void>;

  constructor(databaseUrl: string, pool?: pg.Pool) {
    this.pool = pool ?? new pg.Pool({ connectionString: databaseUrl });
  }

  async register(
    username: string,
    password: string,
    email: string,
    options: RegisterOptions = {}
  ): Promise<PublicUser> {
    const normalizedUsername = normalizeUsername(username);
    const normalizedEmail = normalizeEmail(email);
    assertPassword(password);
    await this.ensureSchema();

    const client = await this.pool.connect();
    try {
      await client.query("begin");
      await client.query("select pg_advisory_xact_lock($1::bigint)", [81024001]);
      const count = await client.query<{ count: string }>("select count(*)::text as count from platform_users");
      const existing = await client.query<{ username: string; email: string | null }>(
        `select username, email
         from platform_users
         where lower(username) = lower($1)
            or (email is not null and lower(email) = lower($2))
         limit 1`,
        [normalizedUsername, normalizedEmail]
      );
      if (existing.rows[0]) {
        if (existing.rows[0].username.toLowerCase() === normalizedUsername.toLowerCase()) {
          throw new Error("Username already exists");
        }
        throw new Error("Email already exists");
      }

      const now = new Date().toISOString();
      const emailVerifiedAt = options.autoVerifyEmail === true ? now : null;
      const user: StoredUser = {
        id: randomUUID(),
        username: normalizedUsername,
        email: normalizedEmail,
        emailVerified: emailVerifiedAt !== null,
        emailVerifiedAt,
        role: Number(count.rows[0]?.count ?? 0) === 0 ? "admin" : "user",
        displayName: null,
        about: null,
        passwordHash: hashPassword(password),
        createdAt: now,
        updatedAt: now
      };

      try {
        await client.query(
          `insert into platform_users (id, username, email, email_verified_at, role, password_hash, created_at, updated_at)
           values ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            user.id,
            user.username,
            user.email,
            user.emailVerifiedAt,
            user.role,
            user.passwordHash,
            user.createdAt,
            user.updatedAt
          ]
        );
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw new Error("Username already exists");
        }
        throw error;
      }

      await client.query("commit");
      return toPublicUser(user);
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async login(username: string, password: string): Promise<LoginResult> {
    await this.ensureSchema();
    const lookup = resolveLoginIdentifier(username);
    const result = await this.pool.query<DatabaseUserRow>(
      `select ${USER_COLUMNS}
       from platform_users
       where (lower(username) = lower($1))
          or (email is not null and lower(email) = lower($1))
       limit 1`,
      [lookup.raw]
    );
    const user = result.rows[0];

    if (!user) {
      throw loginError("username");
    }
    if (!verifyPassword(password, user.password_hash)) {
      throw loginError("password");
    }

    if (isRegistrationEmailVerificationRequired() && !user.email_verified_at) {
      throw new Error("Email not verified");
    }

    const token = `skp_${randomBytes(32).toString("base64url")}`;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 1000 * 60 * 60 * 24 * 7).toISOString();
    await this.pool.query("delete from auth_sessions where expires_at <= now()");
    await this.pool.query(
      `insert into auth_sessions (id, token_hash, user_id, created_at, expires_at)
       values ($1, $2, $3, $4, $5)`,
      [randomUUID(), hashToken(token), user.id, now.toISOString(), expiresAt]
    );

    return {
      token,
      user: toPublicDatabaseUser(user),
      expiresAt
    };
  }

  async logout(token: string): Promise<void> {
    if (isApiKeyCredential(token)) {
      return;
    }
    await this.ensureSchema();
    await this.pool.query("delete from auth_sessions where token_hash = $1", [hashToken(token)]);
  }

  async getUserByToken(token: string): Promise<PublicUser | undefined> {
    await this.ensureSchema();
    if (isApiKeyCredential(token)) {
      return this.getUserByApiKey(token);
    }
    await this.pool.query("delete from auth_sessions where expires_at <= now()");
    const result = await this.pool.query<DatabaseUserRow>(
      `select ${USER_COLUMNS_U}
       from auth_sessions s
       join platform_users u on u.id = s.user_id
       where s.token_hash = $1 and s.expires_at > now()
       limit 1`,
      [hashToken(token)]
    );

    return result.rows[0] ? toPublicDatabaseUser(result.rows[0]) : undefined;
  }

  async getUserByUsername(username: string): Promise<PublicUser | undefined> {
    const normalizedUsername = normalizeUsername(username);
    await this.ensureSchema();
    const result = await this.pool.query<DatabaseUserRow>(
      `select ${USER_COLUMNS}
       from platform_users
       where lower(username) = lower($1)
       limit 1`,
      [normalizedUsername]
    );

    return result.rows[0] ? toPublicDatabaseUser(result.rows[0]) : undefined;
  }

  async listUsers(): Promise<PublicUser[]> {
    await this.ensureSchema();
    const result = await this.pool.query<DatabaseUserRow>(
      `select ${USER_COLUMNS}
       from platform_users
       order by lower(username)`
    );

    return result.rows.map(toPublicDatabaseUser);
  }

  async changePassword(token: string, currentPassword: string, newPassword: string): Promise<PublicUser> {
    assertPassword(newPassword);
    await this.ensureSchema();

    const client = await this.pool.connect();
    try {
      await client.query("begin");
      await client.query("delete from auth_sessions where expires_at <= now()");
      const result = await client.query<DatabaseUserRow>(
        `select ${USER_COLUMNS_U}
         from auth_sessions s
         join platform_users u on u.id = s.user_id
         where s.token_hash = $1
         for update`,
        [hashToken(token)]
      );
      const user = result.rows[0];

      if (!user) {
        throw new Error("Unauthorized");
      }
      if (!verifyPassword(currentPassword, user.password_hash)) {
        throw new Error("Current password is incorrect");
      }

      const updatedAt = new Date().toISOString();
      const passwordHash = hashPassword(newPassword);
      await client.query(
        `update platform_users
         set password_hash = $1, updated_at = $2
         where id = $3`,
        [passwordHash, updatedAt, user.id]
      );
      await client.query("commit");

      return toPublicDatabaseUser({
        ...user,
        password_hash: passwordHash,
        updated_at: updatedAt
      });
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async updateProfile(sessionToken: string, input: UpdateProfileInput): Promise<PublicUser> {
    await this.ensureSchema();

    const displayName =
      input.displayName !== undefined ? normalizeProfileField(input.displayName) : undefined;
    const about = input.about !== undefined ? normalizeProfileField(input.about) : undefined;

    if (displayName !== undefined) {
      assertDisplayName(displayName);
    }
    if (about !== undefined) {
      assertAbout(about);
    }

    const client = await this.pool.connect();
    try {
      await client.query("begin");
      await client.query("delete from auth_sessions where expires_at <= now()");
      const result = await client.query<DatabaseUserRow>(
        `select ${USER_COLUMNS_U}
         from auth_sessions s
         join platform_users u on u.id = s.user_id
         where s.token_hash = $1
         for update`,
        [hashToken(sessionToken)]
      );
      const user = result.rows[0];

      if (!user) {
        throw new Error("Unauthorized");
      }

      const updatedAt = new Date().toISOString();
      const nextDisplayName = displayName !== undefined ? displayName : user.display_name;
      const nextAbout = about !== undefined ? about : user.about;

      await client.query(
        `update platform_users
         set display_name = $1, about = $2, updated_at = $3
         where id = $4`,
        [nextDisplayName, nextAbout, updatedAt, user.id]
      );
      await client.query("commit");

      return toPublicDatabaseUser({
        ...user,
        display_name: nextDisplayName,
        about: nextAbout,
        updated_at: updatedAt
      });
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async deleteAccount(token: string, password: string): Promise<void> {
    await this.ensureSchema();

    const client = await this.pool.connect();
    try {
      await client.query("begin");
      await client.query("delete from auth_sessions where expires_at <= now()");
      const result = await client.query<DatabaseUserRow>(
        `select ${USER_COLUMNS_U}
         from auth_sessions s
         join platform_users u on u.id = s.user_id
         where s.token_hash = $1
         for update`,
        [hashToken(token)]
      );
      const user = result.rows[0];

      if (!user) {
        throw new Error("Unauthorized");
      }
      if (!verifyPassword(password, user.password_hash)) {
        throw new Error("Current password is incorrect");
      }

      const adminCount = await client.query<{ count: string }>(
        "select count(*)::text as count from platform_users where role = 'admin'"
      );
      assertCanDeleteUser(
        {
          id: user.id,
          username: user.username,
          email: user.email,
          emailVerified: Boolean(user.email_verified_at),
          role: user.role,
          displayName: user.display_name ?? null,
          about: user.about ?? null,
          createdAt: "",
          updatedAt: ""
        },
        [],
        Number(adminCount.rows[0]?.count ?? 0)
      );

      await client.query("delete from platform_users where id = $1", [user.id]);
      await client.query("commit");
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async createEmailVerificationToken(userId: string, expiresMs: number): Promise<string> {
    await this.ensureSchema();
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const userResult = await client.query<{ id: string; email: string | null; email_verified_at: AuthDatabaseTimestamp | null }>(
        `select id, email, email_verified_at
         from platform_users
         where id = $1
         for update`,
        [userId]
      );
      const user = userResult.rows[0];
      if (!user) {
        throw new Error("User not found");
      }
      if (user.email_verified_at) {
        throw new Error("Email already verified");
      }
      if (!user.email) {
        throw new Error("User email is missing");
      }

      const rawToken = `ev_${randomBytes(32).toString("base64url")}`;
      const now = new Date().toISOString();
      const expiresAt = new Date(Date.now() + expiresMs).toISOString();
      // 只清掉旧的未使用 token，保留 used 行作为"链接已使用"的识别痕迹。
      await client.query(
        "delete from email_verification_tokens where user_id = $1 and used_at is null",
        [userId]
      );
      await client.query(
        `insert into email_verification_tokens (id, user_id, token_hash, expires_at, created_at)
         values ($1, $2, $3, $4, $5)`,
        [randomUUID(), userId, hashToken(rawToken), expiresAt, now]
      );
      await client.query("commit");
      return rawToken;
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async verifyEmail(token: string, sessionUserId?: string): Promise<LoginResult> {
    await this.ensureSchema();
    const tokenHash = hashToken(token.trim());
    const client = await this.pool.connect();
    let user: DatabaseUserRow | undefined;
    try {
      await client.query("begin");
      await client.query("delete from email_verification_tokens where expires_at <= now()");
      const tokenResult = await client.query<{
        user_id: string;
        username: string;
        used_at: AuthDatabaseTimestamp | null;
      }>(
        `select t.user_id, t.used_at, u.username
         from email_verification_tokens t
         join platform_users u on u.id = t.user_id
         where t.token_hash = $1
         limit 1
         for update`,
        [tokenHash]
      );
      const tokenRow = tokenResult.rows[0];
      if (!tokenRow) {
        await client.query("commit");
        throw new VerificationTokenError("invalid");
      }

      // 已被消费（used_at 已标记）：按归属区分场景。
      if (tokenRow.used_at !== null) {
        await client.query("commit");
        throwUsedVerificationError(sessionUserId, tokenRow.user_id, tokenRow.username);
      }

      const ownerResult = await client.query<DatabaseUserRow>(
        `select ${USER_COLUMNS}
         from platform_users
         where id = $1
         for update`,
        [tokenRow.user_id]
      );
      const owner = ownerResult.rows[0];
      if (owner?.email_verified_at) {
        // 历史残留：账号已激活却仍有未标记 token 行 → 补标记并按"已使用"处理。
        await client.query(
          `update email_verification_tokens set used_at = now() where token_hash = $1`,
          [tokenHash]
        );
        await client.query("commit");
        throwUsedVerificationError(sessionUserId, tokenRow.user_id, tokenRow.username);
      }

      if (sessionUserId !== undefined && sessionUserId !== tokenRow.user_id) {
        // 有效链接属于其他已登录账号：删除该 token 行使链接立即失效。
        await client.query("delete from email_verification_tokens where token_hash = $1", [tokenHash]);
        await client.query("commit");
        throw new VerificationTokenError("other_account", tokenRow.username);
      }

      const now = new Date().toISOString();
      await client.query(
        `update platform_users
         set email_verified_at = $1, updated_at = $1
         where id = $2`,
        [now, tokenRow.user_id]
      );
      // 标记已使用而非删除，供后续再次点击识别场景。
      await client.query(
        `update email_verification_tokens set used_at = $1 where token_hash = $2`,
        [now, tokenHash]
      );

      const userResult = await client.query<DatabaseUserRow>(
        `select ${USER_COLUMNS}
         from platform_users
         where id = $1`,
        [tokenRow.user_id]
      );
      user = userResult.rows[0];
      if (!user) {
        throw new Error("User not found");
      }

      await client.query("commit");
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }

    const sessionToken = `skp_${randomBytes(32).toString("base64url")}`;
    const sessionNow = new Date();
    const expiresAt = new Date(sessionNow.getTime() + 1000 * 60 * 60 * 24 * 7).toISOString();
    await this.pool.query("delete from auth_sessions where expires_at <= now()");
    await this.pool.query(
      `insert into auth_sessions (id, token_hash, user_id, created_at, expires_at)
       values ($1, $2, $3, $4, $5)`,
      [randomUUID(), hashToken(sessionToken), user.id, sessionNow.toISOString(), expiresAt]
    );

    return {
      token: sessionToken,
      user: toPublicDatabaseUser(user),
      expiresAt
    };
  }

  async resendEmailVerification(
    username: string,
    password: string,
    expiresMs: number
  ): Promise<{ user: PublicUser; token: string }> {
    const user = await this.validateUnverifiedUserForVerification(username, password);
    const token = await this.createEmailVerificationToken(user.id, expiresMs);
    return { user, token };
  }

  async validateUnverifiedUserForVerification(username: string, password: string): Promise<PublicUser> {
    const lookup = resolveLoginIdentifier(username);
    await this.ensureSchema();
    const result = await this.pool.query<DatabaseUserRow>(
      `select ${USER_COLUMNS}
       from platform_users
       where (lower(username) = lower($1))
          or (email is not null and lower(email) = lower($1))
       limit 1`,
      [lookup.raw]
    );
    const user = result.rows[0];
    if (!user || !verifyPassword(password, user.password_hash)) {
      throw new Error("Invalid username or password");
    }
    if (user.email_verified_at) {
      throw new Error("Email already verified");
    }
    if (!user.email) {
      throw new Error("User email is missing");
    }

    return toPublicDatabaseUser(user);
  }

  async requestPasswordReset(identifier: string, expiresMs: number): Promise<{ user: PublicUser; token: string }> {
    await this.ensureSchema();
    const lookup = resolveLoginIdentifier(identifier);
    const userResult = await this.pool.query<DatabaseUserRow>(
      `select ${USER_COLUMNS}
       from platform_users
       where (lower(username) = lower($1))
          or (email is not null and lower(email) = lower($1))
       limit 1`,
      [lookup.raw]
    );
    const user = userResult.rows[0];
    if (!user) {
      throw new Error("Invalid username");
    }
    if (!user.email) {
      throw new Error("User email is missing");
    }

    const rawToken = `pr_${randomBytes(32).toString("base64url")}`;
    const now = new Date().toISOString();
    const expiresAt = new Date(Date.now() + expiresMs).toISOString();
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      await client.query("delete from password_reset_tokens where user_id = $1", [user.id]);
      await client.query(
        `insert into password_reset_tokens (id, user_id, token_hash, expires_at, created_at)
         values ($1, $2, $3, $4, $5)`,
        [randomUUID(), user.id, hashToken(rawToken), expiresAt, now]
      );
      await client.query("commit");
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }

    return { user: toPublicDatabaseUser(user), token: rawToken };
  }

  async resetPassword(token: string, newPassword: string): Promise<PublicUser> {
    assertPassword(newPassword);
    await this.ensureSchema();
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      await client.query("delete from password_reset_tokens where expires_at <= now()");
      const tokenResult = await client.query<{ user_id: string }>(
        `select user_id
         from password_reset_tokens
         where token_hash = $1 and expires_at > now()
         limit 1
         for update`,
        [hashToken(token.trim())]
      );
      const tokenRow = tokenResult.rows[0];
      if (!tokenRow) {
        throw new Error("Invalid or expired reset token");
      }

      const now = new Date().toISOString();
      const passwordHash = hashPassword(newPassword);
      await client.query(
        `update platform_users
         set password_hash = $1, updated_at = $2
         where id = $3`,
        [passwordHash, now, tokenRow.user_id]
      );
      await client.query("delete from password_reset_tokens where user_id = $1", [tokenRow.user_id]);

      const userResult = await client.query<DatabaseUserRow>(
        `select ${USER_COLUMNS}
         from platform_users
         where id = $1`,
        [tokenRow.user_id]
      );
      const user = userResult.rows[0];
      if (!user) {
        throw new Error("User not found");
      }

      await client.query("commit");
      return toPublicDatabaseUser(user);
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async purgeExpiredUnverifiedUsers(retentionDays: number): Promise<number> {
    if (retentionDays <= 0) {
      return 0;
    }

    await this.ensureSchema();
    const cutoff = new Date(Date.now() - retentionDays * 86_400_000).toISOString();
    const result = await this.pool.query<{ id: string }>(
      `with admin_totals as (
         select count(*)::int as total from platform_users where role = 'admin'
       )
       delete from platform_users u
       where u.email_verified_at is null
         and u.created_at <= $1
         and not (
           u.role = 'admin'
           and (select total from admin_totals) = 1
         )
       returning u.id`,
      [cutoff]
    );

    return result.rowCount ?? result.rows.length;
  }

  async createApiKey(sessionToken: string, options: CreateApiKeyOptions): Promise<CreateApiKeyResult> {
    await this.ensureSchema();
    const user = await this.requireSessionUser(sessionToken);
    const name = assertRequiredApiKeyName(options.name);
    const existing = await this.pool.query<{ name: string }>(
      `select name from api_keys where user_id = $1 and lower(name) = lower($2) limit 1`,
      [user.id, name]
    );
    if (existing.rows.length > 0) {
      throw new Error("API key name already exists");
    }
    const secret = generateApiKeySecret();
    const now = new Date().toISOString();
    const id = randomUUID();
    const expiresAt = assertApiKeyExpiry(options.expiresAt);
    try {
      await this.pool.query(
        `insert into api_keys (id, user_id, name, key_hash, key_prefix, is_active, created_at, expires_at, last_used_at)
         values ($1, $2, $3, $4, $5, true, $6, $7, null)`,
        [id, user.id, name, hashApiKey(secret), apiKeyPrefix(secret), now, expiresAt]
      );
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new Error("API key name already exists");
      }
      throw error;
    }
    return {
      apiKey: {
        id,
        name,
        prefix: apiKeyPrefix(secret),
        isActive: true,
        createdAt: now,
        expiresAt,
        lastUsedAt: null
      },
      secret
    };
  }

  async listApiKeys(sessionToken: string): Promise<ApiKeySummary[]> {
    await this.ensureSchema();
    const user = await this.requireSessionUser(sessionToken);
    const result = await this.pool.query<DatabaseApiKeyRow>(
      `select id, name, key_prefix, is_active, created_at, expires_at, last_used_at
       from api_keys
       where user_id = $1
       order by created_at desc`,
      [user.id]
    );
    return result.rows.map(toApiKeySummaryFromRow);
  }

  async updateApiKey(
    sessionToken: string,
    keyId: string,
    patch: { isActive?: boolean }
  ): Promise<ApiKeySummary> {
    await this.ensureSchema();
    const user = await this.requireSessionUser(sessionToken);
    if (patch.isActive === undefined) {
      throw new Error("Nothing to update");
    }
    const result = await this.pool.query<DatabaseApiKeyRow>(
      `update api_keys
       set is_active = $1
       where id = $2 and user_id = $3
       returning id, name, key_prefix, is_active, created_at, expires_at, last_used_at`,
      [patch.isActive, keyId, user.id]
    );
    const row = result.rows[0];
    if (!row) {
      throw new Error("API key not found");
    }
    return toApiKeySummaryFromRow(row);
  }

  async deleteApiKey(sessionToken: string, keyId: string): Promise<void> {
    await this.ensureSchema();
    const user = await this.requireSessionUser(sessionToken);
    const result = await this.pool.query(
      `delete from api_keys where id = $1 and user_id = $2`,
      [keyId, user.id]
    );
    if ((result.rowCount ?? 0) === 0) {
      throw new Error("API key not found");
    }
  }

  private async requireSessionUser(sessionToken: string): Promise<PublicUser> {
    if (!isSessionCredential(sessionToken)) {
      throw new Error("Session login required");
    }
    await this.pool.query("delete from auth_sessions where expires_at <= now()");
    const result = await this.pool.query<DatabaseUserRow>(
      `select ${USER_COLUMNS_U}
       from auth_sessions s
       join platform_users u on u.id = s.user_id
       where s.token_hash = $1 and s.expires_at > now()
       limit 1`,
      [hashToken(sessionToken)]
    );
    const user = result.rows[0];
    if (!user) {
      throw new Error("Unauthorized");
    }
    return toPublicDatabaseUser(user);
  }

  private async getUserByApiKey(secret: string): Promise<PublicUser | undefined> {
    const result = await this.pool.query<DatabaseApiKeyRow>(
      `select id, user_id, name, key_prefix, is_active, created_at, expires_at, last_used_at
       from api_keys
       where key_hash = $1
       limit 1`,
      [hashApiKey(secret)]
    );
    const key = result.rows[0];
    if (!key) {
      return undefined;
    }
    if (
      !isApiKeyCurrentlyValid({
        isActive: key.is_active,
        expiresAt: toIso(key.expires_at)
      })
    ) {
      return undefined;
    }

    const userResult = await this.pool.query<DatabaseUserRow>(
      `select ${USER_COLUMNS}
       from platform_users
       where id = $1
       limit 1`,
      [key.user_id]
    );
    const user = userResult.rows[0];
    if (!user) {
      return undefined;
    }

    await this.pool.query(`update api_keys set last_used_at = now() where id = $1`, [key.id]);
    return toPublicDatabaseUser(user);
  }

  private async migrateLegacyAuth(client: pg.PoolClient): Promise<void> {
    const migrationName = "auth-json-to-relational-v1";
    const applied = await client.query<{ name: string }>(
      "select name from platform_schema_migrations where name = $1",
      [migrationName]
    );
    if (applied.rows.length > 0) {
      return;
    }

    const existing = await client.query<{ count: string }>("select count(*)::text as count from platform_users");
    const legacyTable = await client.query<{ table_name: string | null }>(
      "select to_regclass('public.auth_state') as table_name"
    );

    if (Number(existing.rows[0]?.count ?? 0) === 0 && legacyTable.rows[0]?.table_name) {
      const result = await client.query<{ document: AuthData }>("select document from auth_state where id = 1");
      const data = normalizeAuthData(result.rows[0]?.document ?? structuredClone(emptyAuthData));

      for (const user of Object.values(data.users)) {
        await client.query(
          `insert into platform_users (id, username, email, email_verified_at, role, password_hash, created_at, updated_at)
           values ($1, $2, $3, $4, $5, $6, $7, $8)
           on conflict (id) do nothing`,
          [
            user.id,
            user.username,
            user.email ?? null,
            user.emailVerifiedAt ?? user.createdAt,
            user.role,
            user.passwordHash,
            user.createdAt,
            user.updatedAt
          ]
        );
      }

      for (const session of Object.values(data.sessions)) {
        await client.query(
          `insert into auth_sessions (id, token_hash, user_id, created_at, expires_at)
           values ($1, $2, $3, $4, $5)
           on conflict (id) do nothing`,
          [session.id, session.tokenHash, session.userId, session.createdAt, session.expiresAt]
        );
      }
    }

    await client.query(
      `insert into platform_schema_migrations (name, applied_at)
       values ($1, now())
       on conflict (name) do nothing`,
      [migrationName]
    );
  }

  private async migrateEmailColumn(client: pg.PoolClient): Promise<void> {
    const migrationName = "auth-add-email-v1";
    const applied = await client.query<{ name: string }>(
      "select name from platform_schema_migrations where name = $1",
      [migrationName]
    );
    if (applied.rows.length > 0) {
      return;
    }

    await client.query(`alter table platform_users add column if not exists email text`);
    await client.query(
      `create unique index if not exists platform_users_email_lower_key
       on platform_users (lower(email))
       where email is not null`
    );

    await client.query(
      `insert into platform_schema_migrations (name, applied_at)
       values ($1, now())
       on conflict (name) do nothing`,
      [migrationName]
    );
  }

  private async migrateEmailVerification(client: pg.PoolClient): Promise<void> {
    const migrationName = "auth-email-verification-v1";
    const applied = await client.query<{ name: string }>(
      "select name from platform_schema_migrations where name = $1",
      [migrationName]
    );
    if (applied.rows.length > 0) {
      return;
    }

    await client.query(`alter table platform_users add column if not exists email_verified_at timestamptz`);
    await client.query(
      `update platform_users
       set email_verified_at = coalesce(email_verified_at, created_at)
       where email_verified_at is null`
    );
    await client.query(`
      create table if not exists email_verification_tokens (
        id text primary key,
        user_id text not null references platform_users(id) on delete cascade,
        token_hash text not null unique,
        expires_at timestamptz not null,
        created_at timestamptz not null,
        used_at timestamptz
      )
    `);
    await client.query(
      `create index if not exists email_verification_tokens_user_id_idx
       on email_verification_tokens (user_id)`
    );
    await client.query(
      `create index if not exists email_verification_tokens_expires_at_idx
       on email_verification_tokens (expires_at)`
    );

    await client.query(
      `insert into platform_schema_migrations (name, applied_at)
       values ($1, now())
       on conflict (name) do nothing`,
      [migrationName]
    );
  }

  private async migrateEmailVerificationUsedAt(client: pg.PoolClient): Promise<void> {
    const migrationName = "auth-email-verification-used-at-v1";
    const applied = await client.query<{ name: string }>(
      "select name from platform_schema_migrations where name = $1",
      [migrationName]
    );
    if (applied.rows.length > 0) {
      return;
    }

    await client.query(
      `alter table email_verification_tokens add column if not exists used_at timestamptz`
    );

    await client.query(
      `insert into platform_schema_migrations (name, applied_at)
       values ($1, now())
       on conflict (name) do nothing`,
      [migrationName]
    );
  }

  private async migratePasswordReset(client: pg.PoolClient): Promise<void> {
    const migrationName = "auth-password-reset-v1";
    const applied = await client.query<{ name: string }>(
      "select name from platform_schema_migrations where name = $1",
      [migrationName]
    );
    if (applied.rows.length > 0) {
      return;
    }

    await client.query(`
      create table if not exists password_reset_tokens (
        id text primary key,
        user_id text not null references platform_users(id) on delete cascade,
        token_hash text not null unique,
        expires_at timestamptz not null,
        created_at timestamptz not null
      )
    `);
    await client.query(
      `create index if not exists password_reset_tokens_user_id_idx
       on password_reset_tokens (user_id)`
    );
    await client.query(
      `create index if not exists password_reset_tokens_expires_at_idx
       on password_reset_tokens (expires_at)`
    );

    await client.query(
      `insert into platform_schema_migrations (name, applied_at)
       values ($1, now())
       on conflict (name) do nothing`,
      [migrationName]
    );
  }

  private async migrateApiKeys(client: pg.PoolClient): Promise<void> {
    const migrationName = "auth-api-keys-v1";
    const applied = await client.query<{ name: string }>(
      "select name from platform_schema_migrations where name = $1",
      [migrationName]
    );
    if (applied.rows.length > 0) {
      return;
    }

    await client.query(`
      create table if not exists api_keys (
        id text primary key,
        user_id text not null references platform_users(id) on delete cascade,
        name text not null default '',
        key_hash text not null unique,
        key_prefix text not null,
        is_active boolean not null default true,
        created_at timestamptz not null,
        expires_at timestamptz,
        last_used_at timestamptz
      )
    `);
    await client.query(
      `create index if not exists api_keys_user_id_idx on api_keys (user_id)`
    );

    await client.query(
      `insert into platform_schema_migrations (name, applied_at)
       values ($1, now())
       on conflict (name) do nothing`,
      [migrationName]
    );
  }

  private async migrateApiKeyUniqueNames(client: pg.PoolClient): Promise<void> {
    const migrationName = "auth-api-keys-unique-name-v1";
    const applied = await client.query<{ name: string }>(
      "select name from platform_schema_migrations where name = $1",
      [migrationName]
    );
    if (applied.rows.length > 0) {
      return;
    }

    await client.query(`
      update api_keys
      set name = 'Key ' || substr(id, 1, 8)
      where trim(name) = ''
    `);
    await client.query(`
      with ranked as (
        select
          id,
          name,
          row_number() over (partition by user_id, lower(name) order by created_at, id) as rn
        from api_keys
      )
      update api_keys as keys
      set name = ranked.name || ' (' || ranked.rn || ')'
      from ranked
      where keys.id = ranked.id
        and ranked.rn > 1
    `);
    await client.query(`
      create unique index if not exists api_keys_user_id_name_lower_key
      on api_keys (user_id, lower(name))
    `);

    await client.query(
      `insert into platform_schema_migrations (name, applied_at)
       values ($1, now())
       on conflict (name) do nothing`,
      [migrationName]
    );
  }

  private async migrateUserProfile(client: pg.PoolClient): Promise<void> {
    const migrationName = "auth-user-profile-v1";
    const applied = await client.query<{ name: string }>(
      "select name from platform_schema_migrations where name = $1",
      [migrationName]
    );
    if (applied.rows.length > 0) {
      return;
    }

    await client.query(`alter table platform_users add column if not exists display_name text`);
    await client.query(`alter table platform_users add column if not exists about text`);

    await client.query(
      `insert into platform_schema_migrations (name, applied_at)
       values ($1, now())
       on conflict (name) do nothing`,
      [migrationName]
    );
  }

  private ensureSchema(): Promise<void> {
    this.schemaReady ??= (async () => {
      const client = await this.pool.connect();
      try {
        await client.query("begin");
        await client.query("select pg_advisory_xact_lock($1::bigint)", [81024002]);
        await client.query(relationalAuthSchema);
        await this.migrateLegacyAuth(client);
        await this.migrateEmailColumn(client);
        await this.migrateEmailVerification(client);
        await this.migrateEmailVerificationUsedAt(client);
        await this.migratePasswordReset(client);
        await this.migrateApiKeys(client);
        await this.migrateApiKeyUniqueNames(client);
        await this.migrateUserProfile(client);
        await client.query("commit");
      } catch (error) {
        await client.query("rollback").catch(() => undefined);
        throw error;
      } finally {
        client.release();
      }
    })().catch((error) => {
      this.schemaReady = undefined;
      throw error;
    });

    return this.schemaReady;
  }

  async promoteToAdmin(userId: string): Promise<void> {
    await this.ensureSchema();
    const result = await this.pool.query(
      `update platform_users set role = 'admin' where id = $1`,
      [userId]
    );
    if (result.rowCount === 0) {
      throw new Error("User not found");
    }
  }
}

const relationalAuthSchema = `
  create table if not exists platform_schema_migrations (
    name text primary key,
    applied_at timestamptz not null default now()
  );

  create table if not exists platform_users (
    id text primary key,
    username text not null,
    role text not null check (role in ('admin', 'user')),
    password_hash text not null,
    created_at timestamptz not null,
    updated_at timestamptz not null
  );

  create unique index if not exists platform_users_username_lower_key
    on platform_users (lower(username));

  create table if not exists auth_sessions (
    id text primary key,
    token_hash text not null unique,
    user_id text not null references platform_users(id) on delete cascade,
    created_at timestamptz not null,
    expires_at timestamptz not null
  );

  create index if not exists auth_sessions_user_id_idx on auth_sessions (user_id);
  create index if not exists auth_sessions_expires_at_idx on auth_sessions (expires_at);
`;

export function createAuthStoreFromEnv(env: NodeJS.ProcessEnv = process.env): AuthStore {
  const storeType = env.REGISTRY_STORE ?? (env.DATABASE_URL ? "postgres" : "file");

  if (storeType === "postgres") {
    if (!env.DATABASE_URL) {
      throw new Error("DATABASE_URL is required when REGISTRY_STORE=postgres");
    }
    return new PostgresAuthStore(env.DATABASE_URL);
  }

  return new FileAuthStore(env.DATA_DIR ?? ".data");
}

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("base64url");
  const hash = scryptSync(password, salt, 64).toString("base64url");
  return `scrypt:${salt}:${hash}`;
}

function verifyPassword(password: string, encoded: string): boolean {
  const [algorithm, salt, hash] = encoded.split(":");
  if (algorithm !== "scrypt" || !salt || !hash) {
    return false;
  }

  const actual = Buffer.from(scryptSync(password, salt, 64).toString("base64url"));
  const expected = Buffer.from(hash);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function normalizeUsername(username: string): string {
  const normalized = username.trim();
  if (!/^[a-zA-Z0-9_.-]{3,64}$/.test(normalized)) {
    throw new Error("Username must be 3-64 characters and contain only letters, numbers, dots, underscores, or hyphens");
  }
  return normalized;
}

/**
 * Login error message honoring LOGIN_ERROR_STRICT. Strict mode (default)
 * always returns the unified message so account existence is not disclosed;
 * lenient mode distinguishes unknown account ("Invalid username") from a
 * wrong password ("Invalid password") for internal migration debugging.
 */
function loginError(reason: "username" | "password"): Error {
  if (isLoginErrorStrict()) {
    return new Error("Invalid username or password");
  }
  return new Error(reason === "username" ? "Invalid username" : "Invalid password");
}

/**
 * Resolve a login identifier that may be either a username or an email address.
 * Returns the trimmed raw value for lookup; format violations surface through
 * loginError("username") so the login endpoint never leaks validation details.
 */
function resolveLoginIdentifier(identifier: string): { raw: string } {
  const raw = identifier.trim();
  try {
    if (raw.includes("@")) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw)) {
        throw loginError("username");
      }
    } else {
      normalizeUsername(raw);
    }
  } catch {
    throw loginError("username");
  }
  return { raw };
}

/** Match a user by username or email (case-insensitive), for file-based stores. */
function findUserByIdentifier<T extends { username: string; email: string | null }>(
  users: T[],
  rawIdentifier: string
): T | undefined {
  const needle = rawIdentifier.toLowerCase();
  return users.find(
    (user) =>
      user.username.toLowerCase() === needle ||
      (user.email !== null && user.email.toLowerCase() === needle)
  );
}

function normalizeEmail(email: string): string {
  const normalized = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    throw new Error("Invalid email address");
  }
  return normalized;
}

function assertPassword(password: string): void {
  if (password.length < 8) {
    throw new Error("Password must be at least 8 characters");
  }
}

const DISPLAY_NAME_MAX = 128;
const ABOUT_MAX = 2000;

function normalizeProfileField(value: string | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function assertDisplayName(value: string | null): void {
  if (value !== null && value.length > DISPLAY_NAME_MAX) {
    throw new Error(`Display name must be at most ${DISPLAY_NAME_MAX} characters`);
  }
}

function assertAbout(value: string | null): void {
  if (value !== null && value.length > ABOUT_MAX) {
    throw new Error(`About must be at most ${ABOUT_MAX} characters`);
  }
}

function assertCanDeleteUser(user: PublicUser, users: PublicUser[], adminCount?: number): void {
  if (user.role !== "admin") {
    return;
  }

  const totalAdmins = adminCount ?? users.filter((item) => item.role === "admin").length;
  if (totalAdmins <= 1) {
    throw new Error("Cannot delete the last administrator account");
  }
}

function pruneExpiredSessions(data: AuthData): void {
  const now = Date.now();
  for (const [id, session] of Object.entries(data.sessions)) {
    if (new Date(session.expiresAt).getTime() <= now) {
      delete data.sessions[id];
    }
  }
}

function toPublicUser(user: StoredUser): PublicUser {
  const emailVerifiedAt = user.emailVerifiedAt ?? null;
  return {
    id: user.id,
    username: user.username,
    email: user.email ?? null,
    emailVerified: emailVerifiedAt !== null,
    role: user.role,
    displayName: user.displayName ?? null,
    about: user.about ?? null,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt
  };
}

function toPublicDatabaseUser(user: DatabaseUserRow): PublicUser {
  const emailVerifiedAt = user.email_verified_at ? toAuthIsoString(user.email_verified_at) : null;
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    emailVerified: emailVerifiedAt !== null,
    role: user.role,
    displayName: user.display_name ?? null,
    about: user.about ?? null,
    createdAt: toAuthIsoString(user.created_at),
    updatedAt: toAuthIsoString(user.updated_at)
  };
}

function toAuthIsoString(value: AuthDatabaseTimestamp): string {
  return value instanceof Date ? value.toISOString() : value;
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "23505";
}

function normalizeAuthData(data: AuthData): AuthData {
  const users: Record<string, StoredUser> = {};
  for (const [id, user] of Object.entries(data.users ?? {})) {
    const emailVerifiedAt =
      user.emailVerifiedAt !== undefined
        ? user.emailVerifiedAt
        : user.emailVerified === false
          ? null
          : user.createdAt ?? null;
    users[id] = {
      ...user,
      email: user.email ?? null,
      displayName: user.displayName ?? null,
      about: user.about ?? null,
      emailVerifiedAt,
      emailVerified: emailVerifiedAt !== null
    };
  }

  return {
    users,
    sessions: data.sessions ?? {},
    apiKeys: data.apiKeys ?? {}
  };
}

interface DatabaseApiKeyRow {
  id: string;
  user_id: string;
  name: string;
  key_prefix: string;
  is_active: boolean;
  created_at: AuthDatabaseTimestamp;
  expires_at: AuthDatabaseTimestamp | null;
  last_used_at: AuthDatabaseTimestamp | null;
}

function toIso(value: AuthDatabaseTimestamp | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  return toAuthIsoString(value);
}

function toApiKeySummary(record: StoredApiKey): ApiKeySummary {
  return {
    id: record.id,
    name: record.name,
    prefix: record.keyPrefix,
    isActive: record.isActive,
    createdAt: record.createdAt,
    expiresAt: record.expiresAt,
    lastUsedAt: record.lastUsedAt
  };
}

function toApiKeySummaryFromRow(row: DatabaseApiKeyRow): ApiKeySummary {
  return {
    id: row.id,
    name: row.name,
    prefix: row.key_prefix,
    isActive: row.is_active,
    createdAt: toAuthIsoString(row.created_at),
    expiresAt: toIso(row.expires_at),
    lastUsedAt: toIso(row.last_used_at)
  };
}

function isNotFoundError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
