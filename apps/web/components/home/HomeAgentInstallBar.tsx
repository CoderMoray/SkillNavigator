"use client";

import { useState, useSyncExternalStore } from "react";
import { Copy } from "lucide-react";
import { ErrorToast } from "../ErrorToast";
import { SuccessToast } from "../SuccessToast";
import { copyTextToClipboard } from "../../lib/copy-text";
import { resolveRegistryStoreInstallPrompt } from "../../lib/registry-install-guide";

const HAS_CONFIGURED_INSTALL_URL = Boolean(
  process.env.NEXT_PUBLIC_REGISTRY_INSTALL_GUIDE_URL?.trim() ||
    process.env.NEXT_PUBLIC_WEB_URL?.trim()
);

function subscribeOrigin(onStoreChange: () => void): () => void {
  // origin 在页面生命周期内不变；订阅仅为满足 useSyncExternalStore 的契约。
  window.addEventListener("popstate", onStoreChange);
  return () => window.removeEventListener("popstate", onStoreChange);
}

export function HomeAgentInstallBar() {
  const [copyState, setCopyState] = useState<"success" | "error" | null>(null);

  // window.location.origin 在 SSR 首帧不可用：以空字符串为服务端快照，
  // hydration 后自动拿到真实 origin（useSyncExternalStore），替代“挂载后 effect 里 setState”。
  const origin = useSyncExternalStore(subscribeOrigin, () => window.location.origin, () => "");
  const prompt = HAS_CONFIGURED_INSTALL_URL
    ? resolveRegistryStoreInstallPrompt()
    : resolveRegistryStoreInstallPrompt(origin || undefined);

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
