import { randomBytes, createHash } from "node:crypto";

export interface ApiKeySummary {
  id: string;
  name: string;
  prefix: string;
  isActive: boolean;
  createdAt: string;
  expiresAt: string | null;
  lastUsedAt: string | null;
}

export interface CreateApiKeyOptions {
  name: string;
  expiresAt?: string | null;
}

export interface CreateApiKeyResult {
  apiKey: ApiKeySummary;
  secret: string;
}

export function isApiKeyCredential(credential: string): boolean {
  return credential.startsWith("sk_") && !credential.startsWith("skp_");
}

export function isSessionCredential(credential: string): boolean {
  return credential.startsWith("skp_");
}

export function generateApiKeySecret(): string {
  return `sk_${randomBytes(32).toString("base64url")}`;
}

export function hashApiKey(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

export function apiKeyPrefix(secret: string): string {
  if (secret.length <= 12) {
    return secret;
  }
  return `${secret.slice(0, 8)}…${secret.slice(-4)}`;
}

export function assertRequiredApiKeyName(name: string | undefined): string {
  const trimmed = (name ?? "").trim();
  if (!trimmed) {
    throw new Error("API key name is required");
  }
  if (trimmed.length > 64) {
    throw new Error("API key name must be 1–64 characters");
  }
  return trimmed;
}

export function isDuplicateApiKeyName(name: string, existingNames: string[]): boolean {
  const normalized = name.trim().toLowerCase();
  return existingNames.some((item) => item.trim().toLowerCase() === normalized);
}

export function assertApiKeyExpiry(expiresAt: string | null | undefined): string | null {
  if (expiresAt === undefined || expiresAt === null || expiresAt === "") {
    return null;
  }
  const parsed = new Date(expiresAt);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error("Invalid API key expiry time");
  }
  if (parsed.getTime() <= Date.now()) {
    throw new Error("API key expiry must be in the future");
  }
  return parsed.toISOString();
}

export function isApiKeyCurrentlyValid(record: {
  isActive: boolean;
  expiresAt: string | null;
}): boolean {
  if (!record.isActive) {
    return false;
  }
  if (record.expiresAt && new Date(record.expiresAt).getTime() <= Date.now()) {
    return false;
  }
  return true;
}
