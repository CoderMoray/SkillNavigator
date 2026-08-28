"use client";

import { createContext, useContext } from "react";
import type { PublicUser } from "../../../lib/types";

interface SettingsUserContextValue {
  user: PublicUser;
}

const SettingsUserContext = createContext<SettingsUserContextValue | null>(null);

export function SettingsUserProvider({
  user,
  children,
}: {
  user: PublicUser;
  children: React.ReactNode;
}) {
  return <SettingsUserContext.Provider value={{ user }}>{children}</SettingsUserContext.Provider>;
}

export function useSettingsUser(): PublicUser {
  const value = useContext(SettingsUserContext);
  if (!value) {
    throw new Error("useSettingsUser must be used within SettingsUserProvider");
  }
  return value.user;
}
