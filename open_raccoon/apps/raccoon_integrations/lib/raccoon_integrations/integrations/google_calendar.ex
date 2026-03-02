defmodule RaccoonIntegrations.Integrations.GoogleCalendar do
  @moduledoc """
  Google Calendar integration via shared Google OAuth 2.0.

  Supports listing, creating, updating, and deleting calendar events,
  as well as finding free/busy time.
  """

  @behaviour RaccoonIntegrations.Integration

  @base_url "https://www.googleapis.com/calendar/v3"

  @impl true
  def service_name, do: "google_calendar"

  @impl true
  def auth_method, do: :oauth2

  @impl true
  def oauth_config do
    %{
      client_id: Application.get_env(:raccoon_integrations, :google_client_id),
      client_secret: Application.get_env(:raccoon_integrations, :google_client_secret),
      auth_url: "https://accounts.google.com/o/oauth2/v2/auth",
      token_url: "https://oauth2.googleapis.com/token",
      scopes: ["https://www.googleapis.com/auth/calendar.readonly", "https://www.googleapis.com/auth/calendar.events"],
      pkce: false
    }
  end

  @impl true
  def capabilities, do: [:read, :write, :webhook]

  @impl true
  def rate_limits do
    %{requests_per_100sec_per_user: 500}
  end

  @impl true
  def execute_action(:list_events, params, credential) do
    calendar_id = params[:calendar_id] || "primary"
    url = "#{@base_url}/calendars/#{calendar_id}/events"

    query = %{
      timeMin: params[:time_min] || DateTime.utc_now() |> DateTime.to_iso8601(),
      timeMax: params[:time_max],
      maxResults: params[:max_results] || 10,
      singleEvents: true,
      orderBy: "startTime"
    }
    |> Enum.reject(fn {_k, v} -> is_nil(v) end)
    |> Map.new()

    case Req.get(url, params: query, headers: auth_headers(credential)) do
      {:ok, %{status: 200, body: body}} -> {:ok, body}
      {:ok, %{status: status, body: body}} -> {:error, {status, body}}
    end
  end

  def execute_action(:create_event, %{summary: summary, start: start_time, end: end_time} = params, credential) do
    calendar_id = params[:calendar_id] || "primary"
    url = "#{@base_url}/calendars/#{calendar_id}/events"

    body = %{
      summary: summary,
      start: %{dateTime: start_time},
      end: %{dateTime: end_time},
      description: params[:description],
      location: params[:location],
      attendees: params[:attendees]
    }
    |> Enum.reject(fn {_k, v} -> is_nil(v) end)
    |> Map.new()

    case Req.post(url, json: body, headers: auth_headers(credential)) do
      {:ok, %{status: 200, body: body}} -> {:ok, body}
      {:ok, %{status: status, body: body}} -> {:error, {status, body}}
    end
  end

  def execute_action(:update_event, %{event_id: event_id} = params, credential) do
    calendar_id = params[:calendar_id] || "primary"
    url = "#{@base_url}/calendars/#{calendar_id}/events/#{event_id}"

    body = Map.drop(params, [:event_id, :calendar_id])

    case Req.patch(url, json: body, headers: auth_headers(credential)) do
      {:ok, %{status: 200, body: body}} -> {:ok, body}
      {:ok, %{status: status, body: body}} -> {:error, {status, body}}
    end
  end

  def execute_action(:delete_event, %{event_id: event_id} = params, credential) do
    calendar_id = params[:calendar_id] || "primary"
    url = "#{@base_url}/calendars/#{calendar_id}/events/#{event_id}"

    case Req.delete(url, headers: auth_headers(credential)) do
      {:ok, %{status: 204}} -> {:ok, %{deleted: true}}
      {:ok, %{status: status, body: body}} -> {:error, {status, body}}
    end
  end

  def execute_action(:find_free_time, %{time_min: time_min, time_max: time_max} = params, credential) do
    url = "#{@base_url}/freeBusy"

    body = %{
      timeMin: time_min,
      timeMax: time_max,
      items: [%{id: params[:calendar_id] || "primary"}]
    }

    case Req.post(url, json: body, headers: auth_headers(credential)) do
      {:ok, %{status: 200, body: body}} -> {:ok, body}
      {:ok, %{status: status, body: body}} -> {:error, {status, body}}
    end
  end

  def execute_action(action, _params, _credential) do
    {:error, {:unsupported_action, action}}
  end

  defp auth_headers(credential) do
    [{"authorization", "Bearer #{credential.access_token}"}]
  end
end
