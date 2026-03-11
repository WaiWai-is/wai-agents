import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { stripHtml, extractTitle } from './html-utils.js';

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// ─── Input Schemas ────────────────────────────────────────────────────────────

export const WebSearchInput = z.object({
  query: z.string().min(1),
  max_results: z.number().int().positive().max(20).default(5),
});

export const FetchPageInput = z.object({
  url: z.string().url(),
  max_length: z.number().int().positive().default(10000),
});

export const SummarizeUrlInput = z.object({
  url: z.string().url(),
  focus: z.string().optional(),
});

// ─── Handlers ────────────────────────────────────────────────────────────────

export async function handleWebSearch(
  input: z.infer<typeof WebSearchInput>,
): Promise<{ results: Array<{ title: string; url: string; snippet: string }> }> {
  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    tools: [{ type: 'web_search_20250305' as const, name: 'web_search' }],
    messages: [
      {
        role: 'user',
        content: `Search the web for: ${input.query}. Return the top ${input.max_results} results with titles, URLs, and snippets.`,
      },
    ],
  });

  const results: Array<{ title: string; url: string; snippet: string }> = [];

  // Collect the text block from Claude's response to use as snippet source
  let synthesizedText = '';
  for (const block of response.content) {
    if (block.type === 'text') {
      synthesizedText += block.text;
    }
  }

  for (const block of response.content) {
    if (block.type === 'web_search_tool_result') {
      const content = block.content;
      if (Array.isArray(content)) {
        for (const item of content) {
          if (item.type === 'web_search_result') {
            // encrypted_content is opaque and not usable as a snippet.
            // Extract a snippet from Claude's synthesized text that mentions this URL or title.
            let snippet = '';
            if (synthesizedText) {
              const titleEscaped = item.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
              const match = synthesizedText.match(new RegExp(`[^.]*${titleEscaped.slice(0, 30)}[^.]*\\.`, 'i'));
              snippet = match ? match[0].trim() : '';
            }
            results.push({
              title: item.title,
              url: item.url,
              snippet,
            });
            if (results.length >= input.max_results) break;
          }
        }
      }
    }
  }

  return { results };
}

export async function handleFetchPage(
  input: z.infer<typeof FetchPageInput>,
): Promise<{ content: string; title?: string; url: string }> {
  const response = await fetch(input.url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; WaiAgentsBot/1.0)',
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const html = await response.text();
  const title = extractTitle(html);
  const text = stripHtml(html);
  const content = text.slice(0, input.max_length);

  return { content, title, url: input.url };
}

export async function handleSummarizeUrl(
  input: z.infer<typeof SummarizeUrlInput>,
): Promise<{ summary: string; key_points: string[]; url: string }> {
  const fetchResult = await handleFetchPage({ url: input.url, max_length: 10000 });

  const focusClause = input.focus ? ` focusing on: ${input.focus}` : '';
  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    messages: [
      {
        role: 'user',
        content: `Summarize this content${focusClause}. Respond with JSON in this exact format: {"summary": "...", "key_points": ["...", "..."]}

Content:
${fetchResult.content}`,
      },
    ],
  });

  const textBlock = response.content.find((b) => b.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('No text response from Claude');
  }

  let parsed: { summary: string; key_points: string[] };
  try {
    const jsonMatch = textBlock.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON found in response');
    parsed = JSON.parse(jsonMatch[0]) as { summary: string; key_points: string[] };
  } catch {
    // If JSON parsing fails, return raw text as summary
    parsed = { summary: textBlock.text, key_points: [] };
  }

  return {
    summary: parsed.summary,
    key_points: parsed.key_points ?? [],
    url: input.url,
  };
}
