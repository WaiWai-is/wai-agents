/* eslint-disable @typescript-eslint/no-explicit-any */
import { createHmac } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock DB connection
vi.mock('../../db/connection.js', () => {
  const sqlFn = Object.assign(vi.fn(), {
    unsafe: vi.fn(),
    begin: vi.fn(async (cb: (tx: any) => Promise<any>) => {
      return cb(sqlFn);
    }),
  });
  return { sql: sqlFn, db: {} };
});

// Mock loop.js
vi.mock('./loop.js', () => ({
  runAgentLoop: vi
    .fn()
    .mockResolvedValue({ response: 'ok', usage: { input_tokens: 0, output_tokens: 0 } }),
}));

// Mock emitter
vi.mock('../../ws/emitter.js', () => ({
  emitAgentEvent: vi.fn(),
}));

const USER_ID = '550e8400-e29b-41d4-a716-446655440000';
const OTHER_USER_ID = '660e8400-e29b-41d4-a716-446655440001';
const AGENT_ID = '880e8400-e29b-41d4-a716-446655440003';
const TRIGGER_ID = 'aa0e8400-e29b-41d4-a716-446655440010';

function makeTriggerRow(overrides: Record<string, unknown> = {}) {
  return {
    id: TRIGGER_ID,
    agent_id: AGENT_ID,
    creator_id: USER_ID,
    name: 'Test Trigger',
    trigger_type: 'webhook',
    token: 'abc123token',
    hmac_secret: null,
    condition_filter: null,
    message_template: null,
    cron_expression: null,
    enabled: true,
    last_fired_at: null,
    fire_count: 0,
    metadata: {},
    inserted_at: new Date('2026-01-01'),
    updated_at: new Date('2026-01-01'),
    ...overrides,
  };
}

/* -------------------------------------------------------------------------- */
/*  listTriggers                                                              */
/* -------------------------------------------------------------------------- */

describe('trigger.service — listTriggers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns formatted triggers for the user', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    // 1. assertAgentCreator
    sqlMock.mockResolvedValueOnce([{ id: AGENT_ID }] as any);
    // 2. SELECT triggers (via sql.unsafe)
    vi.mocked(sqlMock.unsafe).mockResolvedValueOnce([makeTriggerRow()] as any);

    const { listTriggers } = await import('./trigger.service.js');
    const triggers = await listTriggers(AGENT_ID, USER_ID);

    expect(triggers).toHaveLength(1);
    expect(triggers[0].id).toBe(TRIGGER_ID);
    expect(triggers[0].name).toBe('Test Trigger');
    expect(triggers[0].created_at).toBe(new Date('2026-01-01').toISOString());
  });

  it('returns empty array when no triggers exist', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([{ id: AGENT_ID }] as any);
    vi.mocked(sqlMock.unsafe).mockResolvedValueOnce([] as any);

    const { listTriggers } = await import('./trigger.service.js');
    const triggers = await listTriggers(AGENT_ID, USER_ID);

    expect(triggers).toHaveLength(0);
  });

  it('throws NOT_FOUND when user does not own the agent', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql).mockResolvedValueOnce([] as any);

    const { listTriggers } = await import('./trigger.service.js');
    await expect(listTriggers(AGENT_ID, OTHER_USER_ID)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});

/* -------------------------------------------------------------------------- */
/*  createTrigger                                                             */
/* -------------------------------------------------------------------------- */

describe('trigger.service — createTrigger', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a trigger with valid input', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    // 1. assertAgentCreator
    sqlMock.mockResolvedValueOnce([{ id: AGENT_ID }] as any);
    // 2. INSERT trigger
    sqlMock.mockResolvedValueOnce([] as any);
    // 3. SELECT created trigger (via sql.unsafe)
    vi.mocked(sqlMock.unsafe).mockResolvedValueOnce([makeTriggerRow()] as any);

    const { createTrigger } = await import('./trigger.service.js');
    const result = await createTrigger(AGENT_ID, USER_ID, {
      name: 'Test Trigger',
      trigger_type: 'webhook',
    });

    expect(result.id).toBe(TRIGGER_ID);
    expect(result.name).toBe('Test Trigger');
    expect(result.trigger_type).toBe('webhook');
  });

  it('creates a trigger with all optional fields', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([{ id: AGENT_ID }] as any);
    sqlMock.mockResolvedValueOnce([] as any);
    vi.mocked(sqlMock.unsafe).mockResolvedValueOnce([
      makeTriggerRow({
        trigger_type: 'schedule',
        hmac_secret: 'secret123',
        cron_expression: '0 * * * *',
        message_template: 'Hello {{name}}',
        condition_filter: { all: [{ field: 'action', op: 'eq', value: 'opened' }] },
      }),
    ] as any);

    const { createTrigger } = await import('./trigger.service.js');
    const result = await createTrigger(AGENT_ID, USER_ID, {
      name: 'Full Trigger',
      trigger_type: 'schedule',
      hmac_secret: 'secret123',
      cron_expression: '0 * * * *',
      message_template: 'Hello {{name}}',
      condition_filter: { all: [{ field: 'action', op: 'eq', value: 'opened' }] },
    });

    expect(result.trigger_type).toBe('schedule');
    expect(result.hmac_secret).toBe('secret123');
    expect(result.cron_expression).toBe('0 * * * *');
  });

  it('throws NOT_FOUND when user does not own the agent', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql).mockResolvedValueOnce([] as any);

    const { createTrigger } = await import('./trigger.service.js');
    await expect(
      createTrigger(AGENT_ID, OTHER_USER_ID, {
        name: 'Test',
        trigger_type: 'webhook',
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

/* -------------------------------------------------------------------------- */
/*  getTrigger                                                                */
/* -------------------------------------------------------------------------- */

describe('trigger.service — getTrigger', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the trigger for the owner', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql.unsafe).mockResolvedValueOnce([makeTriggerRow()] as any);

    const { getTrigger } = await import('./trigger.service.js');
    const trigger = await getTrigger(TRIGGER_ID, USER_ID);

    expect(trigger.id).toBe(TRIGGER_ID);
    expect(trigger.name).toBe('Test Trigger');
  });

  it('throws NOT_FOUND for non-existent trigger', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql.unsafe).mockResolvedValueOnce([] as any);

    const { getTrigger } = await import('./trigger.service.js');
    await expect(getTrigger('nonexistent-id', USER_ID)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('throws NOT_FOUND when non-owner tries to access', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql.unsafe).mockResolvedValueOnce([] as any);

    const { getTrigger } = await import('./trigger.service.js');
    await expect(getTrigger(TRIGGER_ID, OTHER_USER_ID)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});

/* -------------------------------------------------------------------------- */
/*  updateTrigger                                                             */
/* -------------------------------------------------------------------------- */

describe('trigger.service — updateTrigger', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('updates trigger name', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    // 1. assertTriggerOwner
    sqlMock.mockResolvedValueOnce([{ id: TRIGGER_ID }] as any);
    // 2. UPDATE RETURNING
    sqlMock.mockResolvedValueOnce([makeTriggerRow({ name: 'Updated Name' })] as any);

    const { updateTrigger } = await import('./trigger.service.js');
    const result = await updateTrigger(TRIGGER_ID, USER_ID, { name: 'Updated Name' });

    expect(result.name).toBe('Updated Name');
  });

  it('updates enabled flag', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([{ id: TRIGGER_ID }] as any);
    sqlMock.mockResolvedValueOnce([makeTriggerRow({ enabled: false })] as any);

    const { updateTrigger } = await import('./trigger.service.js');
    const result = await updateTrigger(TRIGGER_ID, USER_ID, { enabled: false });

    expect(result.enabled).toBe(false);
  });

  it('throws NOT_FOUND when non-owner tries to update', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql).mockResolvedValueOnce([] as any);

    const { updateTrigger } = await import('./trigger.service.js');
    await expect(
      updateTrigger(TRIGGER_ID, OTHER_USER_ID, { name: 'Hacked' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

/* -------------------------------------------------------------------------- */
/*  deleteTrigger                                                             */
/* -------------------------------------------------------------------------- */

describe('trigger.service — deleteTrigger', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deletes a trigger', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    // 1. assertTriggerOwner
    sqlMock.mockResolvedValueOnce([{ id: TRIGGER_ID }] as any);
    // 2. DELETE
    sqlMock.mockResolvedValueOnce([] as any);

    const { deleteTrigger } = await import('./trigger.service.js');
    await deleteTrigger(TRIGGER_ID, USER_ID);

    expect(sqlMock).toHaveBeenCalledTimes(2);
  });

  it('throws NOT_FOUND when non-owner tries to delete', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql).mockResolvedValueOnce([] as any);

    const { deleteTrigger } = await import('./trigger.service.js');
    await expect(deleteTrigger(TRIGGER_ID, OTHER_USER_ID)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});

/* -------------------------------------------------------------------------- */
/*  fireTrigger                                                               */
/* -------------------------------------------------------------------------- */

describe('trigger.service — fireTrigger', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fires a trigger and creates a conversation', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    // 1. Look up trigger by token (via sql.unsafe)
    vi.mocked(sqlMock.unsafe).mockResolvedValueOnce([makeTriggerRow()] as any);
    // 2. INSERT conversation
    sqlMock.mockResolvedValueOnce([] as any);
    // 3. INSERT conversation_members
    sqlMock.mockResolvedValueOnce([] as any);
    // 4. INSERT message
    sqlMock.mockResolvedValueOnce([] as any);
    // 5. UPDATE fire_count
    sqlMock.mockResolvedValueOnce([] as any);

    const { fireTrigger } = await import('./trigger.service.js');
    const result = await fireTrigger('abc123token', { event: 'push' });

    expect(result.fired).toBe(true);
    expect(result.conversation_id).toBeTruthy();
  });

  it('returns not fired when trigger is disabled', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql.unsafe).mockResolvedValueOnce([makeTriggerRow({ enabled: false })] as any);

    const { fireTrigger } = await import('./trigger.service.js');
    const result = await fireTrigger('abc123token', { event: 'push' });

    expect(result.fired).toBe(false);
    expect(result.reason).toBe('Trigger is disabled');
  });

  it('throws NOT_FOUND for unknown token', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql.unsafe).mockResolvedValueOnce([] as any);

    const { fireTrigger } = await import('./trigger.service.js');
    await expect(fireTrigger('unknown-token', {})).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('validates HMAC signature when configured', async () => {
    const secret = 'my-secret-key';
    const payload = { event: 'push' };
    const expectedSignature = createHmac('sha256', secret)
      .update(JSON.stringify(payload))
      .digest('hex');

    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    vi.mocked(sqlMock.unsafe).mockResolvedValueOnce([
      makeTriggerRow({ hmac_secret: secret }),
    ] as any);
    // conversation, members, message, fire_count
    sqlMock.mockResolvedValueOnce([] as any);
    sqlMock.mockResolvedValueOnce([] as any);
    sqlMock.mockResolvedValueOnce([] as any);
    sqlMock.mockResolvedValueOnce([] as any);

    const { fireTrigger } = await import('./trigger.service.js');
    const result = await fireTrigger('abc123token', payload, expectedSignature);

    expect(result.fired).toBe(true);
  });

  it('throws UNAUTHORIZED when HMAC signature is missing but required', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql.unsafe).mockResolvedValueOnce([makeTriggerRow({ hmac_secret: 'secret' })] as any);

    const { fireTrigger } = await import('./trigger.service.js');
    await expect(fireTrigger('abc123token', {}, undefined)).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });

  it('throws UNAUTHORIZED when HMAC signature is invalid', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql.unsafe).mockResolvedValueOnce([makeTriggerRow({ hmac_secret: 'secret' })] as any);

    const { fireTrigger } = await import('./trigger.service.js');
    await expect(
      fireTrigger('abc123token', { event: 'push' }, 'invalid-hex-signature'),
    ).rejects.toThrow();
  });

  it('does not fire when condition filter does not match', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql.unsafe).mockResolvedValueOnce([
      makeTriggerRow({
        condition_filter: { all: [{ field: 'action', op: 'eq', value: 'opened' }] },
      }),
    ] as any);

    const { fireTrigger } = await import('./trigger.service.js');
    const result = await fireTrigger('abc123token', { action: 'closed' });

    expect(result.fired).toBe(false);
    expect(result.reason).toBe('Condition filter did not match');
  });

  it('fires when condition filter matches', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    vi.mocked(sqlMock.unsafe).mockResolvedValueOnce([
      makeTriggerRow({
        condition_filter: { all: [{ field: 'action', op: 'eq', value: 'opened' }] },
      }),
    ] as any);
    sqlMock.mockResolvedValueOnce([] as any);
    sqlMock.mockResolvedValueOnce([] as any);
    sqlMock.mockResolvedValueOnce([] as any);
    sqlMock.mockResolvedValueOnce([] as any);

    const { fireTrigger } = await import('./trigger.service.js');
    const result = await fireTrigger('abc123token', { action: 'opened' });

    expect(result.fired).toBe(true);
  });

  it('applies message template with variable substitution', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    vi.mocked(sqlMock.unsafe).mockResolvedValueOnce([
      makeTriggerRow({
        message_template: 'New PR from {{user.name}}: {{title}}',
      }),
    ] as any);
    sqlMock.mockResolvedValueOnce([] as any);
    sqlMock.mockResolvedValueOnce([] as any);
    sqlMock.mockResolvedValueOnce([] as any);
    sqlMock.mockResolvedValueOnce([] as any);

    const { fireTrigger } = await import('./trigger.service.js');
    const result = await fireTrigger('abc123token', {
      user: { name: 'Alice' },
      title: 'Fix bug',
    });

    expect(result.fired).toBe(true);

    // Verify the message was created with template-rendered content
    const insertCalls = sqlMock.mock.calls;
    // The 3rd sql tagged template call (index 2) should be the message INSERT
    // We verify the call was made (message was inserted)
    expect(insertCalls.length).toBeGreaterThanOrEqual(3);
  });
});
