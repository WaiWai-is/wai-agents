-- Missing indexes for performance
CREATE INDEX IF NOT EXISTS idx_feed_items_creator_id ON feed_items(creator_id);
CREATE INDEX IF NOT EXISTS idx_feed_items_trending_score ON feed_items(trending_score DESC);
CREATE INDEX IF NOT EXISTS idx_feed_items_inserted_at ON feed_items(inserted_at DESC);
CREATE INDEX IF NOT EXISTS idx_agents_usage_count ON agents(usage_count DESC);
CREATE INDEX IF NOT EXISTS idx_agent_ratings_agent_inserted ON agent_ratings(agent_id, inserted_at);
CREATE INDEX IF NOT EXISTS idx_message_feedback_agent_inserted ON message_feedback(agent_id, inserted_at);
CREATE INDEX IF NOT EXISTS idx_messages_deleted_at ON messages(deleted_at) WHERE deleted_at IS NULL;

-- Add trigram indexes for ILIKE search performance
CREATE INDEX IF NOT EXISTS idx_agents_name_trgm ON agents USING gin(name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_agents_description_trgm ON agents USING gin(description gin_trgm_ops);

-- Fix FK behavior: allow agent deletion without breaking conversations
ALTER TABLE conversations DROP CONSTRAINT IF EXISTS conversations_agent_id_agents_id_fk;
ALTER TABLE conversations ADD CONSTRAINT conversations_agent_id_agents_id_fk
  FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE SET NULL;
