// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getLeaderboard, getSkills } from "../../lib/api";
import SkillsPage from "./page";

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={String(href)}>{children}</a>
  )
}));

vi.mock("../../components/AppShell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>
}));

vi.mock("../../lib/api", () => ({
  getSkills: vi.fn(),
  getLeaderboard: vi.fn()
}));

const mockedSkills = vi.mocked(getSkills);
const mockedLeaderboard = vi.mocked(getLeaderboard);

describe("SkillsPage", () => {
  beforeEach(() => {
    mockedSkills.mockReset().mockResolvedValue([]);
    mockedLeaderboard.mockReset().mockResolvedValue([]);
    window.history.replaceState(null, "", "/skills");
  });

  it("从 URL query/category 初始化搜索框与分类选中，并据此查询", async () => {
    window.history.replaceState(null, "", "/skills?query=demo&category=Security");
    render(<SkillsPage />);

    const input = await screen.findByRole("textbox", { name: "搜索 Skill" });
    await waitFor(() => expect(input).toHaveValue("demo"));

    expect(screen.getByRole("button", { name: /Security/ })).toHaveAttribute("aria-pressed", "true");

    await waitFor(() => expect(mockedSkills).toHaveBeenCalledWith("demo", ["Security"]));
  });

  it("无 URL 参数时走榜单查询", async () => {
    render(<SkillsPage />);

    await waitFor(() => expect(mockedLeaderboard).toHaveBeenCalled());
    expect(mockedSkills).not.toHaveBeenCalled();
  });
});
