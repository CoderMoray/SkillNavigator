import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { FileAuthStore } from "@skill-platform/storage";
import { generatePassword, parseAdminConfig, runBootstrap } from "../scripts/bootstrap-admin.mjs";

/**
 * A minimal RegistryStore fake backed by a slug -> skill map. It models the
 * soft-delete (recycle bin) + purge semantics of the real Postgres store:
 * deleteSkill throws when the slug is absent, purgeRecycleBinSkill throws
 * unless the slug sits in the recycle bin.
 */
class FakeRegistryStore {
  constructor(entries = {}) {
    this.skills = new Map(Object.entries(entries)); // slug -> { slug, ownerUserId }
    this.recycle = new Set();
    this.publishes = [];
    this.deletions = []; // slugs that were permanently purged
  }

  async getSkill(slug) {
    return this.skills.get(slug);
  }

  async deleteSkill(slug) {
    if (this.skills.has(slug)) {
      this.skills.delete(slug);
      this.recycle.add(slug);
      return;
    }
    if (this.recycle.has(slug)) {
      return; // already soft-deleted
    }
    throw new Error(`Skill not found: ${slug}`);
  }

  async purgeRecycleBinSkill(slug) {
    if (this.recycle.has(slug)) {
      this.recycle.delete(slug);
      this.deletions.push(slug);
      return;
    }
    throw new Error(`Skill not in recycle bin: ${slug}`);
  }

  async publishSnapshot(snapshot, review, _evaluation, options) {
    const slug = snapshot.manifest.slug;
    this.publishes.push({ owner: options.owner, version: review.version });
    this.skills.set(slug, { slug, ownerUserId: options.owner.userId, latestVersion: review.version });
    return { version: review.version };
  }
}

const fakeSnapshot = () => ({
  manifest: { slug: "skillnav-skill", name: "skillnav CLI", version: "1.0.0" },
  contentHash: "fake-content-hash",
  files: [],
});

const fakeReview = () => ({ version: "1.0.0", verdict: "approved", findings: [] });

async function emptyAuthStore() {
  const dir = mkdtempSync(path.join(tmpdir(), "skillnav-bootstrap-"));
  const store = new FileAuthStore(dir);
  return { store, dir };
}

describe("bootstrap-admin parseAdminConfig", () => {
  test("accepts a fully populated config", () => {
    expect(
      parseAdminConfig({ ADMIN_USERNAME: "root", ADMIN_EMAIL: "a@b.c", ADMIN_DISPLAY_NAME: "Root" })
    ).toEqual({ username: "root", email: "a@b.c", displayName: "Root" });
  });

  test("returns null when any field is missing/blank", () => {
    expect(parseAdminConfig({ ADMIN_USERNAME: "", ADMIN_EMAIL: "a@b.c", ADMIN_DISPLAY_NAME: "R" })).toBeNull();
    expect(parseAdminConfig({})).toBeNull();
  });
});

describe("bootstrap-admin generatePassword", () => {
  test("produces a 24-char alphanumeric password", () => {
    for (let i = 0; i < 5; i += 1) {
      const password = generatePassword();
      expect(password).toMatch(/^[A-Za-z0-9]{24}$/);
    }
  });
});

describe("runBootstrap (auth store = FileAuthStore)", () => {
  let auth;
  let dir;

  beforeEach(async () => {
    ({ store: auth, dir } = await emptyAuthStore());
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  const deps = (registry) => ({
    authStore: auth,
    registryStore: registry,
    readPackage: async () => fakeSnapshot(),
    reviewSnapshot: async () => fakeReview(),
  });

  const aliceConfig = { username: "alice", email: "alice@example.com", displayName: "Alice Admin" };

  test("missing input -> error missing-input", async () => {
    const registry = new FakeRegistryStore();
    const result = await runBootstrap(deps(registry), { username: "", email: "", displayName: "" });
    expect(result.action).toBe("error");
    expect(result.code).toBe("missing-input");
  });

  test("existing account without any Skill -> linked (publish under that account, account untouched)", async () => {
    const alice = await auth.register("alice", "password123", "alice@example.com", {
      autoVerifyEmail: true,
    });
    const registry = new FakeRegistryStore();
    const before = (await auth.listUsers()).length;

    const result = await runBootstrap(deps(registry), aliceConfig);

    expect(result.action).toBe("linked");
    expect(result.username).toBe("alice");
    expect(registry.publishes).toHaveLength(1);
    expect(registry.publishes[0].owner).toEqual({ userId: alice.id, username: "alice" });
    expect((await auth.listUsers()).length).toBe(before);
  });

  test("existing account that already owns the Skill -> already-linked, no publish", async () => {
    const alice = await auth.register("alice", "password123", "alice@example.com", {
      autoVerifyEmail: true,
    });
    const registry = new FakeRegistryStore({
      "skillnav-skill": { slug: "skillnav-skill", ownerUserId: alice.id },
    });

    const result = await runBootstrap(deps(registry), aliceConfig);

    expect(result.action).toBe("already-linked");
    expect(registry.publishes).toHaveLength(0);
    expect(registry.deletions).toEqual([]);
  });

  test("official Skill owned by someone else -> deleted and re-published under this admin", async () => {
    const alice = await auth.register("alice", "password123", "alice@example.com", {
      autoVerifyEmail: true,
    });
    const registry = new FakeRegistryStore({
      "skillnav-skill": { slug: "skillnav-skill", ownerUserId: "legacy-owner" },
    });

    const result = await runBootstrap(deps(registry), aliceConfig);

    expect(result.action).toBe("linked");
    expect(registry.deletions).toContain("skillnav-skill");
    expect(registry.publishes).toHaveLength(1);
    expect(registry.publishes[0].owner.userId).toBe(alice.id);
    expect(registry.skills.get("skillnav-skill").ownerUserId).toBe(alice.id);
    expect(result.message).toContain("re-assigned");
  });

  test("dev-seed demo-skill residue is removed while official Skill links", async () => {
    const alice = await auth.register("alice", "password123", "alice@example.com", {
      autoVerifyEmail: true,
    });
    const registry = new FakeRegistryStore({
      "demo-skill": { slug: "demo-skill", ownerUserId: alice.id },
    });

    const result = await runBootstrap(deps(registry), aliceConfig);

    expect(result.action).toBe("linked");
    expect(result.cleanedDemo).toBe(true);
    expect(registry.deletions).toContain("demo-skill");
    expect(registry.skills.has("demo-skill")).toBe(false);
    expect(registry.publishes).toHaveLength(1);
    expect(result.message).toContain("demo-skill residue was removed");
  });

  test("demo residue removed even when official Skill is already linked", async () => {
    const alice = await auth.register("alice", "password123", "alice@example.com", {
      autoVerifyEmail: true,
    });
    const registry = new FakeRegistryStore({
      "demo-skill": { slug: "demo-skill", ownerUserId: alice.id },
      "skillnav-skill": { slug: "skillnav-skill", ownerUserId: alice.id },
    });

    const result = await runBootstrap(deps(registry), aliceConfig);

    expect(result.action).toBe("already-linked");
    expect(result.cleanedDemo).toBe(true);
    expect(registry.deletions).toEqual(["demo-skill"]);
    expect(registry.publishes).toHaveLength(0);
  });

  test("no account, no admin -> created-linked (first user admin, verified, display name applied)", async () => {
    const registry = new FakeRegistryStore();
    const result = await runBootstrap(
      deps(registry),
      { username: "root", email: "root@example.com", displayName: "Root Admin" }
    );

    expect(result.action).toBe("created-linked");
    expect(typeof result.password).toBe("string");
    expect(result.password).toHaveLength(24);

    const users = await auth.listUsers();
    expect(users).toHaveLength(1);
    const root = users[0];
    expect(root.username).toBe("root");
    expect(root.role).toBe("admin");
    expect(root.emailVerified).toBe(true);
    expect(root.displayName).toBe("Root Admin");

    expect(registry.publishes).toHaveLength(1);
    expect(registry.publishes[0].owner.userId).toBe(root.id);

    // The generated password must actually log the account in.
    const session = await auth.login("root", result.password);
    expect(session.user.username).toBe("root");
  });

  test("missing username while another admin exists -> creates & promotes a new admin (handover)", async () => {
    await auth.register("root", "password123", "root@example.com", { autoVerifyEmail: true });
    const registry = new FakeRegistryStore();
    const result = await runBootstrap(
      deps(registry),
      { username: "successor", email: "successor@example.com", displayName: "Successor Admin" }
    );

    expect(result.action).toBe("created-linked");
    expect(result.password).toHaveLength(24);

    const users = await auth.listUsers();
    // The new account was created, promoted to admin and owns the Skill;
    // the pre-existing admin is left untouched.
    expect(users).toHaveLength(2);
    const successor = users.find((user) => user.username === "successor");
    expect(successor?.role).toBe("admin");
    expect(successor?.emailVerified).toBe(true);
    expect(users.find((user) => user.username === "root")?.role).toBe("admin");

    expect(registry.publishes).toHaveLength(1);
    expect(registry.publishes[0].owner.userId).toBe(successor.id);
  });

  test("existing non-admin user is reused as the Skill owner (no forced promotion)", async () => {
    await auth.register("root", "password123", "root@example.com", { autoVerifyEmail: true });
    const someone = await auth.register("someone", "password123", "someone@example.com", {
      autoVerifyEmail: true,
    });
    const registry = new FakeRegistryStore();

    const result = await runBootstrap(
      deps(registry),
      { username: "someone", email: "someone@example.com", displayName: "Someone" }
    );

    expect(result.action).toBe("linked");
    const users = await auth.listUsers();
    expect(users).toHaveLength(2);
    // Existing account keeps its role; the Skill simply belongs to it.
    expect(users.find((user) => user.username === "someone")?.role).toBe("user");
    expect(registry.publishes).toHaveLength(1);
    expect(registry.publishes[0].owner.userId).toBe(someone.id);
  });

  test("idempotent: running again after a successful link reports already-linked", async () => {
    const registry = new FakeRegistryStore();
    const admin = { username: "root", email: "root@example.com", displayName: "Root Admin" };
    const first = await runBootstrap(deps(registry), admin);
    expect(first.action).toBe("created-linked");

    const second = await runBootstrap(deps(registry), admin);
    expect(second.action).toBe("already-linked");
    expect(registry.publishes).toHaveLength(1);
    expect((await auth.listUsers())).toHaveLength(1);
  });
});
