import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest';
import { ApiClient } from '../client';
import { WaiAgentsApi } from '../services';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('WaiAgentsApi — trigger methods', () => {
  let fetchMock: Mock;
  let api: WaiAgentsApi;

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue(jsonResponse({}));
    const client = new ApiClient({
      baseUrl: 'https://api.test.com',
      fetchImpl: fetchMock,
    });
    api = new WaiAgentsApi(client);
  });

  describe('listTriggers', () => {
    it('sends GET /agents/:agentId/triggers', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse({
          triggers: [{ id: 'tr_1', name: 'Daily digest' }],
          page_info: { next_cursor: null, has_more: false },
        }),
      );

      const result = await api.listTriggers('agent_1');

      const [url] = fetchMock.mock.calls[0];
      expect(url).toBe('https://api.test.com/agents/agent_1/triggers');
      expect(result.items).toHaveLength(1);
      expect(result.items[0].id).toBe('tr_1');
    });

    it('passes cursor and limit as query params', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse({ triggers: [], page_info: { next_cursor: null, has_more: false } }),
      );

      await api.listTriggers('agent_1', { cursor: 'c1', limit: 25 });

      const [url] = fetchMock.mock.calls[0];
      expect(url).toContain('cursor=c1');
      expect(url).toContain('limit=25');
    });

    it('normalizes page_info', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse({
          triggers: [],
          page_info: { next_cursor: 'pg2', has_more: true },
        }),
      );

      const result = await api.listTriggers('agent_1');

      expect(result.page_info.next_cursor).toBe('pg2');
      expect(result.page_info.has_more).toBe(true);
    });

    it('returns empty items when payload has no triggers key', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ unrelated: [1] }));

      const result = await api.listTriggers('agent_1');

      expect(result.items).toEqual([]);
    });
  });

  describe('createTrigger', () => {
    it('sends POST /agents/:agentId/triggers with correct payload', async () => {
      const triggerData = {
        name: 'On new PR',
        trigger_type: 'webhook' as const,
        config: { url: 'https://hooks.example.com/pr' },
        enabled: true,
      };
      fetchMock.mockResolvedValue(jsonResponse({ trigger: { id: 'tr_new', ...triggerData } }));

      const result = await api.createTrigger('agent_1', triggerData);

      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe('https://api.test.com/agents/agent_1/triggers');
      expect(init.method).toBe('POST');
      const body = JSON.parse(init.body);
      expect(body.name).toBe('On new PR');
      expect(body.trigger_type).toBe('webhook');
      expect(body.config.url).toBe('https://hooks.example.com/pr');
      expect(body.enabled).toBe(true);
      expect(result.trigger.id).toBe('tr_new');
    });

    it('sends minimal payload when optional fields are omitted', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ trigger: { id: 'tr_min' } }));

      await api.createTrigger('agent_1', {
        name: 'Minimal trigger',
        trigger_type: 'event',
      });

      const [, init] = fetchMock.mock.calls[0];
      const body = JSON.parse(init.body);
      expect(body.name).toBe('Minimal trigger');
      expect(body.trigger_type).toBe('event');
      expect(body.config).toBeUndefined();
      expect(body.enabled).toBeUndefined();
    });

    it('includes crew_id when provided', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ trigger: { id: 'tr_crew' } }));

      await api.createTrigger('agent_1', {
        name: 'Crew trigger',
        trigger_type: 'schedule',
        crew_id: 'cr_1',
      });

      const [, init] = fetchMock.mock.calls[0];
      const body = JSON.parse(init.body);
      expect(body.crew_id).toBe('cr_1');
    });
  });

  describe('getTrigger', () => {
    it('sends GET /agents/:agentId/triggers/:triggerId', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ trigger: { id: 'tr_1', name: 'My Trigger' } }));

      const result = await api.getTrigger('agent_1', 'tr_1');

      const [url] = fetchMock.mock.calls[0];
      expect(url).toBe('https://api.test.com/agents/agent_1/triggers/tr_1');
      expect(result.trigger.name).toBe('My Trigger');
    });
  });

  describe('updateTrigger', () => {
    it('sends PATCH /agents/:agentId/triggers/:triggerId with partial payload', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ trigger: { id: 'tr_1', name: 'Updated' } }));

      await api.updateTrigger('agent_1', 'tr_1', { name: 'Updated', enabled: false });

      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe('https://api.test.com/agents/agent_1/triggers/tr_1');
      expect(init.method).toBe('PATCH');
      const body = JSON.parse(init.body);
      expect(body.name).toBe('Updated');
      expect(body.enabled).toBe(false);
    });

    it('sends only the fields that were provided', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ trigger: { id: 'tr_1' } }));

      await api.updateTrigger('agent_1', 'tr_1', { config: { cron: '0 * * * *' } });

      const [, init] = fetchMock.mock.calls[0];
      const body = JSON.parse(init.body);
      expect(body.config).toEqual({ cron: '0 * * * *' });
      expect(body.name).toBeUndefined();
      expect(body.enabled).toBeUndefined();
    });
  });

  describe('deleteTrigger', () => {
    it('sends DELETE /agents/:agentId/triggers/:triggerId', async () => {
      fetchMock.mockResolvedValue(jsonResponse({}, 200));

      await api.deleteTrigger('agent_1', 'tr_1');

      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe('https://api.test.com/agents/agent_1/triggers/tr_1');
      expect(init.method).toBe('DELETE');
    });
  });
});
