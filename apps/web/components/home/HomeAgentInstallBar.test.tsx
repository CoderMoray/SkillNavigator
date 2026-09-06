// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { copyTextToClipboard } from "../../lib/copy-text";
import { HomeAgentInstallBar } from "./HomeAgentInstallBar";

vi.mock("../../lib/copy-text", () => ({
  copyTextToClipboard: vi.fn()
}));

const mockedCopy = vi.mocked(copyTextToClipboard);

describe("HomeAgentInstallBar", () => {
  beforeEach(() => {
    mockedCopy.mockReset();
  });

  it("渲染安装提示与复制按钮", () => {
    render(<HomeAgentInstallBar />);
    expect(screen.getByRole("button", { name: "复制给 AI 安装" })).toBeInTheDocument();
    expect(screen.getAllByText(/skillnav|安装|配置/i).length).toBeGreaterThan(0);
  });

  it("点击复制成功后展示“已复制”与成功提示", async () => {
    mockedCopy.mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<HomeAgentInstallBar />);

    await user.click(screen.getByRole("button", { name: "复制给 AI 安装" }));

    // 按钮的 aria-label 恒为“复制给 AI 安装”，成功态体现在按钮文本（已复制）。
    expect(await screen.findByText("已复制")).toBeInTheDocument();
    expect(screen.getByText("安装提示已复制到剪贴板")).toBeInTheDocument();
    expect(mockedCopy).toHaveBeenCalledTimes(1);
  });

  it("复制失败时展示错误提示", async () => {
    mockedCopy.mockRejectedValue(new Error("clipboard blocked"));
    const user = userEvent.setup();
    render(<HomeAgentInstallBar />);

    await user.click(screen.getByRole("button", { name: "复制给 AI 安装" }));

    expect(await screen.findByText("无法复制，请手动选择文本复制。")).toBeInTheDocument();
  });
});
