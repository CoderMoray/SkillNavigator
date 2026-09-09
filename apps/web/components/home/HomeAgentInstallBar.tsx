"use client";

import { useState, useSyncExternalStore } from "react";
import { Copy } from "lucide-react";
import { ErrorToast } from "../ErrorToast";
import { SuccessToast } from "../SuccessToast";
import { copyTextToClipboard } from "../../lib/copy-text";
import { resolveRegistryStoreInstallPrompt } from "../../lib/registry-install-guide";

function subscribeOrigin(onStoreChange: () => void): () => void {
  // origin 在页面生命周期内不变；订阅仅为满足 useSyncExternalStore 的契约。
  window.addEventListener("popstate", onStoreChange);
  return () => window.removeEventListener("popstate", onStoreChange);
}

export function HomeAgentInstallBar() {
  const [copyState, setCopyState] = useState<"success" | "error" | null>(null);

  // window.location.origin 在 SSR 首帧不可用：以空字符串为服务端快照，
  // hydration 后自动拿到真实 origin（useSyncExternalStore），替代“挂载后 effect 里 setState”。
  // 未配置部署 env 时（生产构建）prompt 为显式的“联系维护者”说明，不输出 127.0.0.1。
  const origin = useSyncExternalStore(subscribeOrigin, () => window.location.origin, () => "");
  const prompt = resolveRegistryStoreInstallPrompt(origin || undefined);

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
