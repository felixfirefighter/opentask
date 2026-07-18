import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const timestampColumn = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

export function createIdentitySchema() {
  const user = pgTable("user", {
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull().unique(),
    emailVerified: boolean("email_verified").default(false).notNull(),
    image: text("image"),
    createdAt: timestampColumn("created_at").defaultNow().notNull(),
    updatedAt: timestampColumn("updated_at").defaultNow().notNull(),
  });

  const session = pgTable(
    "session",
    {
      id: uuid("id").defaultRandom().primaryKey(),
      expiresAt: timestampColumn("expires_at").notNull(),
      token: text("token").notNull().unique(),
      createdAt: timestampColumn("created_at").defaultNow().notNull(),
      updatedAt: timestampColumn("updated_at").defaultNow().notNull(),
      ipAddress: text("ip_address"),
      userAgent: text("user_agent"),
      userId: uuid("user_id")
        .notNull()
        .references(() => user.id, { onDelete: "cascade" }),
    },
    (table) => [index("session_user_id_idx").on(table.userId)],
  );

  const account = pgTable(
    "account",
    {
      id: uuid("id").defaultRandom().primaryKey(),
      accountId: text("account_id").notNull(),
      providerId: text("provider_id").notNull(),
      userId: uuid("user_id")
        .notNull()
        .references(() => user.id, { onDelete: "cascade" }),
      accessToken: text("access_token"),
      refreshToken: text("refresh_token"),
      idToken: text("id_token"),
      accessTokenExpiresAt: timestampColumn("access_token_expires_at"),
      refreshTokenExpiresAt: timestampColumn("refresh_token_expires_at"),
      scope: text("scope"),
      password: text("password"),
      createdAt: timestampColumn("created_at").defaultNow().notNull(),
      updatedAt: timestampColumn("updated_at").defaultNow().notNull(),
    },
    (table) => [
      index("account_user_id_idx").on(table.userId),
      uniqueIndex("account_provider_account_unique_idx").on(table.providerId, table.accountId),
    ],
  );

  const verification = pgTable(
    "verification",
    {
      id: uuid("id").defaultRandom().primaryKey(),
      identifier: text("identifier").notNull(),
      value: text("value").notNull(),
      expiresAt: timestampColumn("expires_at").notNull(),
      createdAt: timestampColumn("created_at").defaultNow().notNull(),
      updatedAt: timestampColumn("updated_at").defaultNow().notNull(),
    },
    (table) => [index("verification_identifier_idx").on(table.identifier)],
  );

  const rateLimit = pgTable("rate_limit", {
    id: uuid("id").defaultRandom().primaryKey(),
    key: text("key").notNull().unique(),
    count: integer("count").notNull(),
    lastRequest: bigint("last_request", { mode: "number" }).notNull(),
  });

  const userPreferences = pgTable(
    "user_preferences",
    {
      userId: uuid("user_id")
        .primaryKey()
        .references(() => user.id, { onDelete: "cascade" }),
      schemaVersion: smallint("schema_version").notNull(),
      preferences: jsonb("preferences").notNull(),
      version: integer("version").default(1).notNull(),
      createdAt: timestampColumn("created_at").defaultNow().notNull(),
      updatedAt: timestampColumn("updated_at").defaultNow().notNull(),
    },
    (table) => [
      check("user_preferences_schema_version_check", sql`${table.schemaVersion} = 1`),
      check("user_preferences_document_check", sql`jsonb_typeof(${table.preferences}) = 'object'`),
      check("user_preferences_version_check", sql`${table.version} > 0`),
    ],
  );

  return { user, session, account, verification, rateLimit, userPreferences };
}
