import { pgTable, text, timestamp, uniqueIndex, boolean } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const platformUsers = pgTable(
  "platform_users",
  {
    id: text("id").primaryKey(),
    username: text("username").notNull().unique(),
    email: text("email"),
    passwordHash: text("password_hash").notNull(),
    role: text("role").notNull().default("user"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex("platform_users_email_lower_key").on(sql`lower(${table.email})`),
  ]
);

export const authSessions = pgTable("auth_sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => platformUsers.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
});

export const apiKeys = pgTable(
  "api_keys",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => platformUsers.id, { onDelete: "cascade" }),
    name: text("name").notNull().default(""),
    keyHash: text("key_hash").notNull().unique(),
    keyPrefix: text("key_prefix").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("api_keys_user_id_id_key").on(table.userId, table.id),
    uniqueIndex("api_keys_user_id_name_lower_key").on(table.userId, sql`lower(${table.name})`),
  ]
);
