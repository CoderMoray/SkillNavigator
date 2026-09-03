"use client";

import Link from "next/link";
import { useState } from "react";
import { BookOpen, Bot, Copy, ExternalLink } from "lucide-react";
import { ErrorToast } from "../ErrorToast";
import { SuccessToast } from "../SuccessToast";
import { skillnavAgentInstallPrompt } from "../../lib/cli-examples";
import { copyTextToClipboard } from "../../lib/copy-text";

export function HomeAgentPromptCard() {
  const [copyState, setCopyState] = useState<"success" | "error" | null>(null);
  const prompt = skillnavAgentInstallPrompt();

  async function handleCopy() {
    try {
      await copyTextToClipboard(prompt);
      setCopyState("success");
    } catch {
      setCopyState("error");
    }
  }

  return (
    <>
      <div className="home-agent-card">
        <div className="home-agent-card-head">
          <span className="eyebrow dark">
            <Bot size={14} />
            Agent 安装
          </span>
          <h2>复制给 Agent，开始使用 skillnav</h2>
          <p>包含 CLI 安装、API 密钥登录与站内文档链接，可直接粘贴给需要操作平台的 Agent。</p>
        </div>
        <pre className="home-agent-card-preview">{prompt}</pre>
        <div className="home-agent-card-actions">
          <button className="button primary compact" onClick={() => void handleCopy()} type="button">
            <Copy size={14} />
            {copyState === "success" ? "已复制" : "复制安装提示词"}
          </button>
          <Link className="button secondary compact" href="/docs/platform-agent-prompt">
            <ExternalLink size={14} />
            系统提示词
          </Link>
          <Link className="button secondary compact" href="/docs/cli-developer-guide">
            <BookOpen size={14} />
            CLI 指南
          </Link>
        </div>
      </div>
      {copyState === "success" ? (
        <SuccessToast message="安装提示词已复制到剪贴板" onClose={() => setCopyState(null)} />
      ) : null}
      {copyState === "error" ? (
        <ErrorToast message="无法复制提示词，请手动选择文本复制。" onClose={() => setCopyState(null)} />
      ) : null}
    </>
  );
}
