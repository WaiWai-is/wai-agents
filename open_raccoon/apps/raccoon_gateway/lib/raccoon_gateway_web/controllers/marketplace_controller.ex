defmodule RaccoonGatewayWeb.MarketplaceController do
  use RaccoonGatewayWeb, :controller
  action_fallback RaccoonGatewayWeb.FallbackController

  alias RaccoonAgents
  alias RaccoonShared.Pagination

  def index(conn, params) do
    {cursor, limit} = Pagination.parse_params(params)
    agents = RaccoonAgents.list_public_agents(limit: limit + 1, cursor: cursor)
    {items, page_info} = Pagination.build_page_info(agents, limit)

    json(conn, %{
      items: Enum.map(items, &marketplace_agent_json/1),
      page_info: %{next_cursor: page_info.next_cursor, has_more: page_info.has_more}
    })
  end

  def categories(conn, _params) do
    # Static categories for now; can be made dynamic later
    categories = [
      %{slug: "coding", name: "Coding & Development", description: "Agents that help write code"},
      %{slug: "writing", name: "Writing & Content", description: "Agents for content creation"},
      %{slug: "data", name: "Data & Analysis", description: "Agents for data processing"},
      %{slug: "creative", name: "Creative & Design", description: "Agents for creative tasks"},
      %{
        slug: "productivity",
        name: "Productivity",
        description: "Agents that boost productivity"
      },
      %{slug: "education", name: "Education", description: "Learning and tutoring agents"},
      %{slug: "other", name: "Other", description: "Miscellaneous agents"}
    ]

    json(conn, %{categories: categories})
  end

  def agent_profile(conn, %{"slug" => slug}) do
    case RaccoonAgents.get_agent_by_slug(slug) do
      nil ->
        {:error, :not_found}

      %{visibility: :public} = agent ->
        ratings = RaccoonAgents.get_agent_ratings(agent.id)

        json(conn, %{
          agent: marketplace_agent_json(agent),
          ratings:
            Enum.map(ratings, fn r ->
              %{
                id: r.id,
                user_id: r.user_id,
                rating: r.rating,
                review: r.review,
                created_at: r.inserted_at
              }
            end)
        })

      _non_public ->
        {:error, :not_found}
    end
  end

  def rate(conn, %{"id" => agent_id} = params) do
    user_id = conn.assigns.user_id

    with {:ok, agent_id} <- validate_uuid(agent_id) do
      attrs = %{
        agent_id: agent_id,
        user_id: user_id,
        rating: params["rating"],
        review: params["review"]
      }

      with {:ok, rating} <- RaccoonAgents.rate_agent(attrs) do
        conn
        |> put_status(:created)
        |> json(%{
          rating: %{
            id: rating.id,
            agent_id: rating.agent_id,
            user_id: rating.user_id,
            rating: rating.rating,
            review: rating.review,
            created_at: rating.inserted_at
          }
        })
      end
    end
  end

  def search(conn, %{"q" => query} = params) do
    {cursor, limit} = Pagination.parse_params(params)

    # Search through public agents by name/description
    agents = RaccoonAgents.search_public_agents(query, limit: limit + 1, cursor: cursor)
    {items, page_info} = Pagination.build_page_info(agents, limit)

    json(conn, %{
      items: Enum.map(items, &marketplace_agent_json/1),
      page_info: %{next_cursor: page_info.next_cursor, has_more: page_info.has_more}
    })
  end

  def search(conn, params) do
    # No query provided, return full listing
    index(conn, params)
  end

  defp validate_uuid(id) do
    case Ecto.UUID.cast(id) do
      {:ok, uuid} -> {:ok, uuid}
      :error -> {:error, :not_found}
    end
  end

  defp marketplace_agent_json(agent) do
    avg_rating =
      if agent.rating_count > 0,
        do: Float.round(agent.rating_sum / agent.rating_count, 1),
        else: 0.0

    %{
      id: agent.id,
      creator_id: agent.creator_id,
      name: agent.name,
      slug: agent.slug,
      description: agent.description,
      avatar_url: agent.avatar_url,
      model: agent.model,
      category: agent.category,
      visibility: agent.visibility,
      usage_count: agent.usage_count,
      rating_count: agent.rating_count,
      average_rating: avg_rating,
      created_at: agent.inserted_at,
      updated_at: agent.updated_at
    }
  end
end
