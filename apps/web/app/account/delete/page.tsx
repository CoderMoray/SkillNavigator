import { redirect } from "next/navigation";

export default function LegacyDeleteAccountPage() {
  redirect("/account/settings/delete");
}
