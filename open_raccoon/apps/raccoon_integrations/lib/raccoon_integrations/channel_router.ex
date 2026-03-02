defmodule RaccoonIntegrations.ChannelRouter do
  @moduledoc """
  Routes inbound messages from external platforms to the correct
  agent or conversation based on channel_routes configuration.
  """

  alias RaccoonShared.Repo
  alias RaccoonIntegrations.{ChannelRoute, IntegrationEvent}
  import Ecto.Query

  require Logger

  @doc """
  Route an inbound integration event to the appropriate agent or conversation.

  Looks up the channel_routes table by (service, external_chat_id).
  If a route with an agent_id is found, triggers agent execution.
  If a route with a conversation_id is found, inserts as a message.
  """
  def route_inbound(%IntegrationEvent{} = event) do
    external_chat_id = get_external_chat_id(event)

    case lookup_route(event.service, external_chat_id) do
      nil ->
        Logger.debug("No channel route for #{event.service}:#{external_chat_id}")
        {:error, :no_route}

      %ChannelRoute{enabled: false} ->
        {:error, :route_disabled}

      %ChannelRoute{agent_id: agent_id} = route when not is_nil(agent_id) ->
        route_to_agent(route, event)

      %ChannelRoute{conversation_id: conversation_id} = route when not is_nil(conversation_id) ->
        route_to_conversation(route, event)

      _route ->
        {:error, :no_target}
    end
  end

  @doc """
  Create a new channel route.
  """
  def create_route(attrs) do
    %ChannelRoute{}
    |> ChannelRoute.changeset(attrs)
    |> Repo.insert()
  end

  @doc """
  Delete a channel route.
  """
  def delete_route(%ChannelRoute{} = route) do
    Repo.delete(route)
  end

  @doc """
  Delete a channel route by ID, verifying ownership.
  """
  def delete_route(route_id, user_id) do
    case Repo.get(ChannelRoute, route_id) do
      nil -> {:error, :not_found}
      %ChannelRoute{user_id: ^user_id} = route -> Repo.delete(route)
      _route -> {:error, :forbidden}
    end
  end

  @doc """
  List channel routes for a specific agent.
  """
  def list_routes_for_agent(agent_id, user_id) do
    from(r in ChannelRoute,
      where: r.agent_id == ^agent_id and r.user_id == ^user_id,
      order_by: [desc: r.inserted_at]
    )
    |> Repo.all()
  end

  @doc """
  List all channel routes for a user.
  """
  def list_routes_for_user(user_id) do
    from(r in ChannelRoute,
      where: r.user_id == ^user_id,
      order_by: [desc: r.inserted_at]
    )
    |> Repo.all()
  end

  @doc """
  Get a single route by ID.
  """
  def get_route(id), do: Repo.get(ChannelRoute, id)

  # --- Private ---

  defp lookup_route(service, external_chat_id) do
    from(r in ChannelRoute,
      where: r.service == ^service and r.external_chat_id == ^external_chat_id,
      limit: 1
    )
    |> Repo.one()
  end

  defp get_external_chat_id(%IntegrationEvent{payload: payload}) do
    # Try common payload keys for chat ID
    payload[:chat_id] || payload[:channel_id] || payload[:channel] ||
      payload["chat_id"] || payload["channel_id"] || payload["channel"] || ""
  end

  defp route_to_agent(%ChannelRoute{agent_id: agent_id, user_id: user_id} = route, event) do
    Logger.info("Routing #{event.service} message to agent #{agent_id}")

    # Use EventRouter if available (from raccoon_agents)
    payload = %{
      trigger_type: :channel_message,
      service: event.service,
      external_chat_id: route.external_chat_id,
      actor: event.actor,
      content: event.payload,
      user_id: user_id,
      route_id: route.id
    }

    case Code.ensure_loaded(RaccoonAgents.EventRouter) do
      {:module, _} ->
        RaccoonAgents.EventRouter.route_trigger(:channel_message, Map.put(payload, :agent_id, agent_id))

      {:error, _} ->
        Logger.warning("EventRouter not available, cannot route to agent")
        {:error, :event_router_unavailable}
    end
  end

  defp route_to_conversation(%ChannelRoute{conversation_id: conversation_id} = _route, event) do
    Logger.info("Routing #{event.service} message to conversation #{conversation_id}")

    message_params = %{
      "sender_type" => "bridge",
      "type" => "text",
      "content" => %{
        "text" => event.payload[:text] || event.payload["text"] || ""
      },
      "metadata" => %{
        "bridge_source" => event.service,
        "bridge_sender_id" => event.actor[:id] || event.actor["id"],
        "bridge_sender_name" => event.actor[:name] || event.actor["name"]
      }
    }

    case Code.ensure_loaded(RaccoonChat.Delivery) do
      {:module, _} ->
        RaccoonChat.Delivery.send_message(conversation_id, "system", message_params)

      {:error, _} ->
        Logger.warning("RaccoonChat.Delivery not available")
        {:error, :delivery_unavailable}
    end
  end
end
