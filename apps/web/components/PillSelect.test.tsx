// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PillSelect } from "./PillSelect";

const options = [
  { value: "a", label: "选项 A" },
  { value: "b", label: "选项 B" }
];

describe("PillSelect", () => {
  it("展示当前选中项，点击选项触发 onChange 并收起菜单", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<PillSelect ariaLabel="选择类型" options={options} value="a" onChange={onChange} />);

    expect(screen.getByRole("button", { name: "选择类型" })).toHaveTextContent("选项 A");

    await user.click(screen.getByRole("button", { name: "选择类型" }));
    await user.click(screen.getByRole("option", { name: "选项 B" }));

    expect(onChange).toHaveBeenCalledWith("b");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("点击组件外部区域会收起菜单", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
      <>
        <div data-testid="outside" />
        <PillSelect ariaLabel="选择类型" options={options} value="a" onChange={onChange} />
      </>
    );

    await user.click(screen.getByRole("button", { name: "选择类型" }));
    expect(screen.getByRole("listbox")).toBeInTheDocument();

    await user.click(screen.getByTestId("outside"));
    await waitFor(() => expect(screen.queryByRole("listbox")).not.toBeInTheDocument());
  });

  it("disabled 后关闭已打开的菜单且不可再打开", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    const { rerender } = render(
      <PillSelect ariaLabel="选择类型" disabled={false} options={options} value="a" onChange={onChange} />
    );

    const trigger = screen.getByRole("button", { name: "选择类型" });
    await user.click(trigger);
    expect(screen.getByRole("listbox")).toBeInTheDocument();

    rerender(<PillSelect ariaLabel="选择类型" disabled options={options} value="a" onChange={onChange} />);

    await waitFor(() => expect(screen.getByRole("button", { name: "选择类型" })).toHaveAttribute("aria-expanded", "false"));
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "选择类型" }));
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });
});
