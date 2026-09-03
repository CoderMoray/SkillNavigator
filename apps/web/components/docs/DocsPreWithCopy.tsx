"use client";

import { isValidElement, type ComponentPropsWithoutRef, type ReactNode } from "react";
import { DocsAgentPromptCopyButton } from "./DocsAgentPromptCopyButton";

function readCodeBlock(children: ReactNode): { language: string | null; text: string | null } {
  if (!isValidElement<{ className?: string; children?: ReactNode }>(children)) {
    return { language: null, text: null };
  }

  const className = children.props.className ?? "";
  const language = /language-([\w-]+)/.exec(className)?.[1] ?? null;
  const text = String(children.props.children ?? "").trim();
  return { language, text: text || null };
}

export function DocsPreWithCopy({
  children,
  enableAgentPromptCopy = false,
  ...rest
}: ComponentPropsWithoutRef<"pre"> & { enableAgentPromptCopy?: boolean }) {
  const { language, text } = readCodeBlock(children);
  const showCopy = enableAgentPromptCopy && language === "text" && text;

  if (showCopy) {
    return (
      <div className="docs-copyable-pre">
        <div className="docs-copyable-pre-toolbar">
          <span className="docs-copyable-pre-label">系统提示词</span>
          <DocsAgentPromptCopyButton text={text} />
        </div>
        <pre {...rest}>{children}</pre>
      </div>
    );
  }

  return <pre {...rest}>{children}</pre>;
}
