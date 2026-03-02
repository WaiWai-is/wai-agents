defmodule RaccoonChat do
  @moduledoc """
  Chat context: conversations, messages, members, reactions.
  """

  alias RaccoonShared.Repo
  alias RaccoonShared.Pagination
  alias RaccoonChat.{Conversation, ConversationMember, Message, MessageReaction}
  alias Ecto.Multi
  import Ecto.Query

  # --- Conversations ---

  def create_conversation(attrs) do
    %Conversation{}
    |> Conversation.changeset(attrs)
    |> Repo.insert()
  end

  @doc """
  Create a conversation and all of its memberships atomically.
  """
  def create_conversation_with_members(attrs, member_specs) when is_list(member_specs) do
    normalized_members =
      member_specs
      |> Enum.map(&normalize_member_spec/1)
      |> Enum.uniq_by(& &1.user_id)

    Multi.new()
    |> Multi.insert(:conversation, Conversation.changeset(%Conversation{}, attrs))
    |> Multi.run(:members, fn repo, %{conversation: conversation} ->
      insert_members(repo, conversation.id, normalized_members)
    end)
    |> Repo.transaction()
    |> case do
      {:ok, %{conversation: conversation}} ->
        {:ok, conversation}

      {:error, :conversation, changeset, _changes} ->
        {:error, changeset}

      {:error, :members, reason, _changes} ->
        {:error, reason}
    end
  end

  @doc """
  Find an existing agent conversation for a user with a specific agent.
  Returns the conversation or nil.
  """
  def find_agent_conversation(user_id, agent_id) do
    from(c in Conversation,
      join: m in ConversationMember,
      on: m.conversation_id == c.id,
      where: c.type == :agent and c.agent_id == ^agent_id and m.user_id == ^user_id,
      order_by: [desc: c.inserted_at],
      limit: 1
    )
    |> Repo.one()
  end

  @doc """
  Find an existing DM conversation between two users, if one exists.
  Returns the conversation or nil.
  """
  def find_dm_between(user_id_a, user_id_b) do
    from(c in Conversation,
      where: c.type == :dm,
      join: m1 in ConversationMember,
      on: m1.conversation_id == c.id and m1.user_id == ^user_id_a,
      join: m2 in ConversationMember,
      on: m2.conversation_id == c.id and m2.user_id == ^user_id_b
    )
    |> Repo.one()
  end

  def get_conversation(id), do: Repo.get(Conversation, id)

  def get_conversation!(id), do: Repo.get!(Conversation, id)

  def update_conversation(%Conversation{} = conv, attrs) do
    conv |> Conversation.changeset(attrs) |> Repo.update()
  end

  def delete_conversation(%Conversation{} = conv) do
    Repo.delete(conv)
  end

  @doc """
  Delete a conversation along with all its messages and reactions.
  Messages have ON DELETE CASCADE at the DB level (via migration), but we also
  delete them explicitly for clarity. Reactions have no DB-level FK to messages
  (partitioned table), so we clean them up manually. Members have ON DELETE
  CASCADE so they are handled automatically.
  """
  def delete_conversation_with_messages(%Conversation{} = conv) do
    message_ids_query = from(m in Message, where: m.conversation_id == ^conv.id, select: m.id)

    Multi.new()
    |> Multi.delete_all(
      :reactions,
      from(r in MessageReaction, where: r.message_id in subquery(message_ids_query))
    )
    |> Multi.delete_all(:messages, from(m in Message, where: m.conversation_id == ^conv.id))
    |> Multi.delete(:conversation, conv)
    |> Repo.transaction()
    |> case do
      {:ok, %{conversation: conversation}} -> {:ok, conversation}
      {:error, _step, changeset, _changes} -> {:error, changeset}
    end
  end

  def list_user_conversations(user_id) do
    from(c in Conversation,
      join: m in ConversationMember,
      on: m.conversation_id == c.id,
      where: m.user_id == ^user_id,
      order_by: [desc: c.last_message_at],
      preload: [:members]
    )
    |> Repo.all()
  end

  # --- Messages ---

  @doc """
  Send a message through the delivery pipeline.

  Delegates to `RaccoonChat.Delivery.send_message/3` which handles validation,
  persistence, broadcasting, and notification.
  """
  defdelegate send_message(conversation_id, sender_id, params), to: RaccoonChat.Delivery

  def get_messages(conversation_id, opts \\ []) do
    limit = Keyword.get(opts, :limit, 50)
    cursor = Keyword.get(opts, :cursor, nil)

    from(
      m in Message,
      where: m.conversation_id == ^conversation_id,
      order_by: [desc: m.created_at, desc: m.id]
    )
    |> apply_message_cursor(conversation_id, cursor)
    |> limit(^(limit + 1))
    |> Repo.all()
  end

  def get_message(id), do: Repo.get(Message, id)

  def get_message_in_conversation(conversation_id, message_id) do
    Repo.get_by(Message, id: message_id, conversation_id: conversation_id)
  end

  def get_message_with_reactions(conversation_id, message_id) do
    from(m in Message,
      where: m.id == ^message_id and m.conversation_id == ^conversation_id,
      preload: [:reactions]
    )
    |> Repo.one()
  end

  def update_message(%Message{} = message, attrs) do
    message |> Message.edit_changeset(attrs) |> Repo.update()
  end

  def soft_delete_message(%Message{} = message) do
    message
    |> Ecto.Changeset.change(deleted_at: DateTime.utc_now())
    |> Repo.update()
  end

  # --- Members ---

  @doc "Get a specific membership record for a user in a conversation."
  def get_membership(conversation_id, user_id) do
    Repo.get_by(ConversationMember, conversation_id: conversation_id, user_id: user_id)
  end

  def add_member(attrs) do
    %ConversationMember{}
    |> ConversationMember.changeset(attrs)
    |> Repo.insert()
  end

  def remove_member(conversation_id, user_id) do
    from(m in ConversationMember,
      where: m.conversation_id == ^conversation_id and m.user_id == ^user_id
    )
    |> Repo.delete_all()
  end

  def list_members(conversation_id) do
    from(m in ConversationMember,
      where: m.conversation_id == ^conversation_id,
      preload: [:user]
    )
    |> Repo.all()
  end

  # --- Reactions ---

  def add_reaction(attrs) do
    %MessageReaction{}
    |> MessageReaction.changeset(attrs)
    |> Repo.insert()
  end

  def remove_reaction(message_id, user_id, emoji) do
    from(r in MessageReaction,
      where: r.message_id == ^message_id and r.user_id == ^user_id and r.emoji == ^emoji
    )
    |> Repo.delete_all()
  end

  defp apply_message_cursor(query, _conversation_id, nil), do: query

  defp apply_message_cursor(query, conversation_id, cursor) do
    with {:ok, cursor_id} <- Pagination.decode_cursor(cursor),
         %Message{created_at: cursor_created_at} <-
           Repo.get_by(Message, id: cursor_id, conversation_id: conversation_id) do
      from(m in query,
        where:
          m.created_at < ^cursor_created_at or
            (m.created_at == ^cursor_created_at and m.id < ^cursor_id)
      )
    else
      _ -> query
    end
  end

  defp insert_members(repo, conversation_id, member_specs) do
    now = DateTime.utc_now()

    member_specs
    |> Enum.reduce_while({:ok, []}, fn spec, {:ok, acc} ->
      attrs = %{
        conversation_id: conversation_id,
        user_id: spec.user_id,
        role: spec.role,
        joined_at: spec.joined_at || now
      }

      case %ConversationMember{} |> ConversationMember.changeset(attrs) |> repo.insert() do
        {:ok, member} ->
          {:cont, {:ok, [member | acc]}}

        {:error, changeset} ->
          {:halt, {:error, changeset}}
      end
    end)
    |> case do
      {:ok, members} -> {:ok, Enum.reverse(members)}
      error -> error
    end
  end

  defp normalize_member_spec(spec) do
    %{
      user_id: Map.get(spec, :user_id) || Map.get(spec, "user_id"),
      role: normalize_member_role(Map.get(spec, :role) || Map.get(spec, "role") || :member),
      joined_at: Map.get(spec, :joined_at) || Map.get(spec, "joined_at")
    }
  end

  defp normalize_member_role(role) when role in [:owner, :admin, :member], do: role
  defp normalize_member_role("owner"), do: :owner
  defp normalize_member_role("admin"), do: :admin
  defp normalize_member_role("member"), do: :member
  defp normalize_member_role(_), do: :member
end
