defmodule RaccoonAccounts.Token do
  @moduledoc """
  JWT token creation, refresh, and revocation.
  Access tokens are short-lived (15 min), refresh tokens are long-lived (30 days).

  Token rotation: when refreshing, the old refresh token is revoked before
  issuing a new pair, preventing token reuse attacks.
  """

  alias RaccoonAccounts.Guardian
  alias RaccoonAccounts.TokenStore

  @access_ttl {15, :minute}
  @refresh_ttl {30, :day}

  @doc """
  Create an access/refresh token pair for the given user.
  Returns `{:ok, %{access_token: ..., refresh_token: ..., expires_in: 900}}`.
  """
  def create_tokens(user) do
    with {:ok, access_token, _claims} <-
           Guardian.encode_and_sign(user, %{}, token_type: "access", ttl: @access_ttl),
         {:ok, refresh_token, _claims} <-
           Guardian.encode_and_sign(user, %{}, token_type: "refresh", ttl: @refresh_ttl) do
      {:ok, %{access_token: access_token, refresh_token: refresh_token, expires_in: 900}}
    end
  end

  @doc """
  Refresh tokens by validating the refresh token and issuing a new pair.
  The old refresh token is revoked (token rotation) to prevent reuse.
  Returns `{:ok, tokens}` or `{:error, reason}`.
  """
  def refresh(refresh_token) do
    with {:ok, claims} <- Guardian.decode_and_verify(refresh_token, %{"typ" => "refresh"}),
         :ok <- check_not_revoked(claims),
         {:ok, user} <- Guardian.resource_from_claims(claims) do
      # Revoke the old refresh token before issuing new ones (token rotation)
      revoke_by_claims(claims)
      create_tokens(user)
    else
      {:error, :token_revoked} -> {:error, :token_revoked}
      {:error, :resource_not_found} -> {:error, :invalid_token}
      {:error, _reason} -> {:error, :invalid_token}
    end
  end

  @doc """
  Revoke a token (typically the refresh token on logout).
  """
  def revoke(token) do
    case Guardian.decode_and_verify(token) do
      {:ok, %{"jti" => jti, "exp" => exp}} ->
        TokenStore.revoke(jti, exp)
        {:ok, token}

      error ->
        error
    end
  end

  @doc """
  Check if a token has been revoked by its claims.
  Returns `:ok` if the token is valid, `{:error, :token_revoked}` if revoked.
  """
  def check_not_revoked(%{"jti" => jti}) do
    if TokenStore.revoked?(jti) do
      {:error, :token_revoked}
    else
      :ok
    end
  end

  def check_not_revoked(_claims), do: :ok

  # Revoke a token using its already-decoded claims
  defp revoke_by_claims(%{"jti" => jti, "exp" => exp}) do
    TokenStore.revoke(jti, exp)
  end

  defp revoke_by_claims(_claims), do: :ok
end
