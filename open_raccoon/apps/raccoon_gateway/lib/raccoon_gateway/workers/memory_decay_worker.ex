defmodule RaccoonGateway.Workers.MemoryDecayWorker do
  @moduledoc """
  Daily Oban worker that applies temporal decay to agent memories.

  - Reduces `decay_factor` by 5% for memories not accessed in 7+ days
  - Prunes memories when a user-agent pair exceeds 500
  - Deletes memories whose decay_factor drops below 0.01
  """

  use Oban.Worker, queue: :maintenance, max_attempts: 2

  alias RaccoonShared.Repo
  import Ecto.Query
  require Logger

  @decay_rate 0.95
  @stale_days 7
  @max_memories_per_pair 500
  @min_decay_factor 0.01

  @impl Oban.Worker
  def perform(%Oban.Job{}) do
    Logger.info("Running memory decay worker")

    decayed = apply_decay()
    pruned_low = prune_low_decay()
    pruned_excess = prune_excess_memories()

    Logger.info("Memory decay complete",
      decayed: decayed,
      pruned_low_decay: pruned_low,
      pruned_excess: pruned_excess
    )

    :ok
  end

  # -- Private ---------------------------------------------------------------

  defp apply_decay do
    stale_cutoff =
      DateTime.utc_now()
      |> DateTime.add(-@stale_days * 24 * 60 * 60, :second)

    {count, _} =
      from(m in "agent_memories",
        where:
          (is_nil(m.last_accessed_at) and m.inserted_at < ^stale_cutoff) or
            (not is_nil(m.last_accessed_at) and m.last_accessed_at < ^stale_cutoff),
        update: [set: [decay_factor: fragment("decay_factor * ?", ^@decay_rate)]]
      )
      |> Repo.update_all([])

    count
  end

  defp prune_low_decay do
    {count, _} =
      from(m in "agent_memories",
        where: m.decay_factor < ^@min_decay_factor
      )
      |> Repo.delete_all()

    count
  end

  defp prune_excess_memories do
    # Find user-agent pairs that exceed the memory limit
    pairs =
      from(m in "agent_memories",
        group_by: [m.agent_id, m.user_id],
        having: count(m.id) > ^@max_memories_per_pair,
        select: %{agent_id: m.agent_id, user_id: m.user_id, total: count(m.id)}
      )
      |> Repo.all()

    Enum.reduce(pairs, 0, fn %{agent_id: agent_id, user_id: user_id, total: total}, acc ->
      excess = total - @max_memories_per_pair

      # Delete the lowest-relevance memories (lowest decay_factor * importance)
      ids_to_delete =
        from(m in "agent_memories",
          where: m.agent_id == ^agent_id and m.user_id == ^user_id,
          order_by: [asc: fragment("importance * decay_factor")],
          limit: ^excess,
          select: m.id
        )
        |> Repo.all()

      {deleted, _} =
        from(m in "agent_memories", where: m.id in ^ids_to_delete)
        |> Repo.delete_all()

      acc + deleted
    end)
  end
end
