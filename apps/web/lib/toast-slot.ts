import { useEffect, useState } from "react";

/** Only one bottom-right notice toast should be visible at a time. */
let supersedeActiveToast: (() => void) | null = null;
/** Tracks the latest mounted notice toast (skips Strict Mode remount cleanup). */
let activeToastMountId = 0;

export function claimToastSlot(onSuperseded: () => void): () => void {
  supersedeActiveToast?.();
  supersedeActiveToast = onSuperseded;
  return () => {
    if (supersedeActiveToast === onSuperseded) {
      supersedeActiveToast = null;
    }
  };
}

/** Hide older toasts locally without clearing parent state (avoids wiping the next toast). */
export function useToastSlot(resetKey: string): boolean {
  const [superseded, setSuperseded] = useState(false);

  useEffect(() => {
    setSuperseded(false);
    return claimToastSlot(() => setSuperseded(true));
  }, [resetKey]);

  return superseded;
}

/** Dismiss when the toast unmounts (e.g. route change). Defers to skip React Strict Mode remount. */
export function useToastDismissOnLeave(onClose: () => void): void {
  useEffect(() => {
    const mountId = ++activeToastMountId;
    return () => {
      const closedMountId = mountId;
      queueMicrotask(() => {
        if (activeToastMountId !== closedMountId) {
          return;
        }
        activeToastMountId = 0;
        onClose();
      });
    };
  }, [onClose]);
}
