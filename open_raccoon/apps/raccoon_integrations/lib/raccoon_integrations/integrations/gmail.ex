defmodule RaccoonIntegrations.Integrations.Gmail do
  @moduledoc """
  Gmail integration via Google OAuth 2.0.

  Supports reading, searching, sending, replying, and labeling emails.
  """

  @behaviour RaccoonIntegrations.Integration

  @base_url "https://gmail.googleapis.com/gmail/v1"

  @impl true
  def service_name, do: "gmail"

  @impl true
  def auth_method, do: :oauth2

  @impl true
  def oauth_config do
    %{
      client_id: Application.get_env(:raccoon_integrations, :google_client_id),
      client_secret: Application.get_env(:raccoon_integrations, :google_client_secret),
      auth_url: "https://accounts.google.com/o/oauth2/v2/auth",
      token_url: "https://oauth2.googleapis.com/token",
      scopes: ["https://www.googleapis.com/auth/gmail.readonly", "https://www.googleapis.com/auth/gmail.send", "https://www.googleapis.com/auth/gmail.modify"],
      pkce: false
    }
  end

  @impl true
  def capabilities, do: [:read, :write, :webhook]

  @impl true
  def rate_limits do
    %{requests_per_second_per_user: 250}
  end

  @impl true
  def execute_action(:search, %{query: query} = params, credential) do
    url = "#{@base_url}/users/me/messages"
    query_params = %{q: query, maxResults: params[:max_results] || 10}

    case Req.get(url, params: query_params, headers: auth_headers(credential)) do
      {:ok, %{status: 200, body: body}} -> {:ok, body}
      {:ok, %{status: status, body: body}} -> {:error, {status, body}}
    end
  end

  def execute_action(:read, %{message_id: message_id}, credential) do
    url = "#{@base_url}/users/me/messages/#{message_id}"

    case Req.get(url, params: %{format: "full"}, headers: auth_headers(credential)) do
      {:ok, %{status: 200, body: body}} -> {:ok, body}
      {:ok, %{status: status, body: body}} -> {:error, {status, body}}
    end
  end

  def execute_action(:send, %{to: to, subject: subject, body: body_text}, credential) do
    raw_message = build_raw_message(to, subject, body_text)
    url = "#{@base_url}/users/me/messages/send"

    case Req.post(url, json: %{raw: raw_message}, headers: auth_headers(credential)) do
      {:ok, %{status: 200, body: body}} -> {:ok, body}
      {:ok, %{status: status, body: body}} -> {:error, {status, body}}
    end
  end

  def execute_action(:reply, %{message_id: message_id, thread_id: thread_id, body: body_text} = params, credential) do
    raw_message = build_raw_message(params[:to] || "", params[:subject] || "Re:", body_text)
    url = "#{@base_url}/users/me/messages/send"

    payload = %{raw: raw_message, threadId: thread_id}
    payload = Map.put(payload, :inReplyTo, message_id)

    case Req.post(url, json: payload, headers: auth_headers(credential)) do
      {:ok, %{status: 200, body: body}} -> {:ok, body}
      {:ok, %{status: status, body: body}} -> {:error, {status, body}}
    end
  end

  def execute_action(:label, %{message_id: message_id, add_labels: add, remove_labels: remove}, credential) do
    url = "#{@base_url}/users/me/messages/#{message_id}/modify"

    body = %{addLabelIds: add || [], removeLabelIds: remove || []}

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

  defp build_raw_message(to, subject, body) do
    message = "To: #{to}\r\nSubject: #{subject}\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n#{body}"
    Base.url_encode64(message, padding: false)
  end
end
