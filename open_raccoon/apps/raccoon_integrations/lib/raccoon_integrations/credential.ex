defmodule RaccoonIntegrations.Credential do
  @moduledoc """
  Ecto schema for integration_credentials table.

  Stores encrypted OAuth tokens and API keys for third-party integrations.
  Encryption uses AES-256-GCM via RaccoonBridges.CredentialEncryption.
  """

  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id
  schema "integration_credentials" do
    belongs_to(:user, RaccoonAccounts.User)

    field(:service, :string)
    field(:auth_method, :string)
    field(:encrypted_tokens, :binary)
    field(:scopes, {:array, :string}, default: [])
    field(:expires_at, :utc_datetime_usec)
    field(:refresh_expires_at, :utc_datetime_usec)
    field(:status, Ecto.Enum, values: [:active, :expired, :revoked], default: :active)
    field(:metadata, :map, default: %{})

    timestamps(type: :utc_datetime_usec)
  end

  def changeset(credential, attrs) do
    credential
    |> cast(attrs, [
      :user_id,
      :service,
      :auth_method,
      :encrypted_tokens,
      :scopes,
      :expires_at,
      :refresh_expires_at,
      :status,
      :metadata
    ])
    |> validate_required([:user_id, :service, :auth_method, :encrypted_tokens])
    |> validate_inclusion(:auth_method, ["oauth2", "oauth2_pkce", "bot_token", "api_key"])
    |> unique_constraint([:user_id, :service])
    |> foreign_key_constraint(:user_id)
  end

  @doc """
  Decrypt the stored tokens and return the parsed JSON map.
  """
  def decrypt_tokens(%__MODULE__{encrypted_tokens: encrypted}) do
    with {:ok, json} <- RaccoonBridges.CredentialEncryption.decrypt(encrypted),
         {:ok, tokens} <- Jason.decode(json) do
      {:ok, tokens}
    end
  end
end
