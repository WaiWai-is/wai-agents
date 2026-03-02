defmodule RaccoonIntegrations do
  @moduledoc """
  Integration platform for Open Raccoon.

  Manages OAuth connections, credentials, webhooks, channel routing,
  and per-service API interactions for 30+ third-party services.
  """

  alias RaccoonShared.Repo
  alias RaccoonIntegrations.Credential
  import Ecto.Query

  @doc """
  List all integration credentials for a user.
  Returns credentials with decrypted status info (not the tokens themselves).
  """
  def list_user_integrations(user_id) do
    from(c in Credential,
      where: c.user_id == ^user_id,
      order_by: [asc: c.service]
    )
    |> Repo.all()
  end

  @doc """
  Get a credential for a specific user and service.
  """
  def get_credential(user_id, service) do
    Repo.get_by(Credential, user_id: user_id, service: service)
  end

  @doc """
  Get a credential for a specific user and service, raising if not found.
  """
  def get_credential!(user_id, service) do
    Repo.get_by!(Credential, user_id: user_id, service: service)
  end

  @doc """
  Save or update integration credentials for a user.
  """
  def save_credential(attrs) do
    %Credential{}
    |> Credential.changeset(attrs)
    |> Repo.insert(
      on_conflict: {:replace, [:encrypted_tokens, :scopes, :expires_at, :refresh_expires_at, :status, :metadata, :updated_at]},
      conflict_target: [:user_id, :service]
    )
  end

  @doc """
  Delete (disconnect) an integration credential.
  """
  def delete_credential(%Credential{} = credential) do
    Repo.delete(credential)
  end

  @doc """
  Update credential status.
  """
  def update_credential_status(%Credential{} = credential, status) do
    credential
    |> Credential.changeset(%{status: status})
    |> Repo.update()
  end
end
