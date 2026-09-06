// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getBookmarkedSkills, getRecycleBin } from "../lib/api";
import { getAuthToken } from "../lib/auth-token";
import type { CreatorSummary } from "../lib/creators";
import type { PublicUser } from "../lib/types";
import { CreatorProfileView } from "./CreatorProfileView";

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={String(href)}>{children}</a>
  )
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() })
}));

vi.mock("../lib/api", () => ({
  getBookmarkedSkills: vi.fn(),
  getRecycleBin: vi.fn(),
  purgeRecycleBinSkill: vi.fn().mockResolvedValue(undefined),
  restoreSkill: vi.fn().mockResolvedValue(undefined)
}));

vi.mock("../lib/auth-token", () => ({
  getAuthToken: vi.fn()
}));

const mockedBookmarks = vi.mocked(getBookmarkedSkills);
const mockedRecycle = vi.mocked(getRecycleBin);
const mockedToken = vi.mocked(getAuthToken);

function creatorFixture(handle: string): CreatorSummary {
  return { handle, name: "Alice Creator", published: 0, skills: [] } as unknown as CreatorSummary;
}

function userFixture(username: string): PublicUser {
  return { username } as PublicUser;
}

describe("CreatorProfileView", () => {
  beforeEach(() => {
    mockedBookmarks.mockReset().mockResolvedValue([]);
    mockedRecycle.mockReset().mockResolvedValue([]);
    mockedToken.mockReset().mockReturnValue("token");
    window.history.replaceState(null, "", "/creators/alice");
  });

  it("owner 会加载收藏与回收站数据并展示页签计数", async () => {
    render(<CreatorProfileView creator={creatorFixture("alice")} viewer={userFixture("alice")} />);

    await waitFor(() => expect(mockedBookmarks).toHaveBeenCalledTimes(1));
    expect(mockedRecycle).toHaveBeenCalledTimes(1);
    expect(mockedBookmarks).toHaveBeenCalledWith("token");
    expect(mockedRecycle).toHaveBeenCalledWith("token");

    expect(await screen.findByRole("button", { name: "收藏 0" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "回收站 0" })).toBeInTheDocument();
  });

  it("非 owner 不请求收藏/回收站且不显示对应页签", async () => {
    render(<CreatorProfileView creator={creatorFixture("alice")} viewer={userFixture("bob")} />);

    // 等待可能的异步后确认从未发起请求。
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(mockedBookmarks).not.toHaveBeenCalled();
    expect(mockedRecycle).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: /收藏/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /回收站/ })).not.toBeInTheDocument();
  });

  it("URL 带 ?tab=recycle 时 owner 直接落在回收站页签", async () => {
    window.history.replaceState(null, "", "/creators/alice?tab=recycle");
    render(<CreatorProfileView creator={creatorFixture("alice")} viewer={userFixture("alice")} />);

    expect(await screen.findByText(/删除的 Skill 会在回收站保留/)).toBeInTheDocument();
    expect(mockedRecycle).toHaveBeenCalledTimes(1);
  });

  it("点击回收站页签可切换到回收站面板", async () => {
    const user = userEvent.setup();
    render(<CreatorProfileView creator={creatorFixture("alice")} viewer={userFixture("alice")} />);

    await user.click(await screen.findByRole("button", { name: "回收站 0" }));
    expect(screen.getByText(/删除的 Skill 会在回收站保留/)).toBeInTheDocument();
    expect(screen.getByText("回收站为空。")).toBeInTheDocument();
  });
});
