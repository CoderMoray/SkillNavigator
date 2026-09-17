"use client";

import { CheckCircle2, X } from "lucide-react";
import { useEffect } from "react";
import { useToastSlot } from "../lib/toast-slot";

const AUTO_DISMISS_MS = 4000;

interface SuccessToastProps {
  message: string;
  onClose: () => void;
}

export function SuccessToast({ message, onClose }: SuccessToastProps) {
  const superseded = useToastSlot(message);

  useEffect(() => {
    if (superseded) {
      return;
    }
    const timer = window.setTimeout(onClose, AUTO_DISMISS_MS);
    return () => window.clearTimeout(timer);
  }, [message, onClose, superseded]);

  if (superseded) {
    return null;
  }

  return (
    <div className="publish-notice-toast published success-toast" role="status" aria-live="polite" aria-atomic="true">
      <div className="publish-notice-toast-icon">
        <CheckCircle2 size={18} />
      </div>
      <div className="publish-notice-toast-body">
        <strong>{message}</strong>
      </div>
      <button aria-label="关闭" className="publish-notice-toast-close" onClick={onClose} type="button">
        <X size={14} />
      </button>
    </div>
  );
}
