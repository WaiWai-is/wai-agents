defmodule RaccoonIntegrations.Integrations.GitHub do
  @moduledoc """
  GitHub integration via OAuth 2.0.

  Supports repository search, file reading, issue/PR creation and review.
  """

  @behaviour RaccoonIntegrations.Integration

  @base_url "https://api.github.com"

  @impl true
  def service_name, do: "github"

  @impl true
  def auth_method, do: :oauth2

  @impl true
  def oauth_config do
    %{
      client_id: Application.get_env(:raccoon_integrations, :github_client_id),
      client_secret: Application.get_env(:raccoon_integrations, :github_client_secret),
      auth_url: "https://github.com/login/oauth/authorize",
      token_url: "https://github.com/login/oauth/access_token",
      scopes: ["repo", "read:user", "read:org"],
      pkce: false
    }
  end

  @impl true
  def capabilities, do: [:read, :write, :webhook]

  @impl true
  def rate_limits do
    %{requests_per_hour: 5000}
  end

  @impl true
  def normalize_webhook(%{"action" => action} = payload) do
    event_type =
      cond do
        payload["pull_request"] -> "pull_request.#{action}"
        payload["issue"] -> "issue.#{action}"
        payload["commits"] -> "push"
        true -> action
      end

    sender = payload["sender"] || %{}

    {:ok,
     %RaccoonIntegrations.IntegrationEvent{
       service: "github",
       event_type: event_type,
       external_id: to_string(payload["id"] || ""),
       actor: %{
         id: to_string(sender["id"] || ""),
         name: sender["login"] || "unknown",
         avatar_url: sender["avatar_url"]
       },
       payload: Map.take(payload, ["repository", "pull_request", "issue", "commits", "ref"]),
       raw_payload: payload,
       timestamp: DateTime.utc_now()
     }}
  end

  def normalize_webhook(_payload), do: {:ok, :ignored}

  @impl true
  def verify_webhook(headers, body) do
    expected = headers["x-hub-signature-256"]

    case Application.get_env(:raccoon_integrations, :github_webhook_secret) do
      nil ->
        {:error, :no_webhook_secret_configured}

      secret ->
        computed = "sha256=" <> (:crypto.mac(:hmac, :sha256, secret, body) |> Base.encode16(case: :lower))

        if Plug.Crypto.secure_compare(computed, expected || "") do
          :ok
        else
          {:error, :invalid_signature}
        end
    end
  end

  @impl true
  def execute_action(:search_repos, %{query: query} = params, credential) do
    url = "#{@base_url}/search/repositories"
    query_params = %{q: query, per_page: params[:per_page] || 10}

    case Req.get(url, params: query_params, headers: auth_headers(credential)) do
      {:ok, %{status: 200, body: body}} -> {:ok, body}
      {:ok, %{status: status, body: body}} -> {:error, {status, body}}
    end
  end

  def execute_action(:get_file, %{owner: owner, repo: repo, path: path} = params, credential) do
    url = "#{@base_url}/repos/#{owner}/#{repo}/contents/#{path}"
    query = if params[:ref], do: %{ref: params.ref}, else: %{}

    case Req.get(url, params: query, headers: auth_headers(credential)) do
      {:ok, %{status: 200, body: body}} -> {:ok, body}
      {:ok, %{status: status, body: body}} -> {:error, {status, body}}
    end
  end

  def execute_action(:create_issue, %{owner: owner, repo: repo, title: title} = params, credential) do
    url = "#{@base_url}/repos/#{owner}/#{repo}/issues"

    body = %{title: title, body: params[:body], labels: params[:labels], assignees: params[:assignees]}
    |> Enum.reject(fn {_k, v} -> is_nil(v) end)
    |> Map.new()

    case Req.post(url, json: body, headers: auth_headers(credential)) do
      {:ok, %{status: 201, body: body}} -> {:ok, body}
      {:ok, %{status: status, body: body}} -> {:error, {status, body}}
    end
  end

  def execute_action(:create_pr, %{owner: owner, repo: repo, title: title, head: head, base: base} = params, credential) do
    url = "#{@base_url}/repos/#{owner}/#{repo}/pulls"

    body = %{title: title, head: head, base: base, body: params[:body]}
    |> Enum.reject(fn {_k, v} -> is_nil(v) end)
    |> Map.new()

    case Req.post(url, json: body, headers: auth_headers(credential)) do
      {:ok, %{status: 201, body: body}} -> {:ok, body}
      {:ok, %{status: status, body: body}} -> {:error, {status, body}}
    end
  end

  def execute_action(:list_prs, %{owner: owner, repo: repo} = params, credential) do
    url = "#{@base_url}/repos/#{owner}/#{repo}/pulls"
    query = %{state: params[:state] || "open", per_page: params[:per_page] || 10}

    case Req.get(url, params: query, headers: auth_headers(credential)) do
      {:ok, %{status: 200, body: body}} -> {:ok, body}
      {:ok, %{status: status, body: body}} -> {:error, {status, body}}
    end
  end

  def execute_action(:review_pr, %{owner: owner, repo: repo, pull_number: pull_number, event: event} = params, credential) do
    url = "#{@base_url}/repos/#{owner}/#{repo}/pulls/#{pull_number}/reviews"

    body = %{event: event, body: params[:body]}
    |> Enum.reject(fn {_k, v} -> is_nil(v) end)
    |> Map.new()

    case Req.post(url, json: body, headers: auth_headers(credential)) do
      {:ok, %{status: 200, body: body}} -> {:ok, body}
      {:ok, %{status: status, body: body}} -> {:error, {status, body}}
    end
  end

  def execute_action(action, _params, _credential) do
    {:error, {:unsupported_action, action}}
  end

  defp auth_headers(credential) do
    [
      {"authorization", "Bearer #{credential.access_token}"},
      {"accept", "application/vnd.github+json"},
      {"x-github-api-version", "2022-11-28"}
    ]
  end
end
