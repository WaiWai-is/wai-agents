import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  jsonb,
  timestamp,
  uniqueIndex,
  integer,
} from 'drizzle-orm/pg-core';
import { users } from './users.js';
import { agents } from './agents.js';

export const conversations = pgTable('conversations', {
  id: uuid('id').primaryKey().defaultRandom(),
  type: varchar('type', { length: 16 }),
  title: varchar('title', { length: 255 }),
  avatarUrl: text('avatar_url'),
  creatorId: uuid('creator_id').references(() => users.id, { onDelete: 'set null' }),
  agentId: uuid('agent_id').references(() => agents.id, { onDelete: 'set null' }),
  bridgeId: uuid('bridge_id'),
  metadata: jsonb('metadata').default({}),
  lastMessageAt: timestamp('last_message_at', { withTimezone: true }),
  insertedAt: timestamp('inserted_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

export type Conversation = typeof conversations.$inferSelect;
export type NewConversation = typeof conversations.$inferInsert;

export const conversationMembers = pgTable(
  'conversation_members',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: varchar('role', { length: 16 }).default('member'),
    muted: boolean('muted').default(false),
    lastReadAt: timestamp('last_read_at', { withTimezone: true }),
    joinedAt: timestamp('joined_at', { withTimezone: true }),
  },
  (table) => ({
    uniqConversationUser: uniqueIndex('conversation_members_conversation_user_idx').on(
      table.conversationId,
      table.userId
    ),
  })
);

export type ConversationMember = typeof conversationMembers.$inferSelect;
export type NewConversationMember = typeof conversationMembers.$inferInsert;

// Messages table is range-partitioned by created_at in production.
// Drizzle does not model partitioning natively; we define the schema
// to match the columns and rely on the DB-level partition setup.
export const messages = pgTable('messages', {
  id: uuid('id').notNull(),
  conversationId: uuid('conversation_id')
    .notNull()
    .references(() => conversations.id, { onDelete: 'cascade' }),
  senderId: uuid('sender_id').references(() => users.id),
  senderType: varchar('sender_type', { length: 16 }),
  type: varchar('type', { length: 16 }),
  content: jsonb('content').notNull(),
  metadata: jsonb('metadata').default({}),
  editedAt: timestamp('edited_at', { withTimezone: true }),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  // created_at is the partition key and also serves as inserted_at
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type Message = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;

export const messageReactions = pgTable(
  'message_reactions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // No FK - messages table is partitioned
    messageId: uuid('message_id').notNull(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    emoji: varchar('emoji', { length: 32 }),
    insertedAt: timestamp('inserted_at', { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    uniqMessageUserEmoji: uniqueIndex('message_reactions_message_user_emoji_idx').on(
      table.messageId,
      table.userId,
      table.emoji
    ),
  })
);

export type MessageReaction = typeof messageReactions.$inferSelect;
export type NewMessageReaction = typeof messageReactions.$inferInsert;

export const idempotencyKeys = pgTable(
  'idempotency_keys',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    key: text('key').notNull(),
    userId: uuid('user_id').notNull(),
    responseCode: integer('response_code'),
    responseBody: jsonb('response_body'),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    insertedAt: timestamp('inserted_at', { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    uniqKeyUser: uniqueIndex('idempotency_keys_key_user_idx').on(table.key, table.userId),
  })
);

export type IdempotencyKey = typeof idempotencyKeys.$inferSelect;
export type NewIdempotencyKey = typeof idempotencyKeys.$inferInsert;
