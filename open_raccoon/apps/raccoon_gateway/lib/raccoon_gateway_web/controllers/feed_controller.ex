defmodule RaccoonGatewayWeb.FeedController do
  use RaccoonGatewayWeb, :controller
  action_fallback RaccoonGatewayWeb.FallbackController

  alias RaccoonFeed
  alias RaccoonShared.{Pagination, Idempotency}

  plug RaccoonGatewayWeb.Plugs.Idempotency when action in [:create, :fork]

  def index(conn, params) do
    {cursor, limit} = Pagination.parse_params(params)
    items = RaccoonFeed.list_feed(limit: limit + 1, cursor: cursor)
    {items, page_info} = Pagination.build_page_info(items, limit)

    json(conn, %{
      items: Enum.map(items, &feed_item_json/1),
      page_info: %{next_cursor: page_info.next_cursor, has_more: page_info.has_more}
    })
  end

  def trending(conn, params) do
    {cursor, limit} = Pagination.parse_params(params)
    items = RaccoonFeed.list_trending(limit: limit + 1, cursor: cursor)
    {items, page_info} = Pagination.build_page_info(items, limit)

    json(conn, %{
      items: Enum.map(items, &feed_item_json/1),
      page_info: %{next_cursor: page_info.next_cursor, has_more: page_info.has_more}
    })
  end

  def following(conn, params) do
    user_id = conn.assigns.user_id
    {cursor, limit} = Pagination.parse_params(params)
    items = RaccoonFeed.get_following(user_id, limit: limit + 1, cursor: cursor)
    {items, page_info} = Pagination.build_page_info(items, limit)

    json(conn, %{
      items: Enum.map(items, &feed_item_json/1),
      page_info: %{next_cursor: page_info.next_cursor, has_more: page_info.has_more}
    })
  end

  def new_items(conn, params) do
    {cursor, limit} = Pagination.parse_params(params)
    items = RaccoonFeed.list_new(limit: limit + 1, cursor: cursor)
    {items, page_info} = Pagination.build_page_info(items, limit)

    json(conn, %{
      items: Enum.map(items, &feed_item_json/1),
      page_info: %{next_cursor: page_info.next_cursor, has_more: page_info.has_more}
    })
  end

  def create(conn, params) do
    user_id = conn.assigns.user_id

    attrs = %{
      creator_id: user_id,
      type: params["type"],
      reference_id: params["reference_id"],
      reference_type: params["reference_type"],
      title: params["title"],
      description: params["description"],
      thumbnail_url: params["thumbnail_url"]
    }

    with {:ok, feed_item} <- RaccoonFeed.submit_item(attrs) do
      response = %{data: feed_item_json(feed_item)}

      if idempotency_key = conn.assigns[:idempotency_key] do
        Idempotency.store(RaccoonShared.Repo, idempotency_key, user_id, 201, response)
      end

      conn
      |> put_status(:created)
      |> json(response)
    end
  end

  def like(conn, %{"id" => feed_item_id}) do
    user_id = conn.assigns.user_id

    with {:ok, feed_item_id} <- validate_uuid(feed_item_id) do
      case RaccoonFeed.get_feed_item(feed_item_id) do
        nil ->
          {:error, :not_found}

        _item ->
          case RaccoonFeed.like_item(feed_item_id, user_id) do
            {:ok, _like} ->
              json(conn, %{status: "liked"})

            {:error, _reason} ->
              # Idempotent: if already liked, return success
              json(conn, %{status: "liked"})
          end
      end
    end
  end

  def unlike(conn, %{"id" => feed_item_id}) do
    user_id = conn.assigns.user_id

    with {:ok, feed_item_id} <- validate_uuid(feed_item_id) do
      case RaccoonFeed.unlike_item(feed_item_id, user_id) do
        {:ok, _} -> send_resp(conn, :no_content, "")
        {:error, reason} -> {:error, reason}
      end
    end
  end

  def fork(conn, %{"id" => feed_item_id}) do
    user_id = conn.assigns.user_id

    with {:ok, feed_item_id} <- validate_uuid(feed_item_id),
         {:ok, item} <- RaccoonFeed.fork_item(feed_item_id, user_id) do
      response = %{feed_item: feed_item_json(item)}

      if idempotency_key = conn.assigns[:idempotency_key] do
        Idempotency.store(RaccoonShared.Repo, idempotency_key, user_id, 201, response)
      end

      conn
      |> put_status(:created)
      |> json(response)
    end
  end

  defp validate_uuid(id) do
    case Ecto.UUID.cast(id) do
      {:ok, uuid} -> {:ok, uuid}
      :error -> {:error, :not_found}
    end
  end

  defp feed_item_json(item) do
    %{
      id: item.id,
      creator_id: item.creator_id,
      type: item.type,
      reference_id: item.reference_id,
      reference_type: item.reference_type,
      title: item.title,
      description: item.description,
      thumbnail_url: item.thumbnail_url,
      quality_score: item.quality_score,
      trending_score: item.trending_score,
      like_count: item.like_count,
      fork_count: item.fork_count,
      view_count: item.view_count,
      created_at: item.inserted_at,
      updated_at: item.updated_at
    }
  end
end
