defmodule RaccoonShared.Repo.Migrations.AddMessagesCascadeDelete do
  use Ecto.Migration

  @doc """
  Add ON DELETE CASCADE to messages.conversation_id FK.

  The messages table is range-partitioned via raw SQL, so we must use
  raw SQL to drop and recreate the constraint. This ensures that
  deleting a conversation automatically removes its messages at the
  database level.
  """

  def up do
    # Drop the existing FK constraint (named after the column by default in raw SQL)
    execute "ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_conversation_id_fkey"

    execute """
    ALTER TABLE messages
      ADD CONSTRAINT messages_conversation_id_fkey
      FOREIGN KEY (conversation_id) REFERENCES conversations(id)
      ON DELETE CASCADE
    """

    # Also fix pages.conversation_id FK to nilify on conversation delete
    # (pages should not block conversation deletion)
    execute "ALTER TABLE pages DROP CONSTRAINT IF EXISTS pages_conversation_id_fkey"

    execute """
    ALTER TABLE pages
      ADD CONSTRAINT pages_conversation_id_fkey
      FOREIGN KEY (conversation_id) REFERENCES conversations(id)
      ON DELETE SET NULL
    """
  end

  def down do
    execute "ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_conversation_id_fkey"

    execute """
    ALTER TABLE messages
      ADD CONSTRAINT messages_conversation_id_fkey
      FOREIGN KEY (conversation_id) REFERENCES conversations(id)
    """

    execute "ALTER TABLE pages DROP CONSTRAINT IF EXISTS pages_conversation_id_fkey"

    execute """
    ALTER TABLE pages
      ADD CONSTRAINT pages_conversation_id_fkey
      FOREIGN KEY (conversation_id) REFERENCES conversations(id)
    """
  end
end
