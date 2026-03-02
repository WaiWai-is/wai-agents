defmodule RaccoonIntegrations.Workers.TokenRefreshWorker do
  @moduledoc """
  Oban cron worker that proactively refreshes OAuth tokens
  before they expire.

  Runs every 15 minutes and refreshes tokens expiring within 30 minutes.
  """

  use Oban.Worker, queue: :integrations, max_attempts: 3

  alias RaccoonShared.Repo
  alias RaccoonIntegrations.{Credential, OAuth}
  import Ecto.Query

  require Logger

  @impl Oban.Worker
  def perform(%Oban.Job{}) do
    threshold = DateTime.utc_now() |> DateTime.add(30 * 60, :second)

    expiring_credentials =
      from(c in Credential,
        where: c.status == :active and not is_nil(c.expires_at) and c.expires_at < ^threshold,
        where: c.auth_method in ["oauth2", "oauth2_pkce"]
      )
      |> Repo.all()

    results =
      Enum.map(expiring_credentials, fn credential ->
        case OAuth.refresh_token(credential.service, credential) do
          {:ok, _updated} ->
            Logger.info("Refreshed token for #{credential.service} (user #{credential.user_id})")
            :ok

          {:error, reason} ->
            Logger.error("Token refresh failed for #{credential.service} (user #{credential.user_id}): #{inspect(reason)}")

            # Mark as expired if refresh fails
            credential
            |> Credential.changeset(%{status: :expired})
            |> Repo.update()

            {:error, reason}
        end
      end)

    errors = Enum.filter(results, &match?({:error, _}, &1))

    if errors == [] do
      :ok
    else
      Logger.warning("#{length(errors)} token refresh(es) failed out of #{length(results)}")
      :ok
    end
  end
end
