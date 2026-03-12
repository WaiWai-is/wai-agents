import { describe, expect, it } from 'vitest';
import type {
	AgentCollaboration,
	AgentMemory,
	AgentWorkflow,
	CollaborationPriority,
	CollaborationStatus,
	CreateCollaborationPayload,
	CreateMemoryInput,
	KnowledgeEdge,
	KnowledgeNode,
	UpdateMemoryInput,
	WorkflowRunStatus,
	WorkflowStatus,
	WorkflowStep,
	WorkflowStepType,
} from '../types/index.js';
import {
	AgentAvailabilityStatusSchema,
	CollaborationMessageTypeSchema,
	CollaborationPrioritySchema,
	CollaborationStatusSchema,
	CrewStepSchema,
} from '../types/index.js';

/* ================================================================
 * CollaborationPrioritySchema
 * ================================================================ */

describe('CollaborationPrioritySchema', () => {
	it('accepts all valid priorities', () => {
		const validPriorities = ['low', 'normal', 'high', 'urgent'];
		for (const priority of validPriorities) {
			const result = CollaborationPrioritySchema.safeParse(priority);
			expect(result.success, `priority "${priority}" should be accepted`).toBe(true);
		}
	});

	it('rejects invalid priority', () => {
		const result = CollaborationPrioritySchema.safeParse('critical');
		expect(result.success).toBe(false);
	});

	it('rejects empty string', () => {
		const result = CollaborationPrioritySchema.safeParse('');
		expect(result.success).toBe(false);
	});

	it('rejects null', () => {
		const result = CollaborationPrioritySchema.safeParse(null);
		expect(result.success).toBe(false);
	});

	it('rejects number', () => {
		const result = CollaborationPrioritySchema.safeParse(1);
		expect(result.success).toBe(false);
	});

	it('rejects uppercase variant', () => {
		const result = CollaborationPrioritySchema.safeParse('HIGH');
		expect(result.success).toBe(false);
	});
});

/* ================================================================
 * CollaborationMessageTypeSchema
 * ================================================================ */

describe('CollaborationMessageTypeSchema', () => {
	it('accepts all valid message types', () => {
		const types = ['task', 'status_update', 'result', 'question', 'answer'];
		for (const t of types) {
			const result = CollaborationMessageTypeSchema.safeParse(t);
			expect(result.success, `type "${t}" should be accepted`).toBe(true);
		}
	});

	it('rejects unknown message type', () => {
		const result = CollaborationMessageTypeSchema.safeParse('notification');
		expect(result.success).toBe(false);
	});

	it('rejects empty string', () => {
		const result = CollaborationMessageTypeSchema.safeParse('');
		expect(result.success).toBe(false);
	});
});

/* ================================================================
 * AgentAvailabilityStatusSchema
 * ================================================================ */

describe('AgentAvailabilityStatusSchema', () => {
	it('accepts all valid availability statuses', () => {
		const statuses = ['available', 'busy', 'offline'];
		for (const status of statuses) {
			const result = AgentAvailabilityStatusSchema.safeParse(status);
			expect(result.success, `status "${status}" should be accepted`).toBe(true);
		}
	});

	it('rejects unknown availability status', () => {
		const result = AgentAvailabilityStatusSchema.safeParse('away');
		expect(result.success).toBe(false);
	});

	it('rejects null', () => {
		const result = AgentAvailabilityStatusSchema.safeParse(null);
		expect(result.success).toBe(false);
	});

	it('rejects boolean', () => {
		const result = AgentAvailabilityStatusSchema.safeParse(true);
		expect(result.success).toBe(false);
	});
});

/* ================================================================
 * CrewStepSchema
 * ================================================================ */

describe('CrewStepSchema', () => {
	it('accepts valid step with UUID and role', () => {
		const step = {
			agentId: '550e8400-e29b-41d4-a716-446655440000',
			role: 'researcher',
		};
		const result = CrewStepSchema.safeParse(step);
		expect(result.success).toBe(true);
	});

	it('accepts step with optional parallelGroup', () => {
		const step = {
			agentId: '550e8400-e29b-41d4-a716-446655440000',
			role: 'researcher',
			parallelGroup: 'group_a',
		};
		const result = CrewStepSchema.safeParse(step);
		expect(result.success).toBe(true);
		if (result.success) expect(result.data.parallelGroup).toBe('group_a');
	});

	it('rejects step with empty role', () => {
		const result = CrewStepSchema.safeParse({
			agentId: '550e8400-e29b-41d4-a716-446655440000',
			role: '',
		});
		expect(result.success).toBe(false);
	});

	it('rejects step with role exceeding 64 chars', () => {
		const result = CrewStepSchema.safeParse({
			agentId: '550e8400-e29b-41d4-a716-446655440000',
			role: 'A'.repeat(65),
		});
		expect(result.success).toBe(false);
	});

	it('accepts step with role of exactly 64 chars', () => {
		const result = CrewStepSchema.safeParse({
			agentId: '550e8400-e29b-41d4-a716-446655440000',
			role: 'A'.repeat(64),
		});
		expect(result.success).toBe(true);
	});

	it('rejects step with non-UUID agentId', () => {
		const result = CrewStepSchema.safeParse({
			agentId: 'not-a-uuid',
			role: 'researcher',
		});
		expect(result.success).toBe(false);
	});

	it('rejects step with missing agentId', () => {
		const result = CrewStepSchema.safeParse({ role: 'researcher' });
		expect(result.success).toBe(false);
	});

	it('rejects step with missing role', () => {
		const result = CrewStepSchema.safeParse({
			agentId: '550e8400-e29b-41d4-a716-446655440000',
		});
		expect(result.success).toBe(false);
	});

	it('rejects step with parallelGroup exceeding 32 chars', () => {
		const result = CrewStepSchema.safeParse({
			agentId: '550e8400-e29b-41d4-a716-446655440000',
			role: 'researcher',
			parallelGroup: 'X'.repeat(33),
		});
		expect(result.success).toBe(false);
	});

	it('accepts step with parallelGroup of exactly 32 chars', () => {
		const result = CrewStepSchema.safeParse({
			agentId: '550e8400-e29b-41d4-a716-446655440000',
			role: 'researcher',
			parallelGroup: 'X'.repeat(32),
		});
		expect(result.success).toBe(true);
	});
});

/* ================================================================
 * AgentCollaboration interface — compile-time shape
 * ================================================================ */

describe('AgentCollaboration — compile-time shape verification', () => {
	it('can construct a valid collaboration object', () => {
		const collab: AgentCollaboration = {
			id: 'collab-1',
			requester_agent_id: 'agent-1',
			responder_agent_id: 'agent-2',
			requester_user_id: 'user-1',
			conversation_id: 'conv-1',
			status: 'pending',
			priority: 'normal',
			task_description: 'Analyze data',
			context: null,
			task_result: null,
			parent_request_id: null,
			metadata: {},
			created_at: null,
			updated_at: null,
			completed_at: null,
		};
		expect(collab.id).toBe('collab-1');
		expect(collab.status).toBe('pending');
	});

	it('collaboration with all optional fields populated', () => {
		const collab: AgentCollaboration = {
			id: 'collab-2',
			requester_agent_id: 'agent-1',
			responder_agent_id: 'agent-2',
			requester_user_id: 'user-1',
			conversation_id: 'conv-1',
			status: 'completed',
			priority: 'urgent',
			task_description: 'Generate report',
			context: { topic: 'revenue' },
			task_result: 'Revenue increased 15%',
			parent_request_id: 'collab-0',
			metadata: { version: 1 },
			created_at: '2026-01-01T00:00:00.000Z',
			updated_at: '2026-01-01T01:00:00.000Z',
			completed_at: '2026-01-01T01:30:00.000Z',
		};
		expect(collab.task_result).toBe('Revenue increased 15%');
		expect(collab.context).toEqual({ topic: 'revenue' });
	});

	it('CollaborationStatus covers all values including cancelled', () => {
		const statuses: CollaborationStatus[] = [
			'pending',
			'accepted',
			'in_progress',
			'completed',
			'failed',
			'rejected',
			'cancelled',
		];
		expect(statuses).toHaveLength(7);
	});

	it('CollaborationPriority covers all values', () => {
		const priorities: CollaborationPriority[] = ['low', 'normal', 'high', 'urgent'];
		expect(priorities).toHaveLength(4);
	});
});

/* ================================================================
 * CreateCollaborationPayload — compile-time shape
 * ================================================================ */

describe('CreateCollaborationPayload — compile-time shape verification', () => {
	it('accepts minimal payload', () => {
		const payload: CreateCollaborationPayload = {
			responder_agent_id: 'agent-2',
			task_description: 'Help with analysis',
		};
		expect(payload.responder_agent_id).toBe('agent-2');
	});

	it('accepts payload with all optional fields', () => {
		const payload: CreateCollaborationPayload = {
			responder_agent_id: 'agent-2',
			task_description: 'Collaborate on report',
			context: { data: [1, 2, 3] },
			priority: 'high',
			parent_request_id: 'parent-1',
			metadata: { source: 'auto' },
		};
		expect(payload.priority).toBe('high');
		expect(payload.parent_request_id).toBe('parent-1');
	});
});

/* ================================================================
 * AgentMemory types — compile-time shape
 * ================================================================ */

describe('AgentMemory — compile-time shape verification', () => {
	it('can construct a full memory object', () => {
		const memory: AgentMemory = {
			id: 'mem-1',
			agent_id: 'agent-1',
			user_id: 'user-1',
			memory_type: 'fact',
			content: 'User prefers dark mode',
			embedding_key: null,
			embedding_text: null,
			importance: 0.8,
			access_count: 5,
			last_accessed_at: '2026-03-01T00:00:00.000Z',
			source_conversation_id: null,
			source_message_id: null,
			expires_at: null,
			metadata: {},
			created_at: '2026-01-01T00:00:00.000Z',
			updated_at: '2026-03-01T00:00:00.000Z',
		};
		expect(memory.memory_type).toBe('fact');
		expect(memory.importance).toBe(0.8);
	});

	it('memory_type accepts all valid types', () => {
		const types: AgentMemory['memory_type'][] = [
			'fact',
			'preference',
			'context',
			'relationship',
			'episodic',
			'semantic',
			'procedural',
		];
		expect(types).toHaveLength(7);
	});

	it('CreateMemoryInput with minimal fields', () => {
		const input: CreateMemoryInput = {
			memory_type: 'preference',
			content: 'Likes concise responses',
		};
		expect(input.memory_type).toBe('preference');
	});

	it('CreateMemoryInput with all optional fields', () => {
		const input: CreateMemoryInput = {
			memory_type: 'context',
			content: 'Working on Q1 report',
			embedding_key: 'emb_key_123',
			importance: 0.9,
			expires_at: '2026-06-01T00:00:00.000Z',
			metadata: { source: 'conversation' },
		};
		expect(input.importance).toBe(0.9);
		expect(input.embedding_key).toBe('emb_key_123');
	});

	it('UpdateMemoryInput with partial update', () => {
		const input: UpdateMemoryInput = {
			content: 'Updated content',
		};
		expect(input.content).toBe('Updated content');
	});

	it('UpdateMemoryInput with null embedding_key and expires_at', () => {
		const input: UpdateMemoryInput = {
			embedding_key: null,
			expires_at: null,
		};
		expect(input.embedding_key).toBeNull();
		expect(input.expires_at).toBeNull();
	});
});

/* ================================================================
 * KnowledgeGraph types — compile-time shape
 * ================================================================ */

describe('KnowledgeGraph — compile-time shape verification', () => {
	it('KnowledgeNode has expected fields', () => {
		const node: KnowledgeNode = {
			id: 'node-1',
			agent_id: 'agent-1',
			user_id: 'user-1',
			label: 'Person',
			name: 'Alice',
			description: 'A team member',
			properties: { role: 'engineer' },
			created_at: '2026-01-01T00:00:00.000Z',
			updated_at: null,
		};
		expect(node.label).toBe('Person');
		expect(node.properties).toEqual({ role: 'engineer' });
	});

	it('KnowledgeNode with null description', () => {
		const node: KnowledgeNode = {
			id: 'node-2',
			agent_id: 'agent-1',
			user_id: 'user-1',
			label: 'Concept',
			name: 'TDD',
			description: null,
			properties: {},
			created_at: null,
			updated_at: null,
		};
		expect(node.description).toBeNull();
	});

	it('KnowledgeEdge has expected fields', () => {
		const edge: KnowledgeEdge = {
			id: 'edge-1',
			agent_id: 'agent-1',
			user_id: 'user-1',
			source_node_id: 'node-1',
			target_node_id: 'node-2',
			relationship: 'knows_about',
			weight: 0.75,
			properties: {},
			created_at: null,
		};
		expect(edge.relationship).toBe('knows_about');
		expect(edge.weight).toBe(0.75);
	});
});

/* ================================================================
 * Workflow types — compile-time shape
 * ================================================================ */

describe('Workflow types — compile-time shape verification', () => {
	it('WorkflowStatus has expected union members', () => {
		const statuses: WorkflowStatus[] = ['draft', 'active', 'paused', 'archived'];
		expect(statuses).toHaveLength(4);
	});

	it('WorkflowStepType has expected union members', () => {
		const types: WorkflowStepType[] = [
			'prompt',
			'tool_call',
			'condition',
			'transform',
			'wait',
			'sub_workflow',
			'human_input',
		];
		expect(types).toHaveLength(7);
	});

	it('WorkflowRunStatus has expected union members', () => {
		const statuses: WorkflowRunStatus[] = [
			'pending',
			'running',
			'completed',
			'failed',
			'cancelled',
		];
		expect(statuses).toHaveLength(5);
	});

	it('AgentWorkflow can be constructed with all fields', () => {
		const workflow: AgentWorkflow = {
			id: 'wf-1',
			agent_id: 'agent-1',
			creator_id: 'user-1',
			name: 'Data Pipeline',
			description: 'Processes incoming data',
			status: 'active',
			trigger_config: { cron: '0 */6 * * *' },
			max_concurrent_runs: 3,
			metadata: {},
			created_at: '2026-01-01T00:00:00.000Z',
			updated_at: null,
		};
		expect(workflow.max_concurrent_runs).toBe(3);
	});

	it('AgentWorkflow with null description and trigger_config', () => {
		const workflow: AgentWorkflow = {
			id: 'wf-2',
			agent_id: 'agent-1',
			creator_id: 'user-1',
			name: 'Simple Workflow',
			description: null,
			status: 'draft',
			trigger_config: null,
			max_concurrent_runs: 1,
			metadata: {},
			created_at: null,
			updated_at: null,
		};
		expect(workflow.description).toBeNull();
		expect(workflow.trigger_config).toBeNull();
	});

	it('WorkflowStep can be constructed', () => {
		const step: WorkflowStep = {
			id: 'step-1',
			workflow_id: 'wf-1',
			name: 'Fetch Data',
			step_type: 'tool_call',
			config: { tool_name: 'web_search' },
			position: 0,
			timeout_ms: 30000,
			retry_config: { max_retries: 3 },
			metadata: {},
			created_at: null,
			updated_at: null,
		};
		expect(step.step_type).toBe('tool_call');
		expect(step.timeout_ms).toBe(30000);
	});
});
