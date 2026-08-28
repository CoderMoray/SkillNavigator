"use client";

import { FormEvent, useEffect, useState } from "react";
import { Save, UserRound } from "lucide-react";
import { SuccessToast } from "../../../../components/SuccessToast";
import { updateProfile } from "../../../../lib/api";
import { getAuthToken } from "../../../../lib/auth-token";
import { useSettingsUser } from "../settings-user-context";

export default function SettingsProfilePage() {
  const user = useSettingsUser();
  const [displayName, setDisplayName] = useState("");
  const [about, setAbout] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    setDisplayName(user.displayName ?? "");
    setAbout(user.about ?? "");
  }, [user]);

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
      setDisplayName(updatedUser.displayName ?? "");
      setAbout(updatedUser.about ?? "");
      setSuccessMessage("个人资料已保存");
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSubmitting(false);
    }
  }

  const avatarLabel = (displayName.trim() || user.username).slice(0, 1).toUpperCase();

  return (
    <>
      {successMessage ? (
        <SuccessToast message={successMessage} onClose={() => setSuccessMessage(null)} />
      ) : null}

      <section className="card settings-section-card">
        <header className="settings-section-head">
          <div className="settings-section-head-main">
            <span className="settings-section-icon" aria-hidden>
              <UserRound size={18} />
            </span>
            <div>
              <h2>Account</h2>
              <p className="description">
                用于 Skill 发布页与个人主页的公开资料。用户名 @{user.username} 不可更改。
              </p>
            </div>
          </div>
          <div aria-hidden className="settings-section-avatar">
            {avatarLabel}
          </div>
        </header>

        <form className="settings-section-form" onSubmit={handleProfileSubmit}>
          <label className="field settings-field">
            <span className="settings-field-label">Display name</span>
            <input
              maxLength={128}
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder={user.username}
              type="text"
              value={displayName}
            />
          </label>

          <label className="field settings-field">
            <span className="settings-field-label">Bio</span>
            <textarea
              maxLength={2000}
              onChange={(event) => setAbout(event.target.value)}
              placeholder="介绍一下你在构建什么…"
              rows={5}
              value={about}
            />
          </label>

          {error ? <p className="form-error">{error}</p> : null}

          <div className="settings-section-actions">
            <button className="button primary" disabled={submitting} type="submit">
              <Save size={15} />
              {submitting ? "保存中…" : "Save profile"}
            </button>
          </div>
        </form>
      </section>
    </>
  );
}
