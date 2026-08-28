"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ChevronDown, KeyRound, LogIn, LogOut, Monitor, Moon, PackagePlus, Sun, UserCircle, UserX } from "lucide-react";
import { getCurrentUser, logoutUser } from "../lib/api";
import { AUTH_TOKEN_CHANGED_EVENT, clearAuthToken, getAuthToken } from "../lib/auth-token";
import { creatorProfilePath } from "../lib/creators";
import type { PublicUser } from "../lib/types";

type ThemeMode = "system" | "light" | "dark";

const THEME_STORAGE_KEY = "skill-platform-theme";

export function AuthStatus() {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [theme, setTheme] = useState<ThemeMode>("system");
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadUser() {
      const token = getAuthToken();
      if (!token) {
        setUser(null);
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const currentUser = await getCurrentUser(token);
        if (!cancelled) {
          setUser(currentUser);
        }
      } catch {
        clearAuthToken();
        setUser(null);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadUser();
    window.addEventListener(AUTH_TOKEN_CHANGED_EVENT, loadUser);
    return () => {
      cancelled = true;
      window.removeEventListener(AUTH_TOKEN_CHANGED_EVENT, loadUser);
    };
  }, []);

  useEffect(() => {
    const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY) as ThemeMode | null;
    const initialTheme = isThemeMode(storedTheme) ? storedTheme : "system";
    setTheme(initialTheme);
    applyTheme(initialTheme);

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    function handleSystemThemeChange() {
      const currentTheme = window.localStorage.getItem(THEME_STORAGE_KEY) as ThemeMode | null;
      if (!currentTheme || currentTheme === "system") {
        applyTheme("system");
      }
    }

    media.addEventListener("change", handleSystemThemeChange);
    return () => media.removeEventListener("change", handleSystemThemeChange);
  }, []);

  useEffect(() => {
    if (!menuOpen) {
      return;
    }

    function handlePointerDown(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMenuOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [menuOpen]);

  async function handleLogout() {
    const token = getAuthToken();
    clearAuthToken();
    setUser(null);
    setMenuOpen(false);
    if (token) {
      await logoutUser(token).catch(() => undefined);
    }
    window.location.reload();
  }

  function handleThemeChange(nextTheme: ThemeMode) {
    setTheme(nextTheme);
    window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
    applyTheme(nextTheme);
  }

  if (loading) {
    return <span className="api-pill">用户状态同步中</span>;
  }

  if (!user) {
    return (
      <div className="auth-actions">
        <Link className="button secondary compact" href="/login">
          <LogIn size={14} /> 登录
        </Link>
        <Link className="button primary compact" href="/register">
          注册
        </Link>
      </div>
    );
  }

  return (
    <div className="user-menu" ref={menuRef}>
      <button
        aria-expanded={menuOpen}
        aria-haspopup="menu"
        className={`user-menu-trigger api-pill ${menuOpen ? "open" : ""}`}
        onClick={() => setMenuOpen((open) => !open)}
        type="button"
      >
        <UserCircle size={14} />
        {user.username}
        <ChevronDown className={`user-menu-chevron ${menuOpen ? "open" : ""}`} size={14} />
      </button>

      {menuOpen ? (
        <div className="user-menu-dropdown" role="menu">
          <Link
            className="user-menu-item"
            href={creatorProfilePath(user.username)}
            onClick={() => setMenuOpen(false)}
            role="menuitem"
          >
            <UserCircle size={15} />
            个人中心
          </Link>
          <Link
            className="user-menu-item"
            href="/account/api-keys"
            onClick={() => setMenuOpen(false)}
            role="menuitem"
          >
            <KeyRound size={15} />
            API密钥
          </Link>
          <Link
            className="user-menu-item"
            href="/account/change-password"
            onClick={() => setMenuOpen(false)}
            role="menuitem"
          >
            <KeyRound size={15} />
            修改密码
          </Link>
          <Link
            className="user-menu-item danger"
            href="/account/delete"
            onClick={() => setMenuOpen(false)}
            role="menuitem"
          >
            <UserX size={15} />
            注销账户
          </Link>
          <Link
            className="user-menu-item"
            href="/skills/publish"
            onClick={() => setMenuOpen(false)}
            role="menuitem"
          >
            <PackagePlus size={15} />
            添加 Skill
          </Link>
          <div aria-label="页面主题" className="theme-switcher" role="group">
            <button
              aria-label="跟随系统主题"
              className={theme === "system" ? "active" : ""}
              onClick={() => handleThemeChange("system")}
              type="button"
            >
              <Monitor size={16} />
            </button>
            <button
              aria-label="浅色主题"
              className={theme === "light" ? "active" : ""}
              onClick={() => handleThemeChange("light")}
              type="button"
            >
              <Sun size={16} />
            </button>
            <button
              aria-label="深色主题"
              className={theme === "dark" ? "active" : ""}
              onClick={() => handleThemeChange("dark")}
              type="button"
            >
              <Moon size={16} />
            </button>
          </div>
          <button className="user-menu-item danger" onClick={handleLogout} role="menuitem" type="button">
            <LogOut size={15} />
            登出
          </button>
        </div>
      ) : null}
    </div>
  );
}

function applyTheme(theme: ThemeMode): void {
  const effectiveTheme =
    theme === "system"
      ? window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light"
      : theme;

  document.documentElement.dataset.theme = effectiveTheme;
  document.documentElement.dataset.themeMode = theme;
}

function isThemeMode(value: string | null): value is ThemeMode {
  return value === "system" || value === "light" || value === "dark";
}
