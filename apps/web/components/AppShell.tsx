"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { BarChart3, BookOpen, Boxes, LayoutDashboard, ShieldCheck, UserCircle } from "lucide-react";
import { AuthStatus } from "./AuthStatus";
import { resolveBrandName } from "../lib/brand-name";
import { PLATFORM_LOGO_DARK_PATH, PLATFORM_LOGO_PATH, publicAssetPath } from "../lib/public-asset";

const navItems = [
  { href: "/", label: "首页", icon: LayoutDashboard },
  { href: "/skills", label: "Skills", icon: Boxes },
  { href: "/creators", label: "Creators", icon: UserCircle },
  { href: "/leaderboard", label: "榜单", icon: BarChart3 },
  { href: "/reviews", label: "Audits", icon: ShieldCheck },
  { href: "/docs", label: "文档", icon: BookOpen }
];

export function AppShell({ children, title = "概览" }: { children: ReactNode; title?: string }) {
  const pathname = usePathname();
  const [isScrolled, setIsScrolled] = useState(false);
  const [logoSrc, setLogoSrc] = useState(() => publicAssetPath(PLATFORM_LOGO_PATH));

  useEffect(() => {
    function syncScrollState() {
      setIsScrolled((current) => {
        const next = window.scrollY > 8;
        return current === next ? current : next;
      });
    }

    syncScrollState();
    window.addEventListener("scroll", syncScrollState, { passive: true });
    return () => window.removeEventListener("scroll", syncScrollState);
  }, []);

  useEffect(() => {
    function syncLogo() {
      const isDark = document.documentElement.dataset.theme === "dark";
      setLogoSrc(publicAssetPath(isDark ? PLATFORM_LOGO_DARK_PATH : PLATFORM_LOGO_PATH));
    }

    syncLogo();
    const observer = new MutationObserver(syncLogo);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);

  return (
    <div className="app-shell">
      <header className={`site-header${isScrolled ? " is-scrolled" : ""}`}>
        <Link className="brand" href="/">
          <img
            alt={resolveBrandName()}
            className="brand-logo"
            decoding="async"
            height={40}
            src={logoSrc}
            width={211}
          />
        </Link>

        <nav aria-label="主导航" className="top-nav">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = item.href === "/" ? pathname === "/" : pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link className={`top-nav-link ${active ? "active" : ""}`} href={item.href} key={item.href}>
                <Icon size={17} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="topbar-actions">
          <span className="page-title">{title}</span>
          <AuthStatus />
        </div>
      </header>

      <main className="main">{children}</main>
    </div>
  );
}
