"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { ArrowLeft, UserX } from "lucide-react";
import { AppShell } from "../../../components/AppShell";
import { ConfirmToast } from "../../../components/ConfirmToast";
import { deleteAccount, getCurrentUser } from "../../../lib/api";
import { clearAuthToken, getAuthToken } from "../../../lib/auth-token";
import { clearPublishNotice } from "../../../lib/publish-notice";
import type { PublicUser } from "../../../lib/types";

function formatDeleteAccountError(message: string): string {
  if (message === "Current password is incorrect") {
    return "当前密码不正确";
  }
  if (message === "Cannot delete the last administrator account") {
    return "无法注销最后一个管理员账户";
  }
  if (message === "Unauthorized") {
    return "请先登录";
  }
  return message;
}

export default function DeleteAccountPage() {
  const router = useRouter();
  const [user, setUser] = useState<PublicUser | null>(null);
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
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

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setConfirmOpen(true);
  }

  async function handleConfirmDelete() {
    const token = getAuthToken();
    if (!token || !user) {
      setConfirmOpen(false);
      setError("请先登录");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await deleteAccount(token, password);
      clearAuthToken();
      clearPublishNotice();
      router.replace("/");
    } catch (err) {
      setConfirmOpen(false);
      setError(formatDeleteAccountError(err instanceof Error ? err.message : "注销失败"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AppShell title="注销账户">
      {confirmOpen && user ? (
        <ConfirmToast
          cancelLabel="取消"
          confirmClassName="button secondary compact danger"
          confirmLabel="确认注销"
          confirming={submitting}
          confirmingLabel="注销中…"
          message={`确定永久注销账户「${user.username}」吗？你将失去对该账户下所有 Skill 的访问权，已发布的 Skill 将被永久删除，此操作不可恢复。`}
          onCancel={() => {
            if (!submitting) {
              setConfirmOpen(false);
            }
          }}
          onConfirm={() => void handleConfirmDelete()}
          title="确认注销账户"
        />
      ) : null}
      <div className="auth-page">
        {loading ? (
          <div className="skeleton auth-card" />
        ) : !user ? (
          <section className="auth-card card">
            <span className="eyebrow">
              <UserX size={14} />
              Delete account
            </span>
            <h1>注销账户</h1>
            <p className="description">请先登录后再注销账户。</p>
            <div className="hero-actions">
              <Link className="button primary" href="/login">登录</Link>
              <Link className="button secondary" href="/register">注册</Link>
            </div>
          </section>
        ) : (
          <section className="auth-card card">
            <span className="eyebrow">
              <UserX size={14} />
              Delete account
            </span>
            <h1>注销账户</h1>
            <p className="description">
              注销后账户「{user.username}」将被永久删除，你发布的 Skill、收藏与登录状态将无法恢复。
            </p>

            <form className="form-grid" onSubmit={handleSubmit}>
              <label className="field">
                <span>当前密码</span>
                <input
                  autoComplete="current-password"
                  minLength={8}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                  type="password"
                  value={password}
                />
              </label>
              <p className="description">
                输入密码后点击「申请注销」，系统会再次弹出确认对话框。
              </p>
              {error ? <div className="error compact-error">{error}</div> : null}
              <button className="button secondary danger" disabled={submitting} type="submit">
                申请注销
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
