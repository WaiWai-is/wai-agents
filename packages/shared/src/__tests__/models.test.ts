import { describe, expect, it } from 'vitest';
import type {
  AgentEventStatus,
  AgentVisibility,
  AutonomyLevel,
  BridgeMethod,
  BridgePlatform,
  BridgeStatus,
  ChannelDirection,
  ConversationType,
  ExecutionMode,
  FeedItemType,
  FeedReferenceType,
  IntegrationAuthMethod,
  IntegrationStatus,
  MemberRole,
  MemoryType,
  MessageType,
  PageVisibility,
  ParticipantType,
  ScheduleType,
  SenderType,
  SoulBlockLabel,
  ToolApprovalDecision,
  ToolApprovalScope,
  UserRole,
  UserStatus,
} from '../types/models.js';

/* ================================================================
 * Type exhaustiveness tests — verify all union members compile
 * ================================================================ */

describe('ParticipantType', () => {
  it('covers all valid values', () => {
    const values: ParticipantType[] = ['user', 'agent'];
    expect(values).toHaveLength(2);
  });
});

describe('SenderType', () => {
  it('covers all valid values', () => {
    const values: SenderType[] = ['human', 'agent', 'bridge', 'system'];
    expect(values).toHaveLength(4);
  });
});

describe('ConversationType', () => {
  it('covers all valid values', () => {
    const values: ConversationType[] = ['dm', 'group', 'agent', 'bridge'];
    expect(values).toHaveLength(4);
  });
});

describe('MessageType', () => {
  it('covers all valid values', () => {
    const values: MessageType[] = ['text', 'media', 'code', 'embed', 'system', 'agent_status'];
    expect(values).toHaveLength(6);
  });
});

describe('UserStatus', () => {
  it('covers all valid values', () => {
    const values: UserStatus[] = ['active', 'suspended', 'deleted'];
    expect(values).toHaveLength(3);
  });
});

describe('UserRole', () => {
  it('covers all valid values', () => {
    const values: UserRole[] = ['user', 'admin', 'moderator'];
    expect(values).toHaveLength(3);
  });
});

describe('AgentVisibility', () => {
  it('covers all valid values', () => {
    const values: AgentVisibility[] = ['public', 'unlisted', 'private'];
    expect(values).toHaveLength(3);
  });
});

describe('MemberRole', () => {
  it('covers all valid values', () => {
    const values: MemberRole[] = ['owner', 'admin', 'member'];
    expect(values).toHaveLength(3);
  });
});

describe('AutonomyLevel', () => {
  it('covers all valid values', () => {
    const values: AutonomyLevel[] = [
      'ask_always',
      'ask_first_time',
      'ask_if_unsure',
      'autonomous',
    ];
    expect(values).toHaveLength(4);
  });
});

describe('ExecutionMode', () => {
  it('covers all valid values', () => {
    const values: ExecutionMode[] = ['raw', 'claude_sdk', 'openai_sdk'];
    expect(values).toHaveLength(3);
  });
});

describe('SoulBlockLabel', () => {
  it('covers all valid values', () => {
    const values: SoulBlockLabel[] = ['identity', 'rules', 'priorities', 'preferences'];
    expect(values).toHaveLength(4);
  });
});

describe('MemoryType', () => {
  it('covers all valid values', () => {
    const values: MemoryType[] = ['observation', 'reflection', 'fact', 'preference'];
    expect(values).toHaveLength(4);
  });
});

describe('ScheduleType', () => {
  it('covers all valid values', () => {
    const values: ScheduleType[] = ['cron', 'interval', 'once'];
    expect(values).toHaveLength(3);
  });
});

describe('AgentEventStatus', () => {
  it('covers all valid values', () => {
    const values: AgentEventStatus[] = ['running', 'completed', 'failed', 'timeout'];
    expect(values).toHaveLength(4);
  });
});

describe('ToolApprovalScope', () => {
  it('covers all valid values', () => {
    const values: ToolApprovalScope[] = [
      'allow_once',
      'allow_for_session',
      'always_for_agent_tool',
    ];
    expect(values).toHaveLength(3);
  });
});

describe('ToolApprovalDecision', () => {
  it('covers all valid values', () => {
    const values: ToolApprovalDecision[] = ['approved', 'denied', 'revoked', 'pending'];
    expect(values).toHaveLength(4);
  });
});

describe('BridgePlatform', () => {
  it('covers all valid values', () => {
    const values: BridgePlatform[] = ['telegram', 'whatsapp', 'signal', 'discord'];
    expect(values).toHaveLength(4);
  });
});

describe('BridgeMethod', () => {
  it('covers all valid values', () => {
    const values: BridgeMethod[] = ['user_level', 'bot', 'cloud_api'];
    expect(values).toHaveLength(3);
  });
});

describe('BridgeStatus', () => {
  it('covers all valid values', () => {
    const values: BridgeStatus[] = ['connected', 'reconnecting', 'disconnected', 'error'];
    expect(values).toHaveLength(4);
  });
});

describe('FeedItemType', () => {
  it('covers all valid values', () => {
    const values: FeedItemType[] = [
      'agent_showcase',
      'page_showcase',
      'tool_showcase',
      'remix',
      'creation',
    ];
    expect(values).toHaveLength(5);
  });
});

describe('FeedReferenceType', () => {
  it('covers all valid values', () => {
    const values: FeedReferenceType[] = ['agent', 'page', 'tool'];
    expect(values).toHaveLength(3);
  });
});

describe('IntegrationAuthMethod', () => {
  it('covers all valid values', () => {
    const values: IntegrationAuthMethod[] = ['oauth2', 'oauth2_pkce', 'bot_token', 'api_key'];
    expect(values).toHaveLength(4);
  });
});

describe('IntegrationStatus', () => {
  it('covers all valid values', () => {
    const values: IntegrationStatus[] = ['active', 'expired', 'revoked'];
    expect(values).toHaveLength(3);
  });
});

describe('ChannelDirection', () => {
  it('covers all valid values', () => {
    const values: ChannelDirection[] = ['inbound', 'outbound', 'both'];
    expect(values).toHaveLength(3);
  });
});

describe('PageVisibility', () => {
  it('covers all valid values', () => {
    const values: PageVisibility[] = ['public', 'unlisted', 'private'];
    expect(values).toHaveLength(3);
  });
});
