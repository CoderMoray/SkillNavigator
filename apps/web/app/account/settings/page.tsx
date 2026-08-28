"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { ArrowLeft, ChevronRight, KeyRound, Lock, Settings, UserRound, UserX } from "lucide-react";
import { AppShell } from "../../../components/AppShell";
import { SuccessToast } from "../../../components/SuccessToast";
import { getCurrentUser, updateProfile } from "../../../lib/api";
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
  const [displayName, setDisplayName] = useState("");
  const [about, setAbout] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

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
          setDisplayName(currentUser.displayName ?? "");
          setAbout(currentUser.about ?? "");
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

  async function handleProfileSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccessMessage(null);

    const token = getAuthToken();
    if (!token) {
      setError("请先登录");
      return;
    }

    setSubmitting(true);
    try {
      const updatedUser = await updateProfile(token, {
        displayName: displayName.trim() || null,
        about: about.trim() || null,
      });
      setUser(updatedUser);
      setDisplayName(updatedUser.displayName ?? "");
      setAbout(updatedUser.about ?? "");
      setSuccessMessage("个人资料已保存");
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSubmitting(false);
    }
  }

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
            <p className="description">登录后可管理个人资料、API 密钥、密码与账户安全。</p>
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
      {successMessage ? (
        <SuccessToast message={successMessage} onClose={() => setSuccessMessage(null)} />
      ) : null}

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
          <p className="description">管理个人资料、账户安全、API 密钥与登录凭证。</p>
        </header>

        <section className="card settings-panel settings-profile-panel">
          <span className="eyebrow">
            <UserRound size={14} />
            Profile
          </span>
          <h2>个人资料</h2>
          <p className="description">显示名称仅用于展示，用户名 @{user.username} 不可更改。</p>

          <form className="form-grid" onSubmit={handleProfileSubmit}>
            <label className="field">
              <span>显示名称</span>
              <input
                maxLength={128}
                onChange={(event) => setDisplayName(event.target.value)}
                placeholder={user.username}
                type="text"
                value={displayName}
              />
            </label>

            <label className="field">
              <span>用户名</span>
              <input disabled readOnly type="text" value={`@${user.username}`} />
            </label>

            <label className="field">
              <span>About</span>
              <textarea
                maxLength={2000}
                onChange={(event) => setAbout(event.target.value)}
                placeholder="介绍一下你自己…"
                rows={5}
                value={about}
              />
            </label>

            {error ? <p className="form-error">{error}</p> : null}

            <div className="hero-actions">
              <button className="button primary" disabled={submitting} type="submit">
                {submitting ? "保存中…" : "保存资料"}
              </button>
            </div>
          </form>
        </section>

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
