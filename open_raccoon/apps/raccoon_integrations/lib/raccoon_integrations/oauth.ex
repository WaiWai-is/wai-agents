defmodule RaccoonIntegrations.OAuth do
  @moduledoc """
  Generic OAuth 2.0 + PKCE flow for third-party integrations.

  Handles authorization URL generation, code exchange, and token refresh.
  State tokens are stored in ETS for verification during callbacks.
  """

  alias RaccoonIntegrations.{Credential, IntegrationRegistry}

  @state_table :oauth_state_store

  @doc """
  Initialize the ETS table for OAuth state storage.
  Called from the application supervisor.
  """
  def init_state_store do
    :ets.new(@state_table, [:named_table, :public, read_concurrency: true])
  end

  @doc """
  Generate an authorization URL for a given service and user.
  Stores state token in ETS for verification during callback.
  """
  def authorize_url(service, user_id, opts \\ []) do
    with {:ok, module} <- IntegrationRegistry.get_integration(service) do
      config = module.oauth_config()
      state = generate_state(user_id, service)

      params = %{
        "client_id" => config[:client_id],
        "redirect_uri" => callback_url(service),
        "response_type" => "code",
        "scope" => Enum.join(config[:scopes] || [], " "),
        "state" => state,
        "access_type" => "offline",
        "prompt" => "consent"
      }

      params =
        if config[:pkce] do
          {verifier, challenge} = generate_pkce()
          store_state(state, %{user_id: user_id, service: service, pkce_verifier: verifier})

          Map.merge(params, %{
            "code_challenge" => challenge,
            "code_challenge_method" => "S256"
          })
        else
          store_state(state, %{user_id: user_id, service: service})
          params
        end

      params = if opts[:extra_params], do: Map.merge(params, opts[:extra_params]), else: params

      url = "#{config[:auth_url]}?#{URI.encode_query(params)}"
      {:ok, url}
    end
  end

  @doc """
  Exchange an authorization code for tokens.
  Verifies the state token, exchanges the code, and stores encrypted credentials.
  """
  def exchange_code(service, code, state) do
    with {:ok, state_data} <- verify_state(state),
         {:ok, module} <- IntegrationRegistry.get_integration(service) do
      config = module.oauth_config()

      body = %{
        "grant_type" => "authorization_code",
        "code" => code,
        "client_id" => config[:client_id],
        "client_secret" => config[:client_secret],
        "redirect_uri" => callback_url(service)
      }

      body =
        case Map.get(state_data, :pkce_verifier) do
          nil -> body
          verifier -> Map.put(body, "code_verifier", verifier)
        end

      case Req.post(config[:token_url], form: body) do
        {:ok, %{status: 200, body: tokens}} ->
          save_credentials(state_data.user_id, service, module, tokens)

        {:ok, %{status: status, body: error_body}} ->
          {:error, {:token_exchange_failed, status, error_body}}
      end
    end
  end

  @doc """
  Refresh an expired access token using the refresh token.
  """
  def refresh_token(service, %Credential{} = credential) do
    with {:ok, module} <- IntegrationRegistry.get_integration(service),
         {:ok, tokens_json} <- RaccoonBridges.CredentialEncryption.decrypt(credential.encrypted_tokens),
         {:ok, tokens} <- Jason.decode(tokens_json) do
      config = module.oauth_config()

      body = %{
        "grant_type" => "refresh_token",
        "refresh_token" => tokens["refresh_token"],
        "client_id" => config[:client_id],
        "client_secret" => config[:client_secret]
      }

      case Req.post(config[:token_url], form: body) do
        {:ok, %{status: 200, body: new_tokens}} ->
          # Preserve the refresh token if not returned in the response
          merged = Map.merge(tokens, new_tokens)
          save_credentials(credential.user_id, service, module, merged)

        {:ok, %{status: status, body: error_body}} ->
          {:error, {:refresh_failed, status, error_body}}
      end
    end
  end

  # --- Private ---

  defp generate_state(user_id, service) do
    payload = "#{user_id}:#{service}:#{:crypto.strong_rand_bytes(16) |> Base.url_encode64(padding: false)}"
    Base.url_encode64(payload, padding: false)
  end

  defp generate_pkce do
    verifier = :crypto.strong_rand_bytes(32) |> Base.url_encode64(padding: false)
    challenge = :crypto.hash(:sha256, verifier) |> Base.url_encode64(padding: false)
    {verifier, challenge}
  end

  defp callback_url(service) do
    base_url = Application.get_env(:raccoon_integrations, :base_url, "https://openraccoon.com")
    "#{base_url}/api/v1/integrations/callback/#{service}"
  end

  defp store_state(state, data) do
    # State expires after 10 minutes
    expiry = System.system_time(:second) + 600
    :ets.insert(@state_table, {state, Map.put(data, :expires_at, expiry)})
  end

  defp verify_state(state) do
    case :ets.lookup(@state_table, state) do
      [{^state, data}] ->
        :ets.delete(@state_table, state)

        if data.expires_at > System.system_time(:second) do
          {:ok, data}
        else
          {:error, :state_expired}
        end

      [] ->
        {:error, :invalid_state}
    end
  end

  defp save_credentials(user_id, service, module, tokens) do
    tokens_json = Jason.encode!(tokens)
    {:ok, encrypted} = RaccoonBridges.CredentialEncryption.encrypt(tokens_json)

    expires_at =
      case tokens["expires_in"] do
        nil -> nil
        seconds -> DateTime.utc_now() |> DateTime.add(seconds, :second)
      end

    attrs = %{
      user_id: user_id,
      service: service,
      auth_method: to_string(module.auth_method()),
      encrypted_tokens: encrypted,
      scopes: module.oauth_config()[:scopes] || [],
      expires_at: expires_at,
      status: :active,
      metadata: %{}
    }

    RaccoonIntegrations.save_credential(attrs)
  end
end
