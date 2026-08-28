"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { ArrowLeft, KeyRound } from "lucide-react";
import { AppShell } from "../../../components/AppShell";
import { changePassword, getCurrentUser } from "../../../lib/api";
import { clearAuthToken, getAuthToken } from "../../../lib/auth-token";
import { saveFlashToast } from "../../../lib/flash-toast";
import { clearPublishNotice } from "../../../lib/publish-notice";
import type { PublicUser } from "../../../lib/types";

export default function ChangePasswordPage() {
  const router = useRouter();
  const [user, setUser] = useState<PublicUser | null>(null);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

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

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (newPassword !== confirmPassword) {
      setError("两次输入的新密码不一致");
      return;
    }

    const token = getAuthToken();
    if (!token) {
      setError("请先登录");
      return;
    }

    setSubmitting(true);
    try {
      const updatedUser = await changePassword(token, currentPassword, newPassword);
      setUser(updatedUser);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      saveFlashToast("密码已更新");
      clearPublishNotice();
      router.push("/account/settings");
    } catch (err) {
      setError(err instanceof Error ? err.message : "修改失败");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AppShell title="修改密码">
      <div className="auth-page">
        {loading ? (
          <div className="skeleton auth-card" />
        ) : !user ? (
          <section className="auth-card card">
            <span className="eyebrow">
              <KeyRound size={14} />
              Password
            </span>
            <h1>修改密码</h1>
            <p className="description">请先登录后再修改密码。</p>
            <div className="hero-actions">
              <Link className="button primary" href="/login">登录</Link>
              <Link className="button secondary" href="/register">注册</Link>
            </div>
          </section>
        ) : (
          <section className="auth-card card">
            <span className="eyebrow">
              <KeyRound size={14} />
              Password
            </span>
            <h1>修改密码</h1>
            <p className="description">为账户 {user.username} 设置新密码。</p>

            <form className="form-grid" onSubmit={handleSubmit}>
              <label className="field">
                <span>当前密码</span>
                <input
                  autoComplete="current-password"
                  minLength={8}
                  onChange={(event) => setCurrentPassword(event.target.value)}
                  required
                  type="password"
                  value={currentPassword}
                />
              </label>
              <label className="field">
                <span>新密码</span>
                <input
                  autoComplete="new-password"
                  minLength={8}
                  onChange={(event) => setNewPassword(event.target.value)}
                  required
                  type="password"
                  value={newPassword}
                />
              </label>
              <label className="field">
                <span>确认新密码</span>
                <input
                  autoComplete="new-password"
                  minLength={8}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  required
                  type="password"
                  value={confirmPassword}
                />
              </label>
              {error ? <div className="error compact-error">{error}</div> : null}
              <button className="button primary" disabled={submitting} type="submit">
                {submitting ? "保存中..." : "保存新密码"}
              </button>
            </form>

            <p className="description">
              <Link className="text-link" href="/account/settings">
                <ArrowLeft size={14} style={{ verticalAlign: "-2px" }} /> 返回设置
              </Link>
            </p>
          </section>
        )}
      </div>
    </AppShell>
  );
}
