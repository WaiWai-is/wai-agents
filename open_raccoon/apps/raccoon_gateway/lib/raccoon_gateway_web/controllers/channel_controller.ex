defmodule RaccoonGatewayWeb.ChannelController do
  use RaccoonGatewayWeb, :controller
  action_fallback RaccoonGatewayWeb.FallbackController

  alias RaccoonIntegrations.ChannelRouter

  def index(conn, %{"agent_id" => agent_id}) do
    user_id = conn.assigns.user_id

    with :ok <- verify_agent_owner(agent_id, user_id) do
      routes = ChannelRouter.list_routes_for_agent(agent_id, user_id)

      json(conn, %{
        items: Enum.map(routes, &route_json/1)
      })
    end
  end

  def create(conn, %{"agent_id" => agent_id} = params) do
    user_id = conn.assigns.user_id

    with :ok <- verify_agent_owner(agent_id, user_id) do
      attrs = %{
        user_id: user_id,
        agent_id: agent_id,
        service: params["service"],
        external_chat_id: params["external_chat_id"],
        direction: params["direction"] || "both",
        metadata: params["metadata"] || %{}
      }

      with {:ok, route} <- ChannelRouter.create_route(attrs) do
        conn
        |> put_status(:created)
        |> json(%{route: route_json(route)})
      end
    end
  end

  def delete(conn, %{"agent_id" => agent_id, "id" => id}) do
    user_id = conn.assigns.user_id

    with :ok <- verify_agent_owner(agent_id, user_id) do
      case ChannelRouter.delete_route(id, user_id) do
        {:ok, _} -> send_resp(conn, :no_content, "")
        {:error, :not_found} -> {:error, :not_found}
        {:error, :forbidden} -> {:error, :forbidden}
      end
    end
  end

  defp verify_agent_owner(agent_id, user_id) do
    case RaccoonAgents.get_agent(agent_id) do
      nil -> {:error, :not_found}
      %{creator_id: ^user_id} -> :ok
      _agent -> {:error, :forbidden}
    end
  end

  defp route_json(route) do
    %{
      id: route.id,
      agent_id: route.agent_id,
      service: route.service,
      external_chat_id: route.external_chat_id,
      direction: route.direction,
      enabled: route.enabled,
      metadata: route.metadata,
      created_at: route.inserted_at,
      updated_at: route.updated_at
    }
  end
end
