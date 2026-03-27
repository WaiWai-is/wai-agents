/**
 * Shared types for the entire Wai platform.
 */

// Agent intent classification
export type Intent =
  | "search"
  | "voice_summary"
  | "digest"
  | "action"
  | "build"
  | "coach"
  | "chat";

// Commitment direction
export type CommitmentDirection = "i_promised" | "they_promised" | "mutual";
export type CommitmentStatus = "open" | "completed" | "overdue" | "cancelled";

// Entity types
export type EntityType =
  | "person"
  | "topic"
  | "decision"
  | "action_item"
  | "date"
  | "amount"
  | "location";

// Site status
export type SiteStatus = "active" | "building" | "failed" | "deleted";

// Agent result
export interface AgentResult {
  response: string;
  intent: Intent;
  modelUsed: string;
  inputTokens: number;
  outputTokens: number;
  toolCalls: number;
}

// Memory layer
export interface MemoryContext {
  identity: string[];    // Always loaded, who the user is
  working: string[];     // Auto-retrieved, current context
  recalled: string[];    // Semantic search results
}

// User with resolved Telegram ID
export interface ResolvedUser {
  id: string;
  telegramUserId: number;
  name: string | null;
  language: string;
  timezone: string;
  plan: string;
}
