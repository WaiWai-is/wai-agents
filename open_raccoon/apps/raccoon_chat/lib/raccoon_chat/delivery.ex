defmodule RaccoonChat.Delivery do
  @moduledoc """
  Message delivery pipeline: validate -> persist -> broadcast.

  All messages flow through this module regardless of sender type.
  The pipeline:
    1. Validate conversation exists
    2. Persist message to PostgreSQL
    3. Update conversation's last_message_at
    4. Broadcast via PubSub to conversation topic
    5. Notify user channels for badge counts
  """

  require Logger

  alias RaccoonShared.Repo
  alias RaccoonChat.Message
  alias RaccoonChat.Conversation
  alias RaccoonChat.ConversationMember
  import Ecto.Query

  @doc """
  Send a message in a conversation.

  ## Parameters
    - conversation_id: UUID of the conversation
    - sender_id: UUID of the sending user/agent
    - params: Map with "sender_type", "type", "content", "metadata" keys

  ## Returns
    - {:ok, %Message{}} on success
    - {:error, reason} on failure
  """
  def send_message(conversation_id, sender_id, params) do
    attrs = %{
      conversation_id: conversation_id,
      sender_id: sender_id,
      sender_type: Map.get(params, "sender_type", "human"),
      type: Map.get(params, "type", "text"),
      content: Map.get(params, "content", %{}),
      metadata: Map.get(params, "metadata", %{})
    }

    result =
      Repo.transaction(fn ->
        # 1. Validate conversation exists
        conversation = Repo.get!(Conversation, conversation_id)

        # Human senders must be active conversation members.
        if attrs.sender_type == "human" do
          membership =
            Repo.get_by(ConversationMember,
              conversation_id: conversation_id,
              user_id: sender_id
            )

          if is_nil(membership) do
            Repo.rollback(:forbidden)
          end
        end

        # 2. Persist message
        case %Message{} |> Message.changeset(attrs) |> Repo.insert() do
          {:ok, message} ->
            # 3. Update conversation's last_message_at
            conversation
            |> Ecto.Changeset.change(last_message_at: message.created_at)
            |> Repo.update!()

            {conversation, message}

          {:error, changeset} ->
            Repo.rollback(changeset)
        end
      end)

    # Broadcast AFTER transaction commits to prevent phantom messages on rollback
    case result do
      {:ok, {conversation, message}} ->
        Phoenix.PubSub.broadcast(
          RaccoonGateway.PubSub,
          "conversation:#{conversation_id}",
          {:new_message, message}
        )

        notify_conversation_updated(conversation_id)

        if conversation.type == :agent && attrs.sender_type == "human" do
          trigger_agent_execution(conversation, sender_id)
        end

        {:ok, message}

      error ->
        error
    end
  end

  defp trigger_agent_execution(conversation, sender_id) do
    conversation_id = conversation.id
    agent_id = conversation.agent_id

    # Fetch recent messages for context
    messages =
      from(m in Message,
        where: m.conversation_id == ^conversation_id,
        order_by: [asc: m.created_at],
        limit: 50
      )
      |> Repo.all()
      |> Enum.map(fn msg ->
        %{
          role: if(msg.sender_type == :human, do: "user", else: "assistant"),
          content: Map.get(msg.content, "text", ""),
          message_id: msg.id
        }
      end)

    # Load agent to build config with BYOK support
    agent = RaccoonAgents.get_agent(agent_id)

    config =
      if agent do
        agent_metadata = agent.metadata || %{}

        %{
          agent_id: agent_id,
          system_prompt: agent.system_prompt,
          model: agent.model,
          temperature: agent.temperature,
          max_tokens: agent.max_tokens,
          visibility: to_string(agent.visibility),
          user_api_key: Map.get(agent_metadata, "user_api_key", "")
        }
      else
        %{agent_id: agent_id}
      end

    Task.Supervisor.start_child(
      RaccoonChat.TaskSupervisor,
      fn ->
        RaccoonAgents.AgentExecutor.execute(
          conversation_id,
          agent_id,
          sender_id,
          messages,
          config
        )
      end
    )

    Logger.info("Triggered agent execution",
      conversation_id: conversation_id,
      agent_id: agent_id
    )
  end

  defp notify_conversation_updated(conversation_id) do
    members =
      from(cm in ConversationMember, where: cm.conversation_id == ^conversation_id)
      |> Repo.all()

    Enum.each(members, fn member ->
      Phoenix.PubSub.broadcast(
        RaccoonGateway.PubSub,
        "user:#{member.user_id}",
        {:conversation_updated, %{conversation_id: conversation_id}}
      )
    end)
  end
end
