import { z } from 'zod';

/* ---- Collaboration Status ---- */

export const CollaborationStatusSchema = z.enum([
  'pending',
  'accepted',
  'in_progress',
  'completed',
  'failed',
  'rejected',
  'cancelled',
]);

export type CollaborationStatus = z.infer<typeof CollaborationStatusSchema>;

/* ---- Collaboration Priority ---- */

export const CollaborationPrioritySchema = z.enum(['low', 'normal', 'high', 'urgent']);

export type CollaborationPriority = z.infer<typeof CollaborationPrioritySchema>;

/* ---- Collaboration Message Type ---- */

export const CollaborationMessageTypeSchema = z.enum([
  'task',
  'status_update',
  'result',
  'question',
  'answer',
]);

export type CollaborationMessageType = z.infer<typeof CollaborationMessageTypeSchema>;

/* ---- Agent Availability Status ---- */

export const AgentAvailabilityStatusSchema = z.enum(['available', 'busy', 'offline']);

export type AgentAvailabilityStatus = z.infer<typeof AgentAvailabilityStatusSchema>;

/* ---- Agent Collaboration Interface ---- */

export interface AgentCollaboration {
  id: string;
  requester_agent_id: string;
  responder_agent_id: string;
  requester_user_id: string;
  conversation_id: string;
  status: CollaborationStatus;
  priority: CollaborationPriority;
  task_description: string;
  context: Record<string, unknown> | null;
  task_result: string | null;
  parent_request_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string | null;
  updated_at: string | null;
  completed_at: string | null;
}

/* ---- Collaboration Message Interface ---- */

export interface CollaborationMessage {
  id: string;
  request_id: string;
  from_agent_id: string;
  content: string;
  message_type: CollaborationMessageType;
  created_at: string | null;
}

/* ---- Agent Capability Interface ---- */

export interface AgentCapability {
  id: string;
  agent_id: string;
  capabilities: string[];
  max_concurrent_tasks: number;
  availability_status: AgentAvailabilityStatus;
  created_at: string | null;
  updated_at: string | null;
}

/* ---- Payloads ---- */

export interface CreateCollaborationPayload {
  responder_agent_id: string;
  task_description: string;
  context?: Record<string, unknown>;
  priority?: CollaborationPriority;
  parent_request_id?: string;
  metadata?: Record<string, unknown>;
}

export interface CompleteCollaborationPayload {
  result: string;
}

export interface RejectCollaborationPayload {
  reason: string;
}

export interface UpdateCollaborationProgressPayload {
  status: 'in_progress' | 'failed';
  message: string;
}

export interface RegisterCapabilitiesPayload {
  capabilities: string[];
  max_concurrent_tasks?: number;
}

export interface ListCollaborationsQuery {
  status?: CollaborationStatus;
  direction?: 'sent' | 'received';
}

/* ---- Socket.IO Events ---- */

export const CollaborationRequestedEventSchema = z.object({
  type: z.literal('collaboration:requested'),
  collaboration_id: z.string(),
  requester_agent_id: z.string(),
  responder_agent_id: z.string(),
  task_description: z.string(),
  priority: CollaborationPrioritySchema,
});

export const CollaborationAcceptedEventSchema = z.object({
  type: z.literal('collaboration:accepted'),
  collaboration_id: z.string(),
  responder_agent_id: z.string(),
});

export const CollaborationProgressEventSchema = z.object({
  type: z.literal('collaboration:progress'),
  collaboration_id: z.string(),
  agent_id: z.string(),
  status: z.string(),
  message: z.string(),
});

export const CollaborationCompletedEventSchema = z.object({
  type: z.literal('collaboration:completed'),
  collaboration_id: z.string(),
  responder_agent_id: z.string(),
  result: z.string(),
});

export const CollaborationRejectedEventSchema = z.object({
  type: z.literal('collaboration:rejected'),
  collaboration_id: z.string(),
  responder_agent_id: z.string(),
  reason: z.string(),
});

export const CollaborationFailedEventSchema = z.object({
  type: z.literal('collaboration:failed'),
  collaboration_id: z.string(),
  agent_id: z.string(),
  message: z.string(),
});

export type CollaborationRequestedEvent = z.infer<typeof CollaborationRequestedEventSchema>;
export type CollaborationAcceptedEvent = z.infer<typeof CollaborationAcceptedEventSchema>;
export type CollaborationProgressEvent = z.infer<typeof CollaborationProgressEventSchema>;
export type CollaborationCompletedEvent = z.infer<typeof CollaborationCompletedEventSchema>;
export type CollaborationRejectedEvent = z.infer<typeof CollaborationRejectedEventSchema>;
export type CollaborationFailedEvent = z.infer<typeof CollaborationFailedEventSchema>;
export type CollaborationEvent =
  | CollaborationRequestedEvent
  | CollaborationAcceptedEvent
  | CollaborationProgressEvent
  | CollaborationCompletedEvent
  | CollaborationRejectedEvent
  | CollaborationFailedEvent;
