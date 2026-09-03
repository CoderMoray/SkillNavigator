/// <reference types="node" />

import { expect, test, type Page } from "@playwright/test";
import path from "node:path";

const API_BASE_URL = process.env.E2E_API_BASE_URL ?? "http://127.0.0.1:3000";
const E2E_USERNAME = process.env.E2E_USERNAME ?? "alice";
const E2E_PASSWORD = process.env.E2E_PASSWORD ?? "password123";

/** Build an API URL preserving any base path prefix (e.g. "/MonoSkillNavigator/api"). */
function apiUrl(path: string): URL {
  return new URL(path.replace(/^\/+/, ""), `${API_BASE_URL.replace(/\/+$/, "")}/`);
}
const DOC_SLUGS = [
  "skill-navigator",
  "quick-start-tutorial",
  "cli-guide",
  "platform-agent-prompt",
  "skill-format",
  "publish-workflow",
  "security-scan",
  "halucatch-review"
] as const;

interface SkillFixture {
  slug: string;
  name: string;
  status: string;
}

interface CreatorFixture {
  handle: string;
  name: string;
  published: number;
}

interface SiteFixtures {
  skill: SkillFixture;
  creator: CreatorFixture;
}

async function loadFixtures(): Promise<SiteFixtures> {
  const [skillsResponse, creatorsResponse] = await Promise.all([
    fetch(apiUrl("/skills")),
    fetch(apiUrl("/creators"))
  ]);

  expect(skillsResponse.ok, "The API must expose at least one Skill for route coverage.").toBeTruthy();
  expect(creatorsResponse.ok, "The API must expose at least one Creator for route coverage.").toBeTruthy();

  const skills = (await skillsResponse.json()) as { items: SkillFixture[] };
  const creators = (await creatorsResponse.json()) as { items: CreatorFixture[] };
  const skill = skills.items.find((item) => item.status === "published") ?? skills.items[0];
  const creator = creators.items.find((item) => item.published > 0) ?? creators.items[0];

  expect(skill, "No Skill is available for dynamic-page coverage.").toBeDefined();
  expect(creator, "No Creator is available for dynamic-page coverage.").toBeDefined();

  return { skill: skill!, creator: creator! };
}

function monitorRuntimeErrors(page: Page): string[] {
  const errors: string[] = [];

  page.on("pageerror", (error) => {
    errors.push(`Uncaught error: ${error.message}`);
  });
  page.on("console", (message) => {
    if (message.type() === "error") {
      errors.push(`Console error: ${message.text()} (${message.location().url})`);
    }
  });
  page.on("response", (response) => {
    if (response.status() >= 400) {
      errors.push(`HTTP ${response.status()}: ${response.url()}`);
    }
  });

  return errors;
}

async function visit(page: Page, pathName: string): Promise<void> {
  const response = await page.goto(pathName);
  expect(response, `No document response when opening ${pathName}.`).not.toBeNull();
  expect(response!.status(), `${pathName} returned an HTTP error.`).toBeLessThan(400);
  await expect(page.locator("main")).toBeVisible();
}

function expectNoRuntimeErrors(errors: string[]): void {
  expect(errors, errors.join("\n")).toEqual([]);
}

test.describe.serial("MonoSkillNavigator browser flows", () => {
  test("shows a visible home-page error when leaderboard loading fails", async ({ page }) => {
    await page.route(
      (url) =>
        url.origin === API_BASE_URL &&
        url.pathname === "/leaderboard" &&
        url.searchParams.get("sort") === "downloads" &&
        url.searchParams.get("limit") === "12",
      async (route) => {
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ error: "E2E leaderboard unavailable" })
        });
      }
    );

    await visit(page, "/");
    await expect(page.getByText("E2E leaderboard unavailable")).toBeVisible();
    await expect(page.getByText(/请确认 API 已通过 npm run dev:api 启动。/)).toBeVisible();
  });

  test("loads all public, documentation, and dynamic pages", async ({ page }) => {
    const errors = monitorRuntimeErrors(page);
    const { creator, skill } = await loadFixtures();

    await visit(page, "/");
    await expect(page.getByRole("heading", { name: "发现可信Skill，放心复用" })).toBeVisible();
    await page.getByRole("textbox", { name: "搜索 Skill" }).fill(skill.name);
    await page.getByRole("textbox", { name: "搜索 Skill" }).press("Enter");
    await expect(page).toHaveURL(new RegExp(`/skills\\?query=${encodeURIComponent(skill.name)}`));
    await expect(page.getByText(skill.name).first()).toBeVisible();

    await visit(page, "/skills");
    await expect(page.getByRole("button", { name: "Plugins", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Plugins", exact: true }).click();
    await expect(page.getByText("Plugins 页面正在建设中，当前先开放 Skills 市场。")).toBeVisible();
    await page.getByRole("button", { name: "Skills", exact: true }).click();
    await expect(page.getByText(skill.name).first()).toBeVisible();

    await visit(page, "/creators");
    await expect(page.getByText(creator.name).first()).toBeVisible();
    await page.getByRole("textbox", { name: "搜索 Creator" }).fill(creator.handle);
    await expect(page.getByText(`@${creator.handle}`)).toBeVisible();

    await visit(page, `/creators/${encodeURIComponent(creator.handle)}`);
    await expect(page.getByRole("heading", { name: creator.name, exact: true })).toBeVisible();

    await visit(page, "/leaderboard");
    await expect(page.getByRole("heading", { name: "Skill 榜单" })).toBeVisible();
    await page.getByRole("button", { name: "排序方式" }).click();
    await page.getByRole("option", { name: "用户评分" }).click();
    await expect(page.getByRole("button", { name: "排序方式" })).toContainText("用户评分");

    await visit(page, "/reviews");
    await expect(page.getByRole("checkbox", { name: "全选全部 Skill" })).toBeVisible();
    await page.getByRole("checkbox", { name: "全选全部 Skill" }).check();
    await expect(page.getByText(/已选 \d+ 条/)).toBeVisible();

    await visit(page, `/skills/${encodeURIComponent(skill.slug)}`);
    await expect(
      page.locator(".skill-detail-hero").getByRole("heading", { name: skill.name, exact: true })
    ).toBeVisible();
    for (const tabName of ["Skill Card", "Files", "Versions", "审查与评估", "Issue 与评分"]) {
      await page.getByRole("tab", { name: tabName }).click();
      await expect(page.getByRole("tabpanel")).toContainText(tabName);
    }

    await visit(page, `/skills/${encodeURIComponent(skill.slug)}/halucatch`);
    await expect(page.locator(".error")).toHaveCount(0);
    await expect(
      page.getByText(/HaluCatch 完整报告|该版本暂无 HaluCatch 完整报告/)
    ).toBeVisible();

    await visit(page, "/docs");
    await expect(page).toHaveURL(/\/docs\/skill-navigator$/);
    await expect(page.locator("article")).toBeVisible();
    for (const slug of DOC_SLUGS) {
      await visit(page, `/docs/${slug}`);
      await expect(page.locator("article")).toBeVisible();
    }

    await visit(page, "/login");
    await expect(page.getByRole("heading", { name: "登录 Skill 管理平台" })).toBeVisible();
    await visit(page, "/register");
    await expect(page.getByRole("heading", { name: "注册平台用户" })).toBeVisible();
    await visit(page, "/register/pending?email=e2e-route@example.test");
    await expect(page.getByRole("heading", { name: "请验证邮箱" })).toBeVisible();
    await expect(page.getByText(/e2e-route@example\.test/)).toBeVisible();
    await visit(page, "/forgot-password");
    await expect(page.getByRole("heading", { name: "重置密码" })).toBeVisible();
    await visit(page, "/reset-password");
    await expect(page.getByText("重置链接无效或缺少 token。")).toBeVisible();
    await visit(page, "/verify-email");
    await expect(page.getByRole("heading", { name: "验证失败" })).toBeVisible();

    await visit(page, "/account");
    await expect(page.getByRole("heading", { name: "尚未登录" })).toBeVisible();
    await visit(page, "/account/settings");
    await expect(page).toHaveURL(/\/account\/settings\/profile$/);
    await expect(page.getByRole("heading", { name: "请先登录" })).toBeVisible();
    for (const settingsPath of [
      "/account/settings/api-keys",
      "/account/settings/password",
      "/account/settings/delete"
    ]) {
      await visit(page, settingsPath);
      await expect(page.getByRole("heading", { name: "请先登录" })).toBeVisible();
    }
    for (const [legacyPath, settingsPath] of [
      ["/account/api-keys", "/account/settings/api-keys"],
      ["/account/change-password", "/account/settings/password"],
      ["/account/delete", "/account/settings/delete"]
    ]) {
      await visit(page, legacyPath);
      await expect(page).toHaveURL(new RegExp(`${settingsPath}$`));
      await expect(page.getByRole("heading", { name: "请先登录" })).toBeVisible();
    }
    await visit(page, "/skills/publish");
    await expect(page.getByRole("heading", { name: "请先登录" })).toBeVisible();

    expectNoRuntimeErrors(errors);
  });

  test("logs in with a local fixture and loads authenticated pages", async ({ page }) => {
    const errors = monitorRuntimeErrors(page);

    await visit(page, "/login");
    await page.getByLabel("用户名或邮箱").fill(E2E_USERNAME);
    await page.getByLabel("密码").fill(E2E_PASSWORD);
    await page.getByRole("button", { name: "登录" }).click();
    await expect(page).toHaveURL(new RegExp(`/creators/${encodeURIComponent(E2E_USERNAME)}$`));

    await visit(page, "/account");
    await expect(page).toHaveURL(new RegExp(`/creators/${encodeURIComponent(E2E_USERNAME)}$`));

    await visit(page, "/account/settings");
    await expect(page).toHaveURL(/\/account\/settings\/profile$/);
    await expect(page.getByRole("heading", { name: "账户" })).toBeVisible();

    await visit(page, "/account/settings/api-keys");
    await expect(page.getByRole("heading", { name: "API 密钥" })).toBeVisible();
    await page.getByRole("button", { name: "创建 API 密钥" }).click();
    const createKeyDialog = page.getByRole("dialog", { name: "创建 API 密钥" });
    await expect(createKeyDialog).toBeVisible();
    await createKeyDialog.getByRole("button", { name: "关闭" }).click();
    await expect(createKeyDialog).toHaveCount(0);

    await visit(page, "/account/settings/password");
    await expect(page.getByRole("heading", { name: "修改密码" })).toBeVisible();

    await visit(page, "/account/settings/delete");
    await expect(page.getByRole("heading", { name: "注销账户" })).toBeVisible();

    await visit(page, "/skills/publish");
    await expect(page.getByRole("heading", { name: "添加 Skill" })).toBeVisible();
    await page
      .locator('input[type="file"][accept=".zip,application/zip"]')
      .setInputFiles(path.resolve("examples/demo-skill.zip"));
    await expect(page.getByLabel("Display Name")).toHaveValue("Demo Skill");

    const { skill } = await loadFixtures();
    await visit(page, `/skills/publish?skill=${encodeURIComponent(skill.slug)}`);
    await expect(
      page.getByRole("heading", { name: /发布 .+ 的新版本|无权发布新版本/ })
    ).toBeVisible();

    expectNoRuntimeErrors(errors);
  });
});
