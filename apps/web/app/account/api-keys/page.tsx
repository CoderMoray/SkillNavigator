import { redirect } from "next/navigation";

export default function LegacyApiKeysPage() {
  redirect("/account/settings/api-keys");
}
