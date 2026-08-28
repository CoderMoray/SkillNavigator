"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, ChevronRight, KeyRound, Lock, Settings, UserX } from "lucide-react";
import { AppShell } from "../../../components/AppShell";
import { getCurrentUser } from "../../../lib/api";
import { clearAuthToken, getAuthToken } from "../../../lib/auth-token";
import { creatorProfilePath } from "../../../lib/creators";
import type { PublicUser } from "../../../lib/types";

const settingsItems = [
  {
    href: "/account/api-keys",
    icon: KeyRound,
    title: "API密钥",
    description: "为 skillnav CLI 创建与管理独立密钥。",
  },
  {
    href: "/account/change-password",
    icon: Lock,
    title: "修改密码",
    description: "更新账户登录密码。",
  },
  {
    href: "/account/delete",
    icon: UserX,
    title: "注销账户",
    description: "永久删除账户及发布的 Skill。",
    danger: true,
  },
] as const;

export default function AccountSettingsPage() {
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
        <div className="account-settings-page">
          <div className="skeleton settings-skeleton" />
        </div>
      </AppShell>
    );
  }

  if (!user) {
    return (
      <AppShell title="设置">
        <div className="auth-page">
          <section className="auth-card card">
            <span className="eyebrow">
              <Settings size={14} />
              Settings
            </span>
            <h1>设置</h1>
            <p className="description">登录后可管理 API 密钥、密码与账户安全。</p>
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
      <div className="account-settings-page">
        <header className="settings-header">
          <Link
            className="button secondary"
            href={creatorProfilePath(user.username)}
            style={{ width: "fit-content" }}
          >
            <ArrowLeft size={16} />
            返回个人主页
          </Link>
          <h1>设置</h1>
          <p className="description">管理账户安全、API 密钥与登录凭证。</p>
        </header>

        <nav aria-label="账户设置" className="settings-nav-list">
          {settingsItems.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                className={`settings-nav-item${item.danger ? " danger" : ""}`}
                href={item.href}
                key={item.href}
              >
                <span className="settings-nav-item-icon" aria-hidden>
                  <Icon size={18} />
                </span>
                <span className="settings-nav-item-body">
                  <strong>{item.title}</strong>
                  <span>{item.description}</span>
                </span>
                <ChevronRight aria-hidden className="settings-nav-item-chevron" size={18} />
              </Link>
            );
          })}
        </nav>
      </div>
    </AppShell>
  );
}
