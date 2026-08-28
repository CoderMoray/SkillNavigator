"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Settings } from "lucide-react";
import { AppShell } from "../../../components/AppShell";
import { SettingsSidebar } from "../../../components/SettingsSidebar";
import { getCurrentUser } from "../../../lib/api";
import { clearAuthToken, getAuthToken } from "../../../lib/auth-token";
import type { PublicUser } from "../../../lib/types";
import { SettingsUserProvider } from "./settings-user-context";

export default function AccountSettingsLayout({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function loadUser() {
      const token = getAuthToken();
      if (!token) {
        setLoading(false);
        return;
      }

      try {
        const currentUser = await getCurrentUser(token);
        if (!cancelled) {
          setUser(currentUser);
        }
      } catch {
        clearAuthToken();
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadUser();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <AppShell title="设置">
        <div className="settings-shell">
          <div className="skeleton settings-skeleton" />
        </div>
      </AppShell>
    );
  }

  if (!user) {
    return (
      <AppShell title="设置">
        <div className="settings-shell">
          <header className="settings-page-header">
            <h1>设置</h1>
            <p className="description">登录后可管理个人资料、API 密钥与账户安全。</p>
          </header>
          <section className="card settings-guest-card">
            <span className="eyebrow">
              <Settings size={14} />
              设置
            </span>
            <h2>请先登录</h2>
            <p className="description">登录后即可编辑个人资料并管理 API 密钥。</p>
            <div className="hero-actions">
              <Link className="button primary" href="/login">
                登录
              </Link>
              <Link className="button secondary" href="/register">
                注册
              </Link>
            </div>
          </section>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title="设置">
      <SettingsUserProvider user={user}>
        <div className="settings-shell">
          <header className="settings-page-header">
            <h1>设置</h1>
            <p className="description">管理个人资料、API 密钥、密码与账户安全。</p>
          </header>
          <div className="settings-layout">
            <SettingsSidebar />
            <main className="settings-main">{children}</main>
          </div>
        </div>
      </SettingsUserProvider>
    </AppShell>
  );
}
