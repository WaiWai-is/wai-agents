defmodule RaccoonIntegrations.Integrations.GoogleDrive do
  @moduledoc """
  Google Drive integration via shared Google OAuth 2.0.

  Supports searching, reading, creating, uploading, and sharing files.
  """

  @behaviour RaccoonIntegrations.Integration

  @base_url "https://www.googleapis.com/drive/v3"

  @impl true
  def service_name, do: "google_drive"

  @impl true
  def auth_method, do: :oauth2

  @impl true
  def oauth_config do
    %{
      client_id: Application.get_env(:raccoon_integrations, :google_client_id),
      client_secret: Application.get_env(:raccoon_integrations, :google_client_secret),
      auth_url: "https://accounts.google.com/o/oauth2/v2/auth",
      token_url: "https://oauth2.googleapis.com/token",
      scopes: ["https://www.googleapis.com/auth/drive.readonly", "https://www.googleapis.com/auth/drive.file"],
      pkce: false
    }
  end

  @impl true
  def capabilities, do: [:read, :write]

  @impl true
  def rate_limits do
    %{requests_per_minute_per_user: 12_000}
  end

  @impl true
  def execute_action(:search, %{query: query} = params, credential) do
    url = "#{@base_url}/files"

    query_params = %{
      q: query,
      pageSize: params[:max_results] || 10,
      fields: "files(id,name,mimeType,size,modifiedTime,webViewLink)"
    }

    case Req.get(url, params: query_params, headers: auth_headers(credential)) do
      {:ok, %{status: 200, body: body}} -> {:ok, body}
      {:ok, %{status: status, body: body}} -> {:error, {status, body}}
    end
  end

  def execute_action(:read, %{file_id: file_id}, credential) do
    url = "#{@base_url}/files/#{file_id}"

    case Req.get(url, params: %{alt: "media"}, headers: auth_headers(credential)) do
      {:ok, %{status: 200, body: body}} -> {:ok, %{content: body}}
      {:ok, %{status: status, body: body}} -> {:error, {status, body}}
    end
  end

  def execute_action(:create, %{name: name, content: content} = params, credential) do
    metadata = %{
      name: name,
      mimeType: params[:mime_type] || "text/plain",
      parents: if(params[:parent_id], do: [params[:parent_id]], else: nil)
    }
    |> Enum.reject(fn {_k, v} -> is_nil(v) end)
    |> Map.new()

    url = "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart"

    boundary = "raccoon_boundary_#{:crypto.strong_rand_bytes(8) |> Base.url_encode64(padding: false)}"

    multipart_body =
      "--#{boundary}\r\nContent-Type: application/json\r\n\r\n#{Jason.encode!(metadata)}\r\n--#{boundary}\r\nContent-Type: #{metadata[:mimeType] || "text/plain"}\r\n\r\n#{content}\r\n--#{boundary}--"

    headers = auth_headers(credential) ++ [{"content-type", "multipart/related; boundary=#{boundary}"}]

    case Req.post(url, body: multipart_body, headers: headers) do
      {:ok, %{status: 200, body: body}} -> {:ok, body}
      {:ok, %{status: status, body: body}} -> {:error, {status, body}}
    end
  end

  def execute_action(:share, %{file_id: file_id, email: email, role: role}, credential) do
    url = "#{@base_url}/files/#{file_id}/permissions"

    body = %{type: "user", role: role || "reader", emailAddress: email}

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
