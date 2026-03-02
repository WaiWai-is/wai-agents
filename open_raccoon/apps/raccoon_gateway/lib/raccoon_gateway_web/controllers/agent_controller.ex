defmodule RaccoonGatewayWeb.AgentController do
  use RaccoonGatewayWeb, :controller
  action_fallback RaccoonGatewayWeb.FallbackController

  alias RaccoonAgents
  alias RaccoonChat
  alias RaccoonChat.Conversation
  alias RaccoonShared.Pagination

  def index(conn, params) do
    user_id = conn.assigns.user_id
    {_cursor, limit} = Pagination.parse_params(params)

    agents = RaccoonAgents.list_user_agents(user_id)
    {items, page_info} = Pagination.build_page_info(Enum.take(agents, limit + 1), limit)

    json(conn, %{
      items: Enum.map(items, &agent_json/1),
      page_info: %{next_cursor: page_info.next_cursor, has_more: page_info.has_more}
    })
  end

  def create(conn, params) do
    user_id = conn.assigns.user_id
    attrs = Map.put(params, "creator_id", user_id)

    with {:ok, agent} <- RaccoonAgents.create_agent(attrs) do
      conn
      |> put_status(:created)
      |> json(%{agent: agent_json(agent)})
    end
  end

  def show(conn, %{"id" => id}) do
    user_id = conn.assigns.user_id

    with {:ok, id} <- validate_uuid(id) do
      case RaccoonAgents.get_agent(id) do
        nil ->
          {:error, :not_found}

        %{visibility: :private, creator_id: creator_id} when creator_id != user_id ->
          {:error, :not_found}

        agent ->
          json(conn, %{agent: agent_json(agent)})
      end
    end
  end

  def update(conn, %{"id" => id} = params) do
    user_id = conn.assigns.user_id

    with {:ok, id} <- validate_uuid(id) do
      case RaccoonAgents.get_agent(id) do
        nil ->
          {:error, :not_found}

        %{creator_id: ^user_id} = agent ->
          allowed_keys = [
            "name",
            "slug",
            "description",
            "avatar_url",
            "system_prompt",
            "model",
            "temperature",
            "max_tokens",
            "tools",
            "mcp_servers",
            "visibility",
            "category",
            "metadata"
          ]

          update_params = Map.take(params, allowed_keys)

          with {:ok, updated} <- RaccoonAgents.update_agent(agent, update_params) do
            json(conn, %{agent: agent_json(updated)})
          end

        _agent ->
          {:error, :forbidden}
      end
    end
  end

  def delete(conn, %{"id" => id}) do
    user_id = conn.assigns.user_id

    with {:ok, id} <- validate_uuid(id) do
      case RaccoonAgents.get_agent(id) do
        nil ->
          {:error, :not_found}

        %{creator_id: ^user_id} = agent ->
          with {:ok, _} <- RaccoonAgents.delete_agent(agent) do
            send_resp(conn, :no_content, "")
          end

        _agent ->
          {:error, :forbidden}
      end
    end
  end

  def start_conversation(conn, %{"id" => agent_id}) do
    user_id = conn.assigns.user_id

    with {:ok, agent_id} <- validate_uuid(agent_id) do
      case RaccoonAgents.get_agent(agent_id) do
        nil ->
          {:error, :not_found}

        %{visibility: :private, creator_id: creator_id} when creator_id != user_id ->
          {:error, :forbidden}

        agent ->
          # Reuse existing agent conversation if one exists (idempotency)
          case RaccoonChat.find_agent_conversation(user_id, agent.id) do
            %Conversation{} = existing ->
              json(conn, %{
                conversation: %{
                  id: existing.id,
                  type: existing.type,
                  title: existing.title,
                  agent_id: existing.agent_id,
                  created_at: existing.inserted_at
                }
              })

            nil ->
              with {:ok, conversation} <-
                     RaccoonChat.create_conversation_with_members(
                       %{
                         type: :agent,
                         title: agent.name,
                         creator_id: user_id,
                         agent_id: agent.id
                       },
                       [%{user_id: user_id, role: :owner}]
                     ) do
                conn
                |> put_status(:created)
                |> json(%{
                  conversation: %{
                    id: conversation.id,
                    type: conversation.type,
                    title: conversation.title,
                    agent_id: conversation.agent_id,
                    created_at: conversation.inserted_at
                  }
                })
              end
          end
      end
    end
  end

  defp validate_uuid(id) do
    case Ecto.UUID.cast(id) do
      {:ok, uuid} -> {:ok, uuid}
      :error -> {:error, :not_found}
    end
  end

  defp agent_json(agent) do
    %{
      id: agent.id,
      creator_id: agent.creator_id,
      name: agent.name,
      slug: agent.slug,
      description: agent.description,
      avatar_url: agent.avatar_url,
      system_prompt: agent.system_prompt,
      model: agent.model,
      temperature: agent.temperature,
      max_tokens: agent.max_tokens,
      tools: agent.tools,
      mcp_servers: agent.mcp_servers,
      visibility: agent.visibility,
      category: agent.category,
      usage_count: agent.usage_count,
      rating_sum: agent.rating_sum,
      rating_count: agent.rating_count,
      metadata: agent.metadata,
      created_at: agent.inserted_at,
      updated_at: agent.updated_at
    }
  end
end
