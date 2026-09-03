"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { ErrorToast } from "../ErrorToast";
import { SuccessToast } from "../SuccessToast";
import { copyTextToClipboard } from "../../lib/copy-text";

export function DocsAgentPromptCopyButton({ text }: { text: string }) {
  const [copyState, setCopyState] = useState<"success" | "error" | null>(null);

  async function handleCopy() {
    try {
      await copyTextToClipboard(text);
      setCopyState("success");
    } catch {
      setCopyState("error");
    }
  }

  return (
    <>
      <button className="docs-agent-prompt-copy" onClick={() => void handleCopy()} type="button">
        {copyState === "success" ? <Check aria-hidden="true" size={15} /> : <Copy aria-hidden="true" size={15} />}
        {copyState === "success" ? "已复制" : "复制 Agent 提示词"}
      </button>
      {copyState === "success" ? (
        <SuccessToast message="Agent 系统提示词已复制到剪贴板" onClose={() => setCopyState(null)} />
      ) : null}
      {copyState === "error" ? (
        <ErrorToast message="无法复制，请手动选择代码块中的文本。" onClose={() => setCopyState(null)} />
      ) : null}
    </>
  );
}
