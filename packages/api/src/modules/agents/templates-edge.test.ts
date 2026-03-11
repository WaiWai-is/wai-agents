import { describe, expect, it } from 'vitest';
import { agentTemplates, getTemplate, listTemplates } from './templates.js';

/* ================================================================
 * getTemplate
 * ================================================================ */
describe('getTemplate', () => {
  it('returns the pr_manager template', () => {
    const template = getTemplate('pr_manager');
    expect(template.name).toBe('PR Manager');
    expect(template.model).toBe('claude-sonnet-4-6');
    expect(template.tools).toContain('web_search');
  });

  it('returns the research_assistant template', () => {
    const template = getTemplate('research_assistant');
    expect(template.name).toBe('Research Assistant');
    expect(template.tools).toContain('web_search');
    expect(template.tools).toContain('store_memory');
  });

  it('returns the creative_writer template', () => {
    const template = getTemplate('creative_writer');
    expect(template.name).toBe('Creative Writer');
    expect(template.tools).toContain('store_memory');
  });

  it('returns the code_helper template', () => {
    const template = getTemplate('code_helper');
    expect(template.name).toBe('Code Helper');
    expect(template.tools).toEqual([]);
  });

  it('returns the agent_builder template', () => {
    const template = getTemplate('agent_builder');
    expect(template.name).toBe('Agent Builder');
    expect(template.model).toBe('claude-opus-4-6');
  });

  it('throws for unknown template slug', () => {
    expect(() => getTemplate('nonexistent')).toThrow("Agent template 'nonexistent' not found");
  });

  it('throws for empty string slug', () => {
    expect(() => getTemplate('')).toThrow("Agent template '' not found");
  });

  it('is case-sensitive (uppercase fails)', () => {
    expect(() => getTemplate('PR_MANAGER')).toThrow("Agent template 'PR_MANAGER' not found");
  });
});

/* ================================================================
 * listTemplates
 * ================================================================ */
describe('listTemplates', () => {
  it('returns all templates with slug', () => {
    const templates = listTemplates();
    expect(templates.length).toBe(Object.keys(agentTemplates).length);
    expect(templates.length).toBeGreaterThan(0);
  });

  it('each template has required fields', () => {
    const templates = listTemplates();
    for (const t of templates) {
      expect(typeof t.slug).toBe('string');
      expect(t.slug.length).toBeGreaterThan(0);
      expect(typeof t.name).toBe('string');
      expect(typeof t.description).toBe('string');
      expect(typeof t.systemPrompt).toBe('string');
      expect(typeof t.model).toBe('string');
      expect(Array.isArray(t.tools)).toBe(true);
      expect(Array.isArray(t.mcpServers)).toBe(true);
      expect(Array.isArray(t.coreMemories)).toBe(true);
    }
  });

  it('slugs match the keys in agentTemplates', () => {
    const templates = listTemplates();
    const slugs = templates.map((t) => t.slug);
    const keys = Object.keys(agentTemplates);
    expect(slugs.sort()).toEqual(keys.sort());
  });

  it('every template has at least one core memory', () => {
    const templates = listTemplates();
    for (const t of templates) {
      expect(t.coreMemories.length).toBeGreaterThan(0);
    }
  });

  it('every core memory has blockLabel and content', () => {
    const templates = listTemplates();
    for (const t of templates) {
      for (const mem of t.coreMemories) {
        expect(typeof mem.blockLabel).toBe('string');
        expect(mem.blockLabel.length).toBeGreaterThan(0);
        expect(typeof mem.content).toBe('string');
        expect(mem.content.length).toBeGreaterThan(0);
      }
    }
  });

  it('every template has an identity core memory', () => {
    const templates = listTemplates();
    for (const t of templates) {
      const hasIdentity = t.coreMemories.some((m) => m.blockLabel === 'identity');
      expect(hasIdentity).toBe(true);
    }
  });

  it('every template has a rules core memory', () => {
    const templates = listTemplates();
    for (const t of templates) {
      const hasRules = t.coreMemories.some((m) => m.blockLabel === 'rules');
      expect(hasRules).toBe(true);
    }
  });
});

/* ================================================================
 * agentTemplates structure
 * ================================================================ */
describe('agentTemplates record', () => {
  it('is a non-empty record', () => {
    expect(Object.keys(agentTemplates).length).toBeGreaterThanOrEqual(5);
  });

  it('all models are valid model identifiers', () => {
    const validModels = ['claude-sonnet-4-6', 'claude-opus-4-6', 'gpt-4', 'gpt-4-turbo'];
    for (const [slug, template] of Object.entries(agentTemplates)) {
      expect(validModels).toContain(template.model);
    }
  });

  it('all mcpServers arrays are empty (no default servers)', () => {
    for (const template of Object.values(agentTemplates)) {
      expect(template.mcpServers).toEqual([]);
    }
  });
});
