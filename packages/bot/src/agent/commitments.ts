/**
 * Commitment Tracking — detect and track promises in conversations.
 *
 * Bi-directional: what YOU promised + what OTHERS promised you.
 * Works in English and Russian.
 */

import { log } from "@wai/core";

export interface Commitment {
  who: string;
  what: string;
  direction: "i_promised" | "they_promised";
  deadline: string | null;
}

const I_PROMISED_PATTERNS = [
  /(?:i'll|i will|i'm going to|let me|i can|i should)\s+(.{10,80})/i,
  /(?:я отправлю|я пришлю|я сделаю|я напишу|я позвоню)\s*(.*)/i,
  /(?:сделаю|напишу|отправлю|пришлю|позвоню)\s+(.{5,80})/i,
];

const THEY_PROMISED_PATTERNS = [
  /(?:he'll|she'll|they'll|he will|she will|they will)\s+(.{10,80})/i,
  /(\w+)\s+(?:said (?:he|she|they)'d|promised to|agreed to)\s+(.{10,80})/i,
  /([\p{L}]+)\s+(?:обещал[аи]?|сказал[аи]?\s+что)\s+(.{5,80})/iu,
];

const DEADLINE_PATTERNS = [
  /(?:by|before|until)\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i,
  /(?:by|before|until)\s+(tomorrow|next week|end of (?:day|week|month))/i,
  /(?:до|к)\s+(понедельника|вторника|среды|четверга|пятницы|субботы|воскресенья)/i,
  /(?:до|к)\s+(завтра|следующей недели|конца (?:дня|недели|месяца))/i,
];

function extractDeadline(text: string): string | null {
  for (const pattern of DEADLINE_PATTERNS) {
    const match = text.match(pattern);
    if (match) return match[1];
  }
  return null;
}

/**
 * Detect commitments in text.
 */
export function detectCommitments(text: string, userName?: string): Commitment[] {
  const commitments: Commitment[] = [];
  const lower = text.toLowerCase();

  for (const pattern of I_PROMISED_PATTERNS) {
    const match = lower.match(pattern);
    if (match) {
      commitments.push({
        who: userName ?? "me",
        what: (match[1] ?? match[0]).trim().slice(0, 200),
        direction: "i_promised",
        deadline: extractDeadline(text),
      });
      break;
    }
  }

  for (const pattern of THEY_PROMISED_PATTERNS) {
    // Match against original text (Cyrillic patterns need original case for \w+)
    const match = text.match(pattern) || lower.match(pattern);
    if (match) {
      commitments.push({
        who: (match[1] ?? "someone").trim(),
        what: (match[2] ?? match[0]).trim().slice(0, 200),
        direction: "they_promised",
        deadline: extractDeadline(text),
      });
      break;
    }
  }

  if (commitments.length > 0) {
    log.info({
      service: "commitments",
      action: "detected",
      count: commitments.length,
    });
  }

  return commitments;
}

/**
 * Format commitments for Telegram display.
 */
export function formatCommitments(commitments: Commitment[]): string {
  if (!commitments.length) return "No open commitments found.";

  const lines: string[] = [];
  const mine = commitments.filter((c) => c.direction === "i_promised");
  const theirs = commitments.filter((c) => c.direction === "they_promised");

  if (mine.length) {
    lines.push("📤 *What you promised:*");
    for (const c of mine) {
      const dl = c.deadline ? ` (by ${c.deadline})` : "";
      lines.push(`  • ${c.what}${dl}`);
    }
  }

  if (theirs.length) {
    lines.push("\n📥 *What others promised you:*");
    for (const c of theirs) {
      const dl = c.deadline ? ` (by ${c.deadline})` : "";
      lines.push(`  • ${c.who}: ${c.what}${dl}`);
    }
  }

  return lines.join("\n");
}
