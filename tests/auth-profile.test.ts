import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { FileAuthStore } from "@skill-platform/storage";

describe("updateProfile (FileAuthStore)", () => {
  let dir: string;
  let store: FileAuthStore;

  beforeEach(async () => {
    dir = mkdtempSync(path.join(tmpdir(), "skillnav-profile-"));
    store = new FileAuthStore(dir);
    await store.register("alice", "password123", "alice@example.com", {
      autoVerifyEmail: true,
    });
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test("updates display name and about via session token", async () => {
    const session = await store.login("alice", "password123");
    const updated = await store.updateProfile(session.token, {
      displayName: "Alice Chen",
      about: "Building agent skills.",
    });

    expect(updated.displayName).toBe("Alice Chen");
    expect(updated.about).toBe("Building agent skills.");
    expect(updated.username).toBe("alice");

    const me = await store.getUserByToken(session.token);
    expect(me?.displayName).toBe("Alice Chen");
    expect(me?.about).toBe("Building agent skills.");
  });

  test("clears fields when empty strings are sent", async () => {
    const session = await store.login("alice", "password123");
    await store.updateProfile(session.token, {
      displayName: "Alice Chen",
      about: "Bio",
    });

    const cleared = await store.updateProfile(session.token, {
      displayName: "   ",
      about: "",
    });

    expect(cleared.displayName).toBeNull();
    expect(cleared.about).toBeNull();
  });

  test("rejects API key for profile updates", async () => {
    const session = await store.login("alice", "password123");
    const created = await store.createApiKey(session.token, { name: "cli" });

    await expect(
      store.updateProfile(created.secret, { displayName: "Nope" })
    ).rejects.toThrow("Session login required");
  });
});
