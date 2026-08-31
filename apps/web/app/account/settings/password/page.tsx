"use client";

import { FormEvent, useState } from "react";
import { Lock } from "lucide-react";
import { ErrorToast } from "../../../../components/ErrorToast";
import { SuccessToast } from "../../../../components/SuccessToast";
import { changePassword } from "../../../../lib/api";
import { getAuthToken } from "../../../../lib/auth-token";
import { useSettingsUser } from "../settings-user-context";

export default function SettingsPasswordPage() {
  const user = useSettingsUser();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errorToast, setErrorToast] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorToast(null);
    setSuccessMessage(null);

    if (newPassword !== confirmPassword) {
      setErrorToast("两次输入的新密码不一致");
      return;
    }

    const token = getAuthToken();
    if (!token) {
      setErrorToast("请先登录");
      return;
    }

    setSubmitting(true);
    try {
      await changePassword(token, currentPassword, newPassword);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setSuccessMessage("密码已更新");
    } catch (err) {
      setErrorToast(err instanceof Error ? err.message : "修改失败");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      {errorToast ? <ErrorToast message={errorToast} onClose={() => setErrorToast(null)} /> : null}
      {successMessage ? (
        <SuccessToast message={successMessage} onClose={() => setSuccessMessage(null)} />
      ) : null}

      <section className="card settings-section-card">
        <header className="settings-section-head">
          <div className="settings-section-head-main">
            <span className="settings-section-icon" aria-hidden>
              <Lock size={18} />
            </span>
            <div>
              <h2>修改密码</h2>
              <p className="description">为账户 {user.username} 设置新密码。</p>
            </div>
          </div>
        </header>

        <form className="settings-section-form" onSubmit={handleSubmit}>
          <label className="field settings-field">
            <span className="settings-field-label">当前密码</span>
            <input
              autoComplete="current-password"
              minLength={8}
              onChange={(event) => setCurrentPassword(event.target.value)}
              required
              type="password"
              value={currentPassword}
            />
          </label>
          <label className="field settings-field">
            <span className="settings-field-label">新密码</span>
            <input
              autoComplete="new-password"
              minLength={8}
              onChange={(event) => setNewPassword(event.target.value)}
              required
              type="password"
              value={newPassword}
            />
          </label>
          <label className="field settings-field">
            <span className="settings-field-label">确认新密码</span>
            <input
              autoComplete="new-password"
              minLength={8}
              onChange={(event) => setConfirmPassword(event.target.value)}
              required
              type="password"
              value={confirmPassword}
            />
          </label>

          <div className="settings-section-actions">
            <button className="button primary" disabled={submitting} type="submit">
              {submitting ? "保存中…" : "保存密码"}
            </button>
          </div>
        </form>
      </section>
    </>
  );
}
