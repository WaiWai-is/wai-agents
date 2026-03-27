/**
 * Wai Database Schema — Single PostgreSQL database for everything.
 *
 * Tables:
 * - users: registered users (mapped from Telegram)
 * - telegram_sessions: Telethon session strings (encrypted)
 * - telegram_chats: synced Telegram chats
 * - messages: all synced messages with pgvector embeddings
 * - commitments: tracked promises (bi-directional)
 * - entities: extracted people, topics, decisions
 * - entity_relations: knowledge graph edges
 * - daily_digests: AI-generated daily summaries
 * - sites: deployed user sites
 * - user_settings: per-user preferences
 */

import {
  pgTable,
  uuid,
  text,
  varchar,
  integer,
  boolean,
  timestamp,
  bigint,
  index,
  uniqueIndex,
  jsonb,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// ============================================================
// Users
// ============================================================

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  telegramUserId: bigint("telegram_user_id", { mode: "number" }).unique(),
  email: varchar("email", { length: 255 }).unique(),
  name: varchar("name", { length: 255 }),
  language: varchar("language", { length: 10 }).default("en"),
  timezone: varchar("timezone", { length: 50 }).default("UTC"),
  plan: varchar("plan", { length: 20 }).default("free"), // free, pro, team
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// ============================================================
// Telegram Integration
// ============================================================

export const telegramSessions = pgTable("telegram_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  phoneNumber: varchar("phone_number", { length: 20 }),
  sessionString: text("session_string"), // Encrypted with Fernet
  telegramUserId: bigint("telegram_user_id", { mode: "number" }),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const telegramChats = pgTable(
  "telegram_chats",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
    telegramChatId: bigint("telegram_chat_id", { mode: "number" }).notNull(),
    chatType: varchar("chat_type", { length: 20 }), // private, group, supergroup, channel
    title: varchar("title", { length: 500 }),
    username: varchar("username", { length: 255 }),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }),
    lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
    totalMessagesSynced: integer("total_messages_synced").default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    uniqueIndex("chats_user_telegram_idx").on(table.userId, table.telegramChatId),
  ],
);

// ============================================================
// Messages (with pgvector embeddings)
// ============================================================

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    chatId: uuid("chat_id").references(() => telegramChats.id, { onDelete: "cascade" }).notNull(),
    telegramMessageId: bigint("telegram_message_id", { mode: "number" }).notNull(),
    text: text("text"),
    hasMedia: boolean("has_media").default(false),
    mediaType: varchar("media_type", { length: 20 }),
    senderName: varchar("sender_name", { length: 255 }),
    senderId: bigint("sender_id", { mode: "number" }),
    isOutgoing: boolean("is_outgoing").default(false),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    // pgvector embedding (1536 dimensions for text-embedding-3-small)
    // embedding column added via raw SQL migration (drizzle doesn't support vector natively)
    transcribedAt: timestamp("transcribed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    uniqueIndex("messages_chat_telegram_idx").on(table.chatId, table.telegramMessageId),
    index("messages_sent_at_idx").on(table.sentAt),
  ],
);

// ============================================================
// Commitments (promise tracking)
// ============================================================

export const commitments = pgTable(
  "commitments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
    who: varchar("who", { length: 200 }).notNull(),
    what: text("what").notNull(),
    direction: varchar("direction", { length: 20 }).notNull(), // i_promised, they_promised
    deadline: varchar("deadline", { length: 100 }),
    status: varchar("status", { length: 20 }).default("open"), // open, completed, overdue
    sourceChat: varchar("source_chat", { length: 200 }),
    sourceMessage: text("source_message"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    index("commitments_user_status_idx").on(table.userId, table.status),
    index("commitments_user_direction_idx").on(table.userId, table.direction),
  ],
);

// ============================================================
// Entities (knowledge graph nodes)
// ============================================================

export const entities = pgTable(
  "entities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
    type: varchar("type", { length: 50 }).notNull(), // person, topic, project, decision
    name: varchar("name", { length: 500 }).notNull(),
    metadata: jsonb("metadata"),
    mentionCount: integer("mention_count").default(1),
    lastMentionedAt: timestamp("last_mentioned_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("entities_user_type_idx").on(table.userId, table.type),
  ],
);

export const entityRelations = pgTable(
  "entity_relations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sourceId: uuid("source_id").references(() => entities.id, { onDelete: "cascade" }).notNull(),
    targetId: uuid("target_id").references(() => entities.id, { onDelete: "cascade" }).notNull(),
    relationType: varchar("relation_type", { length: 100 }),
    context: text("context"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("entity_relations_source_idx").on(table.sourceId),
    index("entity_relations_target_idx").on(table.targetId),
  ],
);

// ============================================================
// Daily Digests
// ============================================================

export const dailyDigests = pgTable(
  "daily_digests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
    digestDate: timestamp("digest_date", { withTimezone: true }).notNull(),
    content: text("content"),
    summaryStats: jsonb("summary_stats"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    uniqueIndex("digests_user_date_idx").on(table.userId, table.digestDate),
  ],
);

// ============================================================
// Sites (deployed by users)
// ============================================================

export const sites = pgTable(
  "sites",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
    slug: varchar("slug", { length: 100 }).unique().notNull(),
    title: varchar("title", { length: 500 }),
    description: text("description"),
    deploymentUrl: varchar("deployment_url", { length: 500 }),
    pagesUrl: varchar("pages_url", { length: 500 }),
    status: varchar("status", { length: 20 }).default("active"), // active, deleted
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("sites_user_idx").on(table.userId),
  ],
);

// ============================================================
// User Settings
// ============================================================

export const userSettings = pgTable("user_settings", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).unique().notNull(),
  realtimeSyncEnabled: boolean("realtime_sync_enabled").default(true),
  digestEnabled: boolean("digest_enabled").default(true),
  digestHourUtc: integer("digest_hour_utc").default(9),
  digestTimezone: varchar("digest_timezone", { length: 50 }).default("UTC"),
  digestTelegramEnabled: boolean("digest_telegram_enabled").default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});
