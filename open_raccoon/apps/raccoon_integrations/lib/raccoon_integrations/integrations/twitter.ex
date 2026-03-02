defmodule RaccoonIntegrations.Integrations.Twitter do
  @moduledoc """
  Twitter/X integration via OAuth 2.0 + PKCE.

  Supports posting tweets, searching, replying, DMs, and user lookup.
  """

  @behaviour RaccoonIntegrations.Integration

  @base_url "https://api.twitter.com/2"

  @impl true
  def service_name, do: "twitter"

  @impl true
  def auth_method, do: :oauth2_pkce

  @impl true
  def oauth_config do
    %{
      client_id: Application.get_env(:raccoon_integrations, :twitter_client_id),
      client_secret: Application.get_env(:raccoon_integrations, :twitter_client_secret),
      auth_url: "https://twitter.com/i/oauth2/authorize",
      token_url: "https://api.twitter.com/2/oauth2/token",
      scopes: ["tweet.read", "tweet.write", "users.read", "offline.access"],
      pkce: true
    }
  end

  @impl true
  def capabilities, do: [:read, :write]

  @impl true
  def rate_limits do
    %{
      tweets_per_3_hours: 300,
      reads_per_15_minutes: 500
    }
  end

  @impl true
  def execute_action(:post, %{text: text}, credential) do
    case Req.post("#{@base_url}/tweets", json: %{text: text}, headers: auth_headers(credential)) do
      {:ok, %{status: 201, body: body}} -> {:ok, body}
      {:ok, %{status: status, body: body}} -> {:error, {status, body}}
    end
  end

  def execute_action(:search, %{query: query} = params, credential) do
    query_params = %{
      query: query,
      max_results: params[:max_results] || 10,
      "tweet.fields": "created_at,author_id,public_metrics"
    }

    case Req.get("#{@base_url}/tweets/search/recent", params: query_params, headers: auth_headers(credential)) do
      {:ok, %{status: 200, body: body}} -> {:ok, body}
      {:ok, %{status: status, body: body}} -> {:error, {status, body}}
    end
  end

  def execute_action(:reply, %{text: text, reply_to_id: reply_to_id}, credential) do
    body = %{
      text: text,
      reply: %{in_reply_to_tweet_id: reply_to_id}
    }

    case Req.post("#{@base_url}/tweets", json: body, headers: auth_headers(credential)) do
      {:ok, %{status: 201, body: body}} -> {:ok, body}
      {:ok, %{status: status, body: body}} -> {:error, {status, body}}
    end
  end

  def execute_action(:get_user, %{username: username}, credential) do
    url = "#{@base_url}/users/by/username/#{username}"
    query = %{"user.fields": "description,public_metrics,profile_image_url,created_at"}

    case Req.get(url, params: query, headers: auth_headers(credential)) do
      {:ok, %{status: 200, body: body}} -> {:ok, body}
      {:ok, %{status: status, body: body}} -> {:error, {status, body}}
    end
  end

  def execute_action(:dm, %{participant_id: participant_id, text: text}, credential) do
    url = "#{@base_url}/dm_conversations/with/#{participant_id}/messages"

    case Req.post(url, json: %{text: text}, headers: auth_headers(credential)) do
      {:ok, %{status: 201, body: body}} -> {:ok, body}
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
