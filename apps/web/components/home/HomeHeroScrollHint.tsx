"use client";

import { ChevronDown } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

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

  const scrollToDiscovery = useCallback(() => {
    document.getElementById("home-discovery-title")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  return (
    <button
      aria-label="向下探索更多内容"
      className="homepage-hero-scroll-hint"
      onClick={scrollToDiscovery}
      style={{
        opacity,
        pointerEvents: opacity < 0.08 ? "none" : undefined,
        visibility: opacity < 0.02 ? "hidden" : undefined,
      }}
      type="button"
    >
      <span className="homepage-hero-scroll-hint-label">向下探索</span>
      <ChevronDown aria-hidden className="homepage-hero-scroll-hint-icon" size={18} strokeWidth={2.25} />
    </button>
  );
}
