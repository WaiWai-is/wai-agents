import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  bigint,
  jsonb,
  timestamp,
} from 'drizzle-orm/pg-core';
import { bytea } from './custom-types.js';

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  username: varchar('username', { length: 32 }).unique().notNull(),
  displayName: varchar('display_name', { length: 128 }),
  email: varchar('email', { length: 255 }).unique().notNull(),
  passwordHash: varchar('password_hash', { length: 255 }),
  avatarUrl: text('avatar_url'),
  bio: text('bio'),
  status: varchar('status', { length: 16 }).default('active'),
  role: varchar('role', { length: 16 }).default('user'),
  settings: jsonb('settings').default({}),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
  plan: varchar('plan', { length: 20 }).default('free'),
  insertedAt: timestamp('inserted_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export const userCredentials = pgTable('user_credentials', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  credentialId: bytea('credential_id').unique().notNull(),
  publicKey: bytea('public_key'),
  signCount: bigint('sign_count', { mode: 'number' }).default(0),
  name: varchar('name', { length: 255 }),
  insertedAt: timestamp('inserted_at', { withTimezone: true }).defaultNow(),
});

export type UserCredential = typeof userCredentials.$inferSelect;
export type NewUserCredential = typeof userCredentials.$inferInsert;
