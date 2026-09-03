"use client";

import { useEffect, useState } from "react";
import { Copy } from "lucide-react";
import { ErrorToast } from "../ErrorToast";
import { SuccessToast } from "../SuccessToast";
import { copyTextToClipboard } from "../../lib/copy-text";
import {
  buildRegistryInstallGuideUrl,
  buildRegistryStoreInstallPrompt,
  DEFAULT_WEB_ORIGIN,
} from "../../lib/registry-install-guide";

export function HomeAgentInstallBar() {
  const [prompt, setPrompt] = useState(() =>
    buildRegistryStoreInstallPrompt(buildRegistryInstallGuideUrl(DEFAULT_WEB_ORIGIN))
  );
  const [copyState, setCopyState] = useState<"success" | "error" | null>(null);

  useEffect(() => {
    setPrompt(buildRegistryStoreInstallPrompt(buildRegistryInstallGuideUrl(window.location.origin)));
  }, []);

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
      <div className="homepage-agent-install">
        <p className="homepage-agent-install-text">{prompt}</p>
        <button
          aria-label="复制给 AI 安装"
          className="homepage-agent-install-copy"
          onClick={() => void handleCopy()}
          type="button"
        >
          <Copy aria-hidden="true" size={16} />
          {copyState === "success" ? "已复制" : "复制给 AI 安装"}
        </button>
      </div>
      {copyState === "success" ? (
        <SuccessToast message="安装提示已复制到剪贴板" onClose={() => setCopyState(null)} />
      ) : null}
      {copyState === "error" ? (
        <ErrorToast message="无法复制，请手动选择文本复制。" onClose={() => setCopyState(null)} />
      ) : null}
    </>
  );
}
