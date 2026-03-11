import { ApiClient } from "./client";
import {
  type Agent,
  type AgentEvent,
  type AgentMemory,
  type AgentSchedule,
  type ApiListResponse,
  type BridgeConnection,
  type ChannelRoute,
  type Conversation,
  type ConversationMember,
  type FeedItem,
  type IntegrationStatus,
  type MarketplaceAgent,
  type MarketplaceAgentProfileResponse,
  type MarketplaceCategory,
  type Message,
  type Page,
  type PageVersion,
  type SessionTokens,
  type User
} from "../types";
import { createIdempotencyKey } from "../utils";

export type CursorParams = {
  cursor?: string | null;
  limit?: number;
};

export class WaiAgentsApi {
  constructor(private readonly client: ApiClient) {}

  register(payload: { username: string; email: string; password: string; display_name?: string }) {
    return this.client.request<{ user: User; tokens: SessionTokens }>("/auth/register", {
      method: "POST",
      body: JSON.stringify(payload)
    });
  }

  login(payload: { email: string; password: string }) {
    return this.client.request<{ user: User; tokens: SessionTokens }>("/auth/login", {
      method: "POST",
      body: JSON.stringify(payload)
    });
  }

  refresh(refreshToken: string) {
    return this.client.request<SessionTokens>("/auth/refresh", {
      method: "POST",
      body: JSON.stringify({ refresh_token: refreshToken })
    });
  }

  logout(refreshToken?: string) {
    return this.client.request<void>("/auth/logout", {
      method: "DELETE",
      body: JSON.stringify(refreshToken ? { refresh_token: refreshToken } : {})
    });
  }

  requestMagicLink(email: string) {
    return this.client.request<{ message: string }>("/auth/magic-link", {
      method: "POST",
      body: JSON.stringify({ email })
    });
  }

  verifyMagicLink(token: string) {
    return this.client.request<{ user: User; tokens: SessionTokens }>("/auth/magic-link/verify", {
      method: "POST",
      body: JSON.stringify({ token })
    });
  }

  me() {
    return this.client.request<{ user: User }>("/users/me");
  }

  updateMe(payload: Partial<Pick<User, "display_name" | "avatar_url" | "bio" | "settings">>) {
    return this.client.request<{ user: User }>("/users/me", {
      method: "PATCH",
      body: JSON.stringify(payload)
    });
  }

  usage() {
    return this.client.request<{
      user_id: string;
      usage: { tokens_used: number; tokens_limit: number; period_start: string; period_end: string };
    }>("/users/me/usage");
  }

  userByUsername(username: string) {
    return this.client.request<{ user: User }>(`/users/${encodeURIComponent(username)}`);
  }

  listConversations(params: CursorParams = {}) {
    return this.client.request<unknown>(
      `/conversations${toQueryString(params)}`
    ).then((payload) => normalizeListResponse<Conversation>(payload, ["conversations"]));
  }

  createConversation(payload: {
    type: "dm" | "group" | "agent" | "bridge";
    title?: string;
    member_id?: string;
    agent_id?: string;
    bridge_id?: string;
    metadata?: Record<string, unknown>;
  }) {
    return this.client.request<{ conversation: Conversation }>("/conversations", {
      method: "POST",
      body: JSON.stringify(normalizeCreateConversationPayload(payload))
    });
  }

  getConversation(conversationId: string) {
    return this.client.request<{ conversation: Conversation }>(`/conversations/${conversationId}`);
  }

  listMembers(conversationId: string, params: CursorParams = {}) {
    return this.client.request<unknown>(
      `/conversations/${conversationId}/members${toQueryString(params)}`
    ).then((payload) => normalizeListResponse<ConversationMember>(payload, ["members"]));
  }

  addMember(conversationId: string, userId: string, role: "owner" | "admin" | "member" = "member") {
    return this.client.request<{ member: ConversationMember }>(
      `/conversations/${conversationId}/members`,
      {
        method: "POST",
        body: JSON.stringify({ user_id: userId, role })
      }
    );
  }

  removeMember(conversationId: string, userId: string) {
    return this.client.request<void>(`/conversations/${conversationId}/members/${userId}`, {
      method: "DELETE"
    });
  }

  listMessages(conversationId: string, params: CursorParams = {}) {
    return this.client.request<unknown>(
      `/conversations/${conversationId}/messages${toQueryString(params)}`
    ).then((payload) => normalizeListResponse<Message>(payload, ["messages"]));
  }

  sendTextMessage(conversationId: string, text: string, metadata: Record<string, unknown> = {}) {
    return this.client.request<{ message: Message }>(`/conversations/${conversationId}/messages`, {
      method: "POST",
      headers: {
        "Idempotency-Key": createIdempotencyKey()
      },
      body: JSON.stringify({
        content: [{ type: "text", text }],
        ...(Object.keys(metadata).length > 0 ? { metadata } : {})
      })
    });
  }

  editTextMessage(conversationId: string, messageId: string, text: string) {
    return this.client.request<{ message: Message }>(
      `/conversations/${conversationId}/messages/${messageId}`,
      {
        method: "PATCH",
        body: JSON.stringify({ content: [{ type: "text", text }] })
      }
    );
  }

  deleteMessage(conversationId: string, messageId: string) {
    return this.client.request<{ message: Message }>(
      `/conversations/${conversationId}/messages/${messageId}`,
      {
        method: "DELETE"
      }
    );
  }

  listAgents(params: CursorParams = {}) {
    return this.client
      .request<unknown>(`/agents${toQueryString(params)}`)
      .then((payload) =>
        normalizeListResponse<MarketplaceAgent>(payload, ["agents"], normalizeMarketplaceAgent)
      );
  }

  startAgentConversation(agentId: string) {
    return this.client.request<{
      conversation: { id: string; type: string; title: string | null; agent_id: string; created_at: string };
    }>(`/agents/${agentId}/conversation`, {
      method: "POST",
      body: JSON.stringify({})
    });
  }

  listFeed(kind: "for_you" | "trending" | "following" | "new" = "for_you", params: CursorParams = {}) {
    const path =
      kind === "for_you"
        ? "/feed"
        : kind === "trending"
          ? "/feed/trending"
          : kind === "following"
            ? "/feed/following"
            : "/feed/new";

    return this.client
      .request<unknown>(`${path}${toQueryString(params)}`)
      .then((payload) => normalizeListResponse<FeedItem>(payload, ["items"]));
  }

  likeFeedItem(id: string) {
    return this.client.request<{ status: string }>(`/feed/${id}/like`, {
      method: "POST",
      body: JSON.stringify({})
    });
  }

  unlikeFeedItem(id: string) {
    return this.client.request<void>(`/feed/${id}/like`, { method: "DELETE" });
  }

  forkFeedItem(id: string) {
    return this.client.request<{ feed_item: FeedItem }>(`/feed/${id}/fork`, {
      method: "POST",
      headers: {
        "Idempotency-Key": createIdempotencyKey()
      },
      body: JSON.stringify({})
    });
  }

  listPages(params: CursorParams = {}) {
    return this.client
      .request<unknown>(`/pages${toQueryString(params)}`)
      .then((payload) => normalizeListResponse<Page>(payload, ["pages"]));
  }

  createPage(payload: {
    title: string;
    slug: string;
    description?: string;
    thumbnail_url?: string;
    r2_path?: string;
    visibility?: "public" | "unlisted" | "private";
    custom_domain?: string;
  }) {
    return this.client.request<{ page: Page }>("/pages", {
      method: "POST",
      body: JSON.stringify({
        ...payload,
        r2_path: payload.r2_path || `pages/${payload.slug}/index.html`
      })
    });
  }

  getPage(id: string) {
    return this.client.request<{ page: Page }>(`/pages/${id}`);
  }

  updatePage(
    id: string,
    payload: Partial<
      Pick<Page, "title" | "slug" | "description" | "thumbnail_url" | "visibility" | "custom_domain">
    >
  ) {
    return this.client.request<{ page: Page }>(`/pages/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload)
    });
  }

  deployPage(id: string, r2Path?: string) {
    return this.client.request<{ page: Page }>(`/pages/${id}/deploy`, {
      method: "POST",
      headers: {
        "Idempotency-Key": createIdempotencyKey()
      },
      body: JSON.stringify(r2Path ? { r2_path: r2Path } : {})
    });
  }

  listPageVersions(id: string) {
    return this.client.request<unknown>(`/pages/${id}/versions`).then((payload) => ({
      items: extractArray(payload, ["items", "versions"]) as PageVersion[]
    }));
  }

  forkPage(id: string, slug?: string) {
    return this.client.request<{ page: Page }>(`/pages/${id}/fork`, {
      method: "POST",
      headers: {
        "Idempotency-Key": createIdempotencyKey()
      },
      body: JSON.stringify(slug ? { slug } : {})
    });
  }

  listMarketplace(params: CursorParams = {}) {
    return this.client.request<unknown>(
      `/marketplace${toQueryString(params)}`
    ).then((payload) =>
      normalizeListResponse<MarketplaceAgent>(payload, ["agents"], normalizeMarketplaceAgent)
    );
  }

  searchMarketplace(query: string, params: CursorParams = {}) {
    const search = toQueryString({ ...params, q: query });
    return this.client
      .request<unknown>(`/marketplace/search${search}`)
      .then((payload) =>
        normalizeListResponse<MarketplaceAgent>(payload, ["agents"], normalizeMarketplaceAgent)
      );
  }

  marketplaceCategories() {
    return this.client
      .request<unknown>("/marketplace/categories")
      .then((payload) => normalizeMarketplaceCategoriesResponse(payload));
  }

  marketplaceAgent(slug: string) {
    return this.client
      .request<unknown>(`/marketplace/agents/${slug}`)
      .then((payload) => normalizeMarketplaceAgentProfileResponse(payload));
  }

  rateAgent(agentId: string, rating: number, review?: string) {
    return this.client.request<{ rating: { id: string; rating: number; review: string | null } }>(
      `/marketplace/agents/${agentId}/rate`,
      {
        method: "POST",
        body: JSON.stringify({ rating, review })
      }
    );
  }

  listBridges(params: CursorParams = {}) {
    return this.client
      .request<unknown>(`/bridges${toQueryString(params)}`)
      .then((payload) => normalizeListResponse<BridgeConnection>(payload, ["bridges"]));
  }

  connectTelegram(metadata: Record<string, unknown>) {
    return this.client.request<{ bridge: BridgeConnection }>("/bridges/telegram/connect", {
      method: "POST",
      body: JSON.stringify(metadata)
    });
  }

  connectWhatsapp(metadata: Record<string, unknown>) {
    return this.client.request<{ bridge: BridgeConnection }>("/bridges/whatsapp/connect", {
      method: "POST",
      body: JSON.stringify(metadata)
    });
  }

  disconnectBridge(id: string) {
    return this.client.request<void>(`/bridges/${id}`, { method: "DELETE" });
  }

  bridgeStatus(id: string) {
    return this.client.request<{
      id: string;
      platform: string;
      status: string;
      last_sync_at: string | null;
      updated_at: string;
    }>(`/bridges/${id}/status`);
  }

  // Agent CRUD

  createAgent(data: {
    name: string;
    slug: string;
    description?: string;
    system_prompt: string;
    model: string;
    execution_mode: Agent["execution_mode"];
    temperature?: number;
    max_tokens?: number;
    tools?: Agent["tools"];
    mcp_servers?: Agent["mcp_servers"];
    visibility?: Agent["visibility"];
    category?: string;
    metadata?: Record<string, unknown>;
  }) {
    return this.client.request<{ agent: Agent }>("/agents", {
      method: "POST",
      body: JSON.stringify(data)
    });
  }

  updateAgent(id: string, data: Partial<Omit<Agent, "id" | "creator_id" | "created_at" | "updated_at" | "usage_count" | "rating_sum" | "rating_count">>) {
    return this.client.request<{ agent: Agent }>(`/agents/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data)
    });
  }

  deleteAgent(id: string) {
    return this.client.request<void>(`/agents/${id}`, { method: "DELETE" });
  }

  getAgent(id: string) {
    return this.client.request<{ agent: Agent }>(`/agents/${id}`);
  }

  listMyAgents(params: CursorParams = {}) {
    return this.client
      .request<unknown>(`/agents${toQueryString(params)}`)
      .then((payload) => normalizeListResponse<Agent>(payload, ["agents"]));
  }

  // Agent Schedules

  listSchedules(agentId: string) {
    return this.client.request<{ items: AgentSchedule[] }>(`/agents/${agentId}/schedules`);
  }

  createSchedule(agentId: string, data: {
    schedule_type: AgentSchedule["schedule_type"];
    cron_expression?: string;
    interval_seconds?: number;
    run_at?: string;
    enabled?: boolean;
    max_runs?: number;
    payload?: Record<string, unknown>;
  }) {
    return this.client.request<{ schedule: AgentSchedule }>(`/agents/${agentId}/schedules`, {
      method: "POST",
      body: JSON.stringify(data)
    });
  }

  updateSchedule(agentId: string, scheduleId: string, data: Partial<Pick<AgentSchedule, "cron_expression" | "interval_seconds" | "run_at" | "enabled" | "max_runs" | "payload">>) {
    return this.client.request<{ schedule: AgentSchedule }>(`/agents/${agentId}/schedules/${scheduleId}`, {
      method: "PATCH",
      body: JSON.stringify(data)
    });
  }

  deleteSchedule(agentId: string, scheduleId: string) {
    return this.client.request<void>(`/agents/${agentId}/schedules/${scheduleId}`, { method: "DELETE" });
  }

  // Agent Memory

  listMemories(agentId: string, params: CursorParams = {}) {
    return this.client.request<ApiListResponse<AgentMemory>>(`/agents/${agentId}/memories${toQueryString(params)}`);
  }

  deleteMemory(agentId: string, memoryId: string) {
    return this.client.request<void>(`/agents/${agentId}/memories/${memoryId}`, { method: "DELETE" });
  }

  // Agent Events

  listAgentEvents(agentId: string, params: CursorParams & { event_type?: string } = {}) {
    return this.client.request<ApiListResponse<AgentEvent>>(`/agents/${agentId}/events${toQueryString(params)}`);
  }

  // Integrations

  listIntegrations() {
    return this.client.request<{ items: IntegrationStatus[] }>("/integrations");
  }

  authorizeIntegration(service: string) {
    return this.client.request<{ authorize_url: string }>(`/integrations/${encodeURIComponent(service)}/authorize`, {
      method: "POST",
      body: JSON.stringify({})
    });
  }

  disconnectIntegration(service: string) {
    return this.client.request<void>(`/integrations/${encodeURIComponent(service)}`, { method: "DELETE" });
  }

  integrationStatus(service: string) {
    return this.client.request<IntegrationStatus>(`/integrations/${encodeURIComponent(service)}/status`);
  }

  // Channel Routes

  listChannelRoutes(agentId: string) {
    return this.client.request<{ items: ChannelRoute[] }>(`/agents/${agentId}/channels`);
  }

  createChannelRoute(agentId: string, data: {
    service: string;
    external_chat_id: string;
    direction?: ChannelRoute["direction"];
    enabled?: boolean;
    metadata?: Record<string, unknown>;
  }) {
    return this.client.request<{ route: ChannelRoute }>(`/agents/${agentId}/channels`, {
      method: "POST",
      body: JSON.stringify(data)
    });
  }

  deleteChannelRoute(routeId: string) {
    return this.client.request<void>(`/channels/${routeId}`, { method: "DELETE" });
  }
}

type QueryValue = string | number | boolean | null | undefined;

type QueryParams = CursorParams & Record<string, QueryValue>;

function toQueryString(params: QueryParams): string {
  const search = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") {
      return;
    }

    search.set(key, String(value));
  });

  const serialized = search.toString();
  return serialized ? `?${serialized}` : "";
}

export function createWaiAgentsApi(getAccessToken?: () => string | undefined | Promise<string | undefined>) {
  const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "/api/v1";
  const client = new ApiClient({ baseUrl, getAccessToken });
  return new WaiAgentsApi(client);
}

/** @deprecated Use createWaiAgentsApi instead */
export const createRaccoonApi = createWaiAgentsApi;

function normalizeCreateConversationPayload(payload: {
  type: "dm" | "group" | "agent" | "bridge";
  title?: string;
  member_id?: string;
  agent_id?: string;
  bridge_id?: string;
  metadata?: Record<string, unknown>;
}) {
  const normalized: Record<string, unknown> = {
    type: payload.type
  };

  if (payload.title) {
    normalized.title = payload.title;
  }

  if (payload.member_id) {
    normalized.member_ids = [payload.member_id];
  }

  if (payload.agent_id) {
    normalized.agent_id = payload.agent_id;
  }

  if (payload.bridge_id) {
    normalized.bridge_id = payload.bridge_id;
  }

  if (payload.metadata && Object.keys(payload.metadata).length > 0) {
    normalized.metadata = payload.metadata;
  }

  return normalized;
}

function normalizeListResponse<T>(
  payload: unknown,
  alternativeCollectionKeys: string[],
  mapItem?: (item: unknown) => T
): ApiListResponse<T> {
  const rawItems = extractArray(payload, ["items", ...alternativeCollectionKeys]);
  const items = mapItem ? rawItems.map((item) => mapItem(item)) : (rawItems as T[]);

  return {
    items,
    page_info: normalizePageInfo(payload)
  };
}

function normalizePageInfo(payload: unknown): ApiListResponse<unknown>["page_info"] {
  if (!isRecord(payload)) {
    return { next_cursor: null, has_more: false };
  }

  const pageInfo = isRecord(payload.page_info)
    ? payload.page_info
    : isRecord(payload.pageInfo)
      ? payload.pageInfo
      : null;

  if (!pageInfo) {
    return { next_cursor: null, has_more: false };
  }

  return {
    next_cursor: asNullableString(pageInfo.next_cursor ?? pageInfo.nextCursor),
    has_more: asBoolean(pageInfo.has_more ?? pageInfo.hasMore)
  };
}

function normalizeMarketplaceCategoriesResponse(payload: unknown): { categories: MarketplaceCategory[] } {
  const categories = extractArray(payload, ["categories"]).map((item) => {
    if (isRecord(item)) {
      const name = asNonEmptyString(item.name) ?? asNonEmptyString(item.category) ?? "Other";
      return {
        slug: asNonEmptyString(item.slug) ?? slugify(name),
        name,
        description: asNonEmptyString(item.description) ?? ""
      };
    }

    const name = typeof item === "string" && item.trim().length > 0 ? item.trim() : "Other";
    return {
      slug: slugify(name),
      name,
      description: ""
    };
  });

  return { categories };
}

function normalizeMarketplaceAgentProfileResponse(payload: unknown): MarketplaceAgentProfileResponse {
  if (isRecord(payload) && isRecord(payload.agent)) {
    return {
      agent: normalizeMarketplaceAgent(payload.agent),
      ratings: extractArray(payload, ["ratings"]) as MarketplaceAgentProfileResponse["ratings"]
    };
  }

  return {
    agent: normalizeMarketplaceAgent(payload),
    ratings: []
  };
}

function normalizeMarketplaceAgent(item: unknown): MarketplaceAgent {
  const record = isRecord(item) ? item : {};
  const ratingCount = asNumber(record.rating_count) ?? 0;
  const ratingSum = asNumber(record.rating_sum) ?? 0;
  const averageRating =
    asNumber(record.average_rating) ??
    asNumber(record.rating_avg) ??
    (ratingCount > 0 ? ratingSum / ratingCount : 0);

  return {
    ...(record as unknown as MarketplaceAgent),
    rating_count: ratingCount,
    usage_count: asNumber(record.usage_count) ?? 0,
    average_rating: averageRating
  };
}

function extractArray(payload: unknown, keys: string[]): unknown[] {
  if (!isRecord(payload)) {
    return [];
  }

  for (const key of keys) {
    const candidate = payload[key];
    if (Array.isArray(candidate)) {
      return candidate;
    }
  }

  return [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asNullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function asNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function asBoolean(value: unknown): boolean {
  return value === true;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
