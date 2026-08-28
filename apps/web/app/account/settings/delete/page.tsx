"use client";

import { FormEvent, useState } from "react";
import { ShieldAlert } from "lucide-react";
import { ConfirmToast } from "../../../../components/ConfirmToast";
import { deleteAccount } from "../../../../lib/api";
import { clearAuthToken, getAuthToken } from "../../../../lib/auth-token";
import { clearPublishNotice } from "../../../../lib/publish-notice";
import { useRouter } from "next/navigation";
import { useSettingsUser } from "../settings-user-context";

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

export default function SettingsDeletePage() {
  const router = useRouter();
  const user = useSettingsUser();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setConfirmOpen(true);
  }

  async function handleConfirmDelete() {
    const token = getAuthToken();
    if (!token) {
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
    <>
      {confirmOpen ? (
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

      <section className="card settings-section-card settings-section-card-danger">
        <header className="settings-section-head">
          <div className="settings-section-head-main">
            <span className="settings-section-icon danger" aria-hidden>
              <ShieldAlert size={18} />
            </span>
            <div>
              <h2>Account deletion</h2>
              <p className="description">
                注销后账户「{user.username}」将被永久删除，你发布的 Skill、收藏与登录状态将无法恢复。
              </p>
            </div>
          </div>
        </header>

        <form className="settings-section-form" onSubmit={handleSubmit}>
          <label className="field settings-field">
            <span className="settings-field-label">Current password</span>
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

          <div className="settings-section-actions">
            <button className="button secondary danger" disabled={submitting} type="submit">
              申请注销
            </button>
          </div>
        </form>
      </section>
    </>
  );
}
