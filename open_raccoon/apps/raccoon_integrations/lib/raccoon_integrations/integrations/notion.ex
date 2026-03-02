defmodule RaccoonIntegrations.Integrations.Notion do
  @moduledoc """
  Notion integration via OAuth 2.0.

  Supports searching, reading/creating/updating pages, and querying databases.
  """

  @behaviour RaccoonIntegrations.Integration

  @base_url "https://api.notion.com/v1"
  @notion_version "2022-06-28"

  @impl true
  def service_name, do: "notion"

  @impl true
  def auth_method, do: :oauth2

  @impl true
  def oauth_config do
    %{
      client_id: Application.get_env(:raccoon_integrations, :notion_client_id),
      client_secret: Application.get_env(:raccoon_integrations, :notion_client_secret),
      auth_url: "https://api.notion.com/v1/oauth/authorize",
      token_url: "https://api.notion.com/v1/oauth/token",
      scopes: [],
      pkce: false
    }
  end

  @impl true
  def capabilities, do: [:read, :write]

  @impl true
  def rate_limits do
    %{requests_per_second: 3}
  end

  @impl true
  def execute_action(:search, %{query: query} = params, credential) do
    body = %{query: query, page_size: params[:page_size] || 10}
    body = if params[:filter], do: Map.put(body, :filter, params.filter), else: body

    case Req.post("#{@base_url}/search", json: body, headers: auth_headers(credential)) do
      {:ok, %{status: 200, body: body}} -> {:ok, body}
      {:ok, %{status: status, body: body}} -> {:error, {status, body}}
    end
  end

  def execute_action(:read_page, %{page_id: page_id}, credential) do
    case Req.get("#{@base_url}/pages/#{page_id}", headers: auth_headers(credential)) do
      {:ok, %{status: 200, body: body}} -> {:ok, body}
      {:ok, %{status: status, body: body}} -> {:error, {status, body}}
    end
  end

  def execute_action(:create_page, %{parent: parent, properties: properties} = params, credential) do
    body = %{parent: parent, properties: properties}
    body = if params[:children], do: Map.put(body, :children, params.children), else: body

    case Req.post("#{@base_url}/pages", json: body, headers: auth_headers(credential)) do
      {:ok, %{status: 200, body: body}} -> {:ok, body}
      {:ok, %{status: status, body: body}} -> {:error, {status, body}}
    end
  end

  def execute_action(:update_page, %{page_id: page_id, properties: properties}, credential) do
    case Req.patch("#{@base_url}/pages/#{page_id}", json: %{properties: properties}, headers: auth_headers(credential)) do
      {:ok, %{status: 200, body: body}} -> {:ok, body}
      {:ok, %{status: status, body: body}} -> {:error, {status, body}}
    end
  end

  def execute_action(:query_database, %{database_id: database_id} = params, credential) do
    body = %{page_size: params[:page_size] || 10}
    body = if params[:filter], do: Map.put(body, :filter, params.filter), else: body
    body = if params[:sorts], do: Map.put(body, :sorts, params.sorts), else: body

    case Req.post("#{@base_url}/databases/#{database_id}/query", json: body, headers: auth_headers(credential)) do
      {:ok, %{status: 200, body: body}} -> {:ok, body}
      {:ok, %{status: status, body: body}} -> {:error, {status, body}}
    end
  end

  def execute_action(:create_database_entry, %{database_id: database_id, properties: properties}, credential) do
    body = %{
      parent: %{database_id: database_id},
      properties: properties
    }

    case Req.post("#{@base_url}/pages", json: body, headers: auth_headers(credential)) do
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
      {"notion-version", @notion_version}
    ]
  end
end
