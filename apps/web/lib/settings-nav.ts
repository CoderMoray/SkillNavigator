import type { LucideIcon } from "lucide-react";
import { KeyRound, Lock, ShieldAlert, UserRound } from "lucide-react";

export interface SettingsNavItem {
  href: string;
  icon: LucideIcon;
  label: string;
  danger?: boolean;
}

export const SETTINGS_NAV: SettingsNavItem[] = [
  {
    href: "/account/settings/profile",
    icon: UserRound,
    label: "账户与资料",
  },
  {
    href: "/account/settings/api-keys",
    icon: KeyRound,
    label: "API 密钥",
  },
  {
    href: "/account/settings/password",
    icon: Lock,
    label: "修改密码",
  },
  {
    href: "/account/settings/delete",
    icon: ShieldAlert,
    label: "注销账户",
    danger: true,
  },
];

export function isSettingsNavActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
