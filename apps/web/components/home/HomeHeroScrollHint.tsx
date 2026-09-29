"use client";

import { ChevronDown } from "lucide-react";
import { useEffect, useState } from "react";

/** 滚动超过该距离（px）后提示完全透明 */
const SCROLL_FADE_DISTANCE = 96;

export function HomeHeroScrollHint() {
  const [opacity, setOpacity] = useState(1);

  useEffect(() => {
    function syncOpacity() {
      const next = Math.max(0, 1 - window.scrollY / SCROLL_FADE_DISTANCE);
      setOpacity(next);
    }

    syncOpacity();
    window.addEventListener("scroll", syncOpacity, { passive: true });
    return () => window.removeEventListener("scroll", syncOpacity);
  }, []);

  return (
    <div
      aria-hidden="true"
      className="homepage-hero-scroll-hint"
      style={{
        opacity,
        visibility: opacity < 0.02 ? "hidden" : undefined,
      }}
    >
      <span className="homepage-hero-scroll-hint-label">向下探索</span>
      <ChevronDown className="homepage-hero-scroll-hint-icon" size={18} strokeWidth={2.25} />
    </div>
  );
}
