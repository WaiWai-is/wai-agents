defmodule RaccoonGateway.Workers.AgentScheduleWorker do
  @moduledoc """
  Self-rescheduling Oban worker for agent schedules.

  Runs every minute via cron. For each due schedule:
  1. Executes the agent via EventRouter
  2. Updates run count and last_run_at
  3. Re-inserts the next Oban job based on cron/interval/one-shot
  """

  use Oban.Worker, queue: :agents, max_attempts: 2

  alias RaccoonShared.Repo
  alias RaccoonAgents.AgentSchedule
  alias RaccoonAgents.EventRouter
  import Ecto.Query
  require Logger

  @impl Oban.Worker
  def perform(%Oban.Job{args: %{"schedule_id" => schedule_id}}) do
    schedule = Repo.get!(AgentSchedule, schedule_id) |> Repo.preload(:agent)

    if not schedule.enabled do
      :ok
    else
      execute_scheduled_agent(schedule)
      update_schedule_after_run(schedule)
      maybe_schedule_next(schedule)
      :ok
    end
  end

  @impl Oban.Worker
  def perform(%Oban.Job{args: %{"task" => "scan"}}) do
    # Scan for newly-created schedules that don't have a pending Oban job yet.
    # The cron entry calls this every minute.
    now = DateTime.utc_now()

    schedules =
      from(s in AgentSchedule,
        where: s.enabled == true and (is_nil(s.next_run_at) or s.next_run_at <= ^now),
        preload: [:agent]
      )
      |> Repo.all()

    for schedule <- schedules do
      execute_scheduled_agent(schedule)
      update_schedule_after_run(schedule)
      maybe_schedule_next(schedule)
    end

    :ok
  end

  # -- Private ---------------------------------------------------------------

  defp execute_scheduled_agent(schedule) do
    Logger.info("Executing scheduled agent",
      schedule_id: schedule.id,
      agent_id: schedule.agent_id
    )

    schedule_payload = schedule.payload || %{}

    payload = %{
      conversation_id: Map.get(schedule_payload, "conversation_id", Ecto.UUID.generate()),
      agent_id: schedule.agent_id,
      user_id: schedule.user_id,
      messages: Map.get(schedule_payload, "messages", []),
      config: %{
        agent_id: schedule.agent_id,
        system_prompt: schedule.agent.system_prompt,
        model: schedule.agent.model,
        temperature: schedule.agent.temperature,
        max_tokens: schedule.agent.max_tokens
      }
    }

    EventRouter.route_trigger(:cron_schedule, payload)
  end

  defp update_schedule_after_run(schedule) do
    schedule
    |> Ecto.Changeset.change(%{
      run_count: (schedule.run_count || 0) + 1,
      last_run_at: DateTime.utc_now()
    })
    |> Repo.update!()
  end

  defp maybe_schedule_next(%{schedule_type: :once}), do: :ok

  defp maybe_schedule_next(%{max_runs: max, run_count: count})
       when is_integer(max) and count + 1 >= max,
       do: :ok

  defp maybe_schedule_next(schedule) do
    next_at = compute_next_run(schedule)

    schedule
    |> Ecto.Changeset.change(%{next_run_at: next_at})
    |> Repo.update!()

    %{"schedule_id" => schedule.id}
    |> __MODULE__.new(scheduled_at: next_at)
    |> Oban.insert!()
  end

  defp compute_next_run(%{schedule_type: :cron, cron_expression: expr}) do
    {:ok, cron} = Crontab.CronExpression.Parser.parse(expr)

    Crontab.Scheduler.get_next_run_date!(cron)
    |> DateTime.from_naive!("Etc/UTC")
  end

  defp compute_next_run(%{schedule_type: :interval, interval_seconds: seconds}) do
    DateTime.utc_now() |> DateTime.add(seconds, :second)
  end
end
