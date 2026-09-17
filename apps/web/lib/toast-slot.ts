import { useEffect, useState } from "react";

/** Only one bottom-right notice toast should be visible at a time. */
let supersedeActiveToast: (() => void) | null = null;

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
