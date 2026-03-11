export function toISO(val: unknown): string | null {
  if (!val) return null;
  const d = val instanceof Date ? val : new Date(String(val));
  return isNaN(d.getTime()) ? null : d.toISOString();
}

export function formatConversation(row: Record<string, unknown>) {
  return {
    id: row['id'],
    type: row['type'],
    title: row['title'],
    avatar_url: row['avatar_url'],
    creator_id: row['creator_id'],
    agent_id: row['agent_id'],
    metadata: row['metadata'],
    last_message_at: toISO(row['last_message_at']),
    created_at: toISO(row['inserted_at']),
    updated_at: toISO(row['updated_at']),
  };
}
