"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef } from "react";
import { AlertCircle, CheckCircle2, X, XCircle } from "lucide-react";
import type { PublishNotice } from "../lib/publish-notice";
import { publishNoticeDescription, publishNoticeTitle } from "../lib/publish-notice";

const AUTO_DISMISS_MS = 5000;

interface PublishNoticeToastProps {
  notice: PublishNotice;
  onClose: () => void;
}

export function PublishNoticeToast({ notice, onClose }: PublishNoticeToastProps) {
  const onCloseRef = useRef(onClose);
  const closedRef = useRef(false);

  // render 期禁止写 ref（react-hooks/refs）：改为 effect 内同步最新 onClose。
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  const dismiss = useCallback(() => {
    if (closedRef.current) {
      return;
    }
    closedRef.current = true;
    onCloseRef.current();
  }, []);

  const Icon =
    notice.verdict === "published" ? CheckCircle2 : notice.verdict === "needs-inspection" ? AlertCircle : XCircle;

  useEffect(() => {
    const timer = window.setTimeout(dismiss, AUTO_DISMISS_MS);
    return () => {
      window.clearTimeout(timer);
    };
  }, [dismiss]);

  return (
    <div
      className={`publish-notice-toast ${notice.verdict}`}
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <div className="publish-notice-toast-icon">
        <Icon size={18} />
      </div>
      <div className="publish-notice-toast-body">
        <strong>{publishNoticeTitle(notice)}</strong>
        <p>{publishNoticeDescription(notice)}</p>
        <Link
          className="publish-notice-toast-link"
          href={`/skills/${encodeURIComponent(notice.slug)}`}
          onClick={dismiss}
        >
          查看 Skill 详情
        </Link>
      </div>
      <button aria-label="关闭" className="publish-notice-toast-close" onClick={dismiss} type="button">
        <X size={14} />
      </button>
    </div>
  );
}
