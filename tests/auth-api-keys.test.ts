import { describe, expect, it } from "vitest";
import {
  apiKeyPrefix,
  assertApiKeyExpiry,
  assertRequiredApiKeyName,
  generateApiKeySecret,
  hashApiKey,
  isApiKeyCredential,
  isApiKeyCurrentlyValid,
  isDuplicateApiKeyName,
  isSessionCredential,
} from "../packages/storage/src/api-keys.js";

describe("API key helpers", () => {
  it("distinguishes session tokens from API keys", () => {
    expect(isSessionCredential("skp_abc")).toBe(true);
    expect(isApiKeyCredential("sk_abc")).toBe(true);
    expect(isApiKeyCredential("skp_abc")).toBe(false);
  });

  it("generates sk_ prefixed secrets", () => {
    const secret = generateApiKeySecret();
    expect(secret.startsWith("sk_")).toBe(true);
    expect(hashApiKey(secret)).toHaveLength(64);
    expect(apiKeyPrefix(secret)).toContain("sk_");
  });

  it("validates active/expired keys", () => {
    expect(
      isApiKeyCurrentlyValid({
        isActive: true,
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      })
    ).toBe(true);
    expect(
      isApiKeyCurrentlyValid({
        isActive: false,
        expiresAt: null,
      })
    ).toBe(false);
  });

  it("rejects past expiry values on create", () => {
    expect(() => assertApiKeyExpiry(new Date(Date.now() - 1000).toISOString())).toThrow(
      /future/i
    );
  });

  it("requires a non-empty API key name", () => {
    expect(() => assertRequiredApiKeyName(undefined)).toThrow(/required/i);
    expect(() => assertRequiredApiKeyName("   ")).toThrow(/required/i);
    expect(assertRequiredApiKeyName("  MacBook CLI  ")).toBe("MacBook CLI");
  });

  it("detects duplicate API key names case-insensitively", () => {
    expect(isDuplicateApiKeyName("MacBook", ["macbook"])).toBe(true);
    expect(isDuplicateApiKeyName("MacBook", ["Work Laptop"])).toBe(false);
  });
});
