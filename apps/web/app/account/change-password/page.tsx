import { redirect } from "next/navigation";

export default function LegacyChangePasswordPage() {
  redirect("/account/settings/password");
}
