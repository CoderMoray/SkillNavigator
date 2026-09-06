// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { searchUsers } from "../lib/api";
import { getAuthToken } from "../lib/auth-token";
import type { UserSearchResult } from "../lib/types";
import { UsernameSuggestInput } from "./UsernameSuggestInput";

vi.mock("../lib/api", () => ({
  searchUsers: vi.fn()
}));

vi.mock("../lib/auth-token", () => ({
  getAuthToken: vi.fn()
}));

function makeUser(username: string, displayName?: string): UserSearchResult {
  return { username, displayName } as UserSearchResult;
}

const mockedSearch = vi.mocked(searchUsers);
const mockedGetAuthToken = vi.mocked(getAuthToken);

// 组件是受控输入：需要一个真实父组件持有 value 状态，type 才有效。
function Harness({
  onChange,
  excludeHandles
}: {
  onChange: (value: string) => void;
  excludeHandles?: string[];
}) {
  const [value, setValue] = useState("");
  return (
    <UsernameSuggestInput
      excludeHandles={excludeHandles}
      onChange={(next) => {
        setValue(next);
        onChange(next);
      }}
      value={value}
    />
  );
}

describe("UsernameSuggestInput", () => {
  beforeEach(() => {
    mockedSearch.mockReset();
    mockedGetAuthToken.mockReset().mockReturnValue("test-token");
  });

  it("输入查询后防抖加载并展示建议（过滤 excludeHandles）", async () => {
    mockedSearch.mockResolvedValue([makeUser("bob", "Bob"), makeUser("carol")]);
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Harness excludeHandles={["bob"]} onChange={onChange} />);

    const input = screen.getByRole("combobox");
    await user.type(input, "b");

    await screen.findByText("@carol");
    expect(screen.queryByText("@bob")).not.toBeInTheDocument();
    expect(mockedSearch).toHaveBeenCalledWith("test-token", "b");
  });

  it("点击建议会回填用户名并关闭菜单", async () => {
    mockedSearch.mockResolvedValue([makeUser("bob")]);
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Harness onChange={onChange} />);

    const input = screen.getByRole("combobox");
    await user.type(input, "bo");
    await screen.findByRole("option", { name: /@bob/ });

    await user.click(screen.getByRole("option", { name: /@bob/ }));
    expect(onChange).toHaveBeenCalledWith("bob");
    await waitFor(() => expect(screen.queryByRole("listbox")).not.toBeInTheDocument());
  });

  it("无 token 时不发起搜索", async () => {
    mockedGetAuthToken.mockReturnValue(undefined);
    mockedSearch.mockResolvedValue([]);
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<UsernameSuggestInput value="" onChange={onChange} />);

    await user.type(screen.getByRole("combobox"), "b");
    // 等待可能存在的 debounce 触发后，断言没有任何搜索调用。
    await new Promise((resolve) => setTimeout(resolve, 350));
    expect(mockedSearch).not.toHaveBeenCalled();
  });
});
