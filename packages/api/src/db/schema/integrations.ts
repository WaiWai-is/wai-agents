import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  integer,
  jsonb,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { bytea } from './custom-types.js';
import { users } from './users.js';
import { agents } from './agents.js';
import { conversations } from './conversations.js';

export const bridgeConnections = pgTable(
  'bridge_connections',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    platform: varchar('platform', { length: 16 }),
    method: varchar('method', { length: 16 }),
    status: varchar('status', { length: 16 }).default('disconnected'),
    encryptedCredentials: bytea('encrypted_credentials'),
    metadata: jsonb('metadata').default({}),
    lastSyncAt: timestamp('last_sync_at', { withTimezone: true }),
    insertedAt: timestamp('inserted_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    uniqUserPlatformMethod: uniqueIndex('bridge_connections_user_platform_method_idx').on(
      table.userId,
      table.platform,
      table.method
    ),
  })
);

export type BridgeConnection = typeof bridgeConnections.$inferSelect;
export type NewBridgeConnection = typeof bridgeConnections.$inferInsert;

export const integrationCredentials = pgTable(
  'integration_credentials',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    service: varchar('service', { length: 50 }),
    authMethod: varchar('auth_method', { length: 20 }),
    encryptedTokens: bytea('encrypted_tokens'),
    scopes: text('scopes').array().default([]),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    refreshExpiresAt: timestamp('refresh_expires_at', { withTimezone: true }),
    status: varchar('status', { length: 20 }).default('active'),
    metadata: jsonb('metadata').default({}),
    insertedAt: timestamp('inserted_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    uniqUserService: uniqueIndex('integration_credentials_user_service_idx').on(
      table.userId,
      table.service
    ),
  })
);

export type IntegrationCredential = typeof integrationCredentials.$inferSelect;
export type NewIntegrationCredential = typeof integrationCredentials.$inferInsert;

export const integrationRateLimits = pgTable(
  'integration_rate_limits',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    service: varchar('service', { length: 50 }),
    windowStart: timestamp('window_start', { withTimezone: true }),
    requestCount: integer('request_count').default(0),
    insertedAt: timestamp('inserted_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    uniqUserServiceWindow: uniqueIndex('integration_rate_limits_user_service_window_idx').on(
      table.userId,
      table.service,
      table.windowStart
    ),
  })
);

export type IntegrationRateLimit = typeof integrationRateLimits.$inferSelect;
export type NewIntegrationRateLimit = typeof integrationRateLimits.$inferInsert;

export const integrationWebhooks = pgTable('integration_webhooks', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  service: varchar('service', { length: 50 }),
  webhookId: varchar('webhook_id', { length: 100 }).unique(),
  secret: bytea('secret'),
  eventTypes: text('event_types').array().default([]),
  enabled: boolean('enabled').default(true),
  metadata: jsonb('metadata').default({}),
  insertedAt: timestamp('inserted_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

export type IntegrationWebhook = typeof integrationWebhooks.$inferSelect;
export type NewIntegrationWebhook = typeof integrationWebhooks.$inferInsert;

export const channelRoutes = pgTable(
  'channel_routes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    agentId: uuid('agent_id').references(() => agents.id, { onDelete: 'set null' }),
    conversationId: uuid('conversation_id').references(() => conversations.id, {
      onDelete: 'set null',
    }),
    service: varchar('service', { length: 50 }),
    externalChatId: varchar('external_chat_id', { length: 255 }),
    direction: varchar('direction', { length: 10 }).default('both'),
    enabled: boolean('enabled').default(true),
    metadata: jsonb('metadata').default({}),
    insertedAt: timestamp('inserted_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    uniqServiceExternalChatId: uniqueIndex('channel_routes_service_external_chat_id_idx').on(
      table.service,
      table.externalChatId
    ),
  })
);

export type ChannelRoute = typeof channelRoutes.$inferSelect;
export type NewChannelRoute = typeof channelRoutes.$inferInsert;

export const toolApprovals = pgTable('tool_approvals', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  agentId: uuid('agent_id')
    .notNull()
    .references(() => agents.id, { onDelete: 'cascade' }),
  conversationId: uuid('conversation_id').references(() => conversations.id, {
    onDelete: 'set null',
  }),
  toolName: varchar('tool_name', { length: 100 }),
  scope: varchar('scope', { length: 30 }),
  decision: varchar('decision', { length: 20 }),
  argumentsHash: varchar('arguments_hash', { length: 64 }),
  decidedAt: timestamp('decided_at', { withTimezone: true }),
  insertedAt: timestamp('inserted_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

export type ToolApproval = typeof toolApprovals.$inferSelect;
export type NewToolApproval = typeof toolApprovals.$inferInsert;
