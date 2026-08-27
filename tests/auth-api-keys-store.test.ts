import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createAuthStoreFromEnv } from "../packages/storage/src/auth.js";
import { isApiKeyCredential } from "../packages/storage/src/api-keys.js";

describe("AuthStore API keys", () => {
  it("accepts API keys for getUserByToken and supports deactivate", async () => {
    const dataDir = mkdtempSync(path.join(tmpdir(), "skillnav-api-keys-"));
    const store = createAuthStoreFromEnv({ REGISTRY_STORE: "file", DATA_DIR: dataDir });
    await store.register("alice", "password123", "alice@example.com", { autoVerifyEmail: true });
    const session = await store.login("alice", "password123");
    const created = await store.createApiKey(session.token, { name: "integration" });

    expect(isApiKeyCredential(created.secret)).toBe(true);
    expect((await store.getUserByToken(created.secret))?.username).toBe("alice");

    const listed = await store.listApiKeys(session.token);
    expect(listed.some((item) => item.id === created.apiKey.id)).toBe(true);

    await store.updateApiKey(session.token, created.apiKey.id, { isActive: false });
    expect(await store.getUserByToken(created.secret)).toBeUndefined();
  });

  it("rejects duplicate API key names for the same user", async () => {
    const dataDir = mkdtempSync(path.join(tmpdir(), "skillnav-api-keys-dup-"));
    const store = createAuthStoreFromEnv({ REGISTRY_STORE: "file", DATA_DIR: dataDir });
    await store.register("alice", "password123", "alice@example.com", { autoVerifyEmail: true });
    const session = await store.login("alice", "password123");
    await store.createApiKey(session.token, { name: "MacBook CLI" });

    await expect(store.createApiKey(session.token, { name: "macbook cli" })).rejects.toThrow(
      /already exists/i
    );
  });
});
