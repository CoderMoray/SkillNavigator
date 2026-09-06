// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getCurrentUser, logoutUser } from "../lib/api";
import { clearAuthToken, getAuthToken } from "../lib/auth-token";
import type { PublicUser } from "../lib/types";
import { AuthStatus } from "./AuthStatus";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={String(href)} {...rest}>
      {children}
    </a>
  )
}));

vi.mock("../lib/api", () => ({
  getCurrentUser: vi.fn(),
  logoutUser: vi.fn().mockResolvedValue(undefined)
}));

vi.mock("../lib/auth-token", () => ({
  getAuthToken: vi.fn(),
  clearAuthToken: vi.fn(),
  AUTH_TOKEN_CHANGED_EVENT: "auth-token-changed-test"
}));

const mockedGetCurrentUser = vi.mocked(getCurrentUser);
const mockedLogout = vi.mocked(logoutUser);
const mockedGetAuthToken = vi.mocked(getAuthToken);
const mockedClearAuthToken = vi.mocked(clearAuthToken);

function makeUser(username: string): PublicUser {
  return { username } as PublicUser;
}

describe("AuthStatus", () => {
  beforeEach(() => {
    window.localStorage.clear();
    mockedGetCurrentUser.mockReset();
    mockedLogout.mockReset().mockResolvedValue(undefined);
    mockedGetAuthToken.mockReset();
    mockedClearAuthToken.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("未登录时展示登录/注册入口", async () => {
    mockedGetAuthToken.mockReturnValue(undefined);
    render(<AuthStatus />);

    expect(await screen.findByRole("link", { name: /登录/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /注册/ })).toBeInTheDocument();
  });

  it("已登录时展示用户名菜单，可登出", async () => {
    // jsdom 的 location.reload 不可重定义：用带完整原字段的替身替换（保留 origin，
    // 避免 localStorage 因 opaque origin 抛错），登出后断言 reload 被调用。
    const reloadMock = vi.fn();
    vi.stubGlobal("location", { ...window.location, reload: reloadMock });

    mockedGetAuthToken.mockReturnValue("token-1");
    mockedGetCurrentUser.mockResolvedValue(makeUser("alice"));
    const user = userEvent.setup();
    render(<AuthStatus />);

    const trigger = await screen.findByRole("button", { name: /alice/ });
    await user.click(trigger);

    await user.click(screen.getByRole("menuitem", { name: /登出/ }));
    expect(mockedClearAuthToken).toHaveBeenCalledTimes(1);
    expect(mockedLogout).toHaveBeenCalledWith("token-1");
    expect(reloadMock).toHaveBeenCalled();
  });

  it("应用本地存储的主题偏好", async () => {
    window.localStorage.setItem("skill-platform-theme", "dark");
    mockedGetAuthToken.mockReturnValue("token-1");
    mockedGetCurrentUser.mockResolvedValue(makeUser("alice"));
    const user = userEvent.setup();
    render(<AuthStatus />);

    // 主题切换按钮位于登录后的用户菜单内。
    const trigger = await screen.findByRole("button", { name: /alice/ });
    await user.click(trigger);

    const darkButton = screen.getByRole("button", { name: "深色主题" });
    expect(darkButton).toHaveClass("active");
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(document.documentElement.dataset.themeMode).toBe("dark");
  });
});
