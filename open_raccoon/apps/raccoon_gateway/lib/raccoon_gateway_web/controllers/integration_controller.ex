defmodule RaccoonGatewayWeb.IntegrationController do
  use RaccoonGatewayWeb, :controller
  action_fallback RaccoonGatewayWeb.FallbackController

  alias RaccoonIntegrations
  alias RaccoonIntegrations.{OAuth, IntegrationRegistry}

  @doc """
  List all available integrations and the user's connection status.
  """
  def index(conn, _params) do
    user_id = conn.assigns.user_id
    credentials = RaccoonIntegrations.list_user_integrations(user_id)
    credential_map = Map.new(credentials, fn c -> {c.service, c} end)

    items =
      IntegrationRegistry.service_names()
      |> Enum.map(fn service ->
        {:ok, module} = IntegrationRegistry.get_integration(service)

        case Map.get(credential_map, service) do
          nil ->
            %{
              service: service,
              connected: false,
              status: "not_connected",
              auth_method: to_string(module.auth_method()),
              capabilities: Enum.map(module.capabilities(), &to_string/1),
              scopes: [],
              expires_at: nil
            }

          credential ->
            %{
              service: service,
              connected: true,
              status: to_string(credential.status),
              auth_method: credential.auth_method,
              capabilities: Enum.map(module.capabilities(), &to_string/1),
              scopes: credential.scopes,
              expires_at: credential.expires_at
            }
        end
      end)

    json(conn, %{items: items})
  end

  @doc """
  Start OAuth authorization flow for a service.
  Returns the authorize URL to redirect the user to.
  """
  def authorize(conn, %{"service" => service}) do
    user_id = conn.assigns.user_id

    case OAuth.authorize_url(service, user_id) do
      {:ok, url} ->
        json(conn, %{authorize_url: url})

      {:error, :unknown_service} ->
        {:error, :not_found}
    end
  end

  @doc """
  OAuth callback — exchanges the authorization code for tokens.
  This endpoint is public (no auth) since the OAuth provider redirects here.
  """
  def callback(conn, %{"service" => service, "code" => code, "state" => state}) do
    case OAuth.exchange_code(service, code, state) do
      {:ok, _credential} ->
        # Return a simple HTML page that closes the popup
        conn
        |> put_resp_content_type("text/html")
        |> send_resp(200, """
        <!DOCTYPE html>
        <html><head><title>Connected</title></head>
        <body><script>
          window.opener && window.opener.postMessage({type: 'oauth_success', service: '#{service}'}, '*');
          window.close();
        </script>
        <p>Integration connected. You can close this window.</p>
        </body></html>
        """)

      {:error, :invalid_state} ->
        conn
        |> put_status(:bad_request)
        |> json(%{error: %{code: "invalid_state", message: "Invalid or expired OAuth state"}})

      {:error, :state_expired} ->
        conn
        |> put_status(:bad_request)
        |> json(%{error: %{code: "state_expired", message: "OAuth state has expired"}})

      {:error, {:token_exchange_failed, status, body}} ->
        conn
        |> put_status(:bad_gateway)
        |> json(%{error: %{code: "token_exchange_failed", message: "Token exchange failed", details: %{status: status, body: body}}})
    end
  end

  def callback(conn, %{"service" => _service, "error" => error}) do
    conn
    |> put_status(:bad_request)
    |> json(%{error: %{code: "oauth_denied", message: "OAuth authorization denied: #{error}"}})
  end

  @doc """
  Disconnect (delete) an integration credential.
  """
  def disconnect(conn, %{"service" => service}) do
    user_id = conn.assigns.user_id

    case RaccoonIntegrations.get_credential(user_id, service) do
      nil -> {:error, :not_found}
      credential ->
        with {:ok, _} <- RaccoonIntegrations.delete_credential(credential) do
          send_resp(conn, :no_content, "")
        end
    end
  end

  @doc """
  Get the status of a specific integration.
  """
  def status(conn, %{"service" => service}) do
    user_id = conn.assigns.user_id

    case IntegrationRegistry.get_integration(service) do
      {:error, :unknown_service} ->
        {:error, :not_found}

      {:ok, _module} ->
        credential = RaccoonIntegrations.get_credential(user_id, service)

        status_info =
          case credential do
            nil ->
              %{
                service: service,
                connected: false,
                status: "not_connected",
                scopes: [],
                expires_at: nil,
                last_used_at: nil
              }

            cred ->
              %{
                service: service,
                connected: true,
                status: to_string(cred.status),
                scopes: cred.scopes,
                expires_at: cred.expires_at,
                last_used_at: cred.updated_at
              }
          end

        json(conn, status_info)
    end
  end
end
