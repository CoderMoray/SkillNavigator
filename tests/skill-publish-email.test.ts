import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  buildSkillPublishEmailPayload,
  FileAuthStore,
  getSkillPublishDetailUrl,
  isSkillPublishEmailConfigured,
  resolveSkillPublishEmailRecipients,
  sendSkillPublishEmail,
  type AuthStore,
  type RegistrySkill,
} from "@skill-platform/storage";

describe("Skill publish email routing", () => {
  let directory: string;
  let authStore: FileAuthStore;

  beforeEach(() => {
    directory = mkdtempSync(path.join(tmpdir(), "skillnav-publish-email-"));
    authStore = new FileAuthStore(directory);
  });

  afterEach(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  it("sends to owner and collaborators and reserves success CC for platform admins", async () => {
    const admin = await authStore.register("admin", "password123", "admin@example.com", {
      autoVerifyEmail: true,
    });
    const author = await authStore.register("author", "password123", "author@example.com", {
      autoVerifyEmail: true,
    });
    const collaborator = await authStore.register("collaborator", "password123", "collaborator@example.com", {
      autoVerifyEmail: true,
    });
    expect(admin.role).toBe("admin");

    const recipients = await resolveSkillPublishEmailRecipients(
      {
        ownerUserId: author.id,
        contributors: [
          { id: "owner", userId: author.id, username: author.username, name: author.username, role: "owner", addedAt: "" },
          {
            id: "collaborator",
            userId: collaborator.id,
            username: collaborator.username,
            name: collaborator.username,
            role: "contributor",
            addedAt: "",
          },
        ],
      },
      authStore
    );

    expect(recipients.to).toEqual(["author@example.com", "collaborator@example.com"]);
    expect(recipients.adminCc).toEqual(["admin@example.com"]);

    const published = buildSkillPublishEmailPayload({
      to: recipients.to,
      adminCc: recipients.adminCc,
      outcome: "published",
      skillName: "Demo",
      slug: "demo-skill",
      version: "1.2.0",
      publiclyListed: true,
      env: { WEB_PUBLIC_URL: "https://example.test/platform/" },
    });
    expect(published.cc).toEqual(["admin@example.com"]);
    expect(published.detailUrl).toBe("https://example.test/platform/skills/demo-skill");

    const rejected = buildSkillPublishEmailPayload({
      ...published,
      adminCc: recipients.adminCc,
      outcome: "rejected",
    });
    expect(rejected.cc).toEqual([]);
  });

  it("does not duplicate an administrator who is already a direct recipient", async () => {
    const owner = await authStore.register("owner", "password123", "owner@example.com", {
      autoVerifyEmail: true,
    });

    const recipients = await resolveSkillPublishEmailRecipients(
      {
        ownerUserId: owner.id,
        contributors: [
          { id: "owner", userId: owner.id, username: owner.username, name: owner.username, role: "owner", addedAt: "" },
        ],
      },
      authStore
    );

    expect(recipients.to).toEqual(["owner@example.com"]);
    expect(recipients.adminCc).toEqual([]);
  });

  it("resolves legacy contributors that only retain a username in name", async () => {
    await authStore.register("admin", "password123", "admin@example.com", {
      autoVerifyEmail: true,
    });
    const author = await authStore.register("author", "password123", "author@example.com", {
      autoVerifyEmail: true,
    });
    const legacyCollaborator = await authStore.register(
      "legacy-collaborator",
      "password123",
      "legacy@example.com",
      { autoVerifyEmail: true }
    );

    const recipients = await resolveSkillPublishEmailRecipients(
      {
        ownerUserId: author.id,
        contributors: [
          { id: "owner", userId: author.id, username: author.username, name: author.username, role: "owner", addedAt: "" },
          {
            id: "legacy",
            name: legacyCollaborator.username,
            role: "contributor",
            addedAt: "",
          },
        ],
      },
      authStore
    );

    expect(recipients.to).toEqual(["author@example.com", "legacy@example.com"]);
  });

  it("allows operators to disable publish notifications independently of SMTP configuration", () => {
    const configured = {
      REPORT_MAIL_USERNAME: "sender@example.com",
      REPORT_MAIL_PASSWORD: "secret",
      REPORT_MAIL_SMTP_SERVER: "smtp.example.com",
      REPORT_MAIL_SMTP_PORT: "465",
    };

    expect(isSkillPublishEmailConfigured(configured)).toBe(true);
    expect(
      isSkillPublishEmailConfigured({
        ...configured,
        SKILL_PUBLISH_EMAIL_NOTIFICATIONS_ENABLED: "false",
      })
    ).toBe(false);
    expect(isSkillPublishEmailConfigured({})).toBe(false);
    expect(getSkillPublishDetailUrl("demo skill", { WEB_PUBLIC_URL: "https://example.test/base/" })).toBe(
      "https://example.test/base/skills/demo%20skill"
    );
  });

  it("skips delivery when SMTP is not configured instead of affecting publish", async () => {
    const result = await sendSkillPublishEmail({
      authStore: {} as AuthStore,
      skill: {
        slug: "demo-skill",
        name: "Demo",
        versions: {},
      } as RegistrySkill,
      version: "1.0.0",
      outcome: "published",
      publiclyListed: true,
      env: {},
    });

    expect(result).toEqual({ sent: false, reason: "not_configured" });
  });
});
