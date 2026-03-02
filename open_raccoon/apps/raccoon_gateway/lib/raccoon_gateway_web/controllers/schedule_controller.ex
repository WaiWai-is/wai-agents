defmodule RaccoonGatewayWeb.ScheduleController do
  use RaccoonGatewayWeb, :controller
  action_fallback RaccoonGatewayWeb.FallbackController

  alias RaccoonShared.{Repo, Pagination}
  alias RaccoonAgents.AgentSchedule
  import Ecto.Query

  def index(conn, %{"agent_id" => agent_id} = params) do
    user_id = conn.assigns.user_id

    with :ok <- verify_agent_owner(agent_id, user_id) do
      {_cursor, limit} = Pagination.parse_params(params)

      schedules =
        from(s in AgentSchedule,
          where: s.agent_id == ^agent_id and s.user_id == ^user_id,
          order_by: [desc: s.inserted_at]
        )
        |> Repo.all()

      {items, page_info} = Pagination.build_page_info(Enum.take(schedules, limit + 1), limit)

      json(conn, %{
        items: Enum.map(items, &schedule_json/1),
        page_info: %{next_cursor: page_info.next_cursor, has_more: page_info.has_more}
      })
    end
  end

  def create(conn, %{"agent_id" => agent_id} = params) do
    user_id = conn.assigns.user_id

    with :ok <- verify_agent_owner(agent_id, user_id) do
      attrs =
        params
        |> Map.put("agent_id", agent_id)
        |> Map.put("user_id", user_id)

      changeset = AgentSchedule.changeset(%AgentSchedule{}, attrs)

      with {:ok, schedule} <- Repo.insert(changeset) do
        conn
        |> put_status(:created)
        |> json(%{schedule: schedule_json(schedule)})
      end
    end
  end

  def show(conn, %{"agent_id" => agent_id, "id" => id}) do
    user_id = conn.assigns.user_id

    with :ok <- verify_agent_owner(agent_id, user_id) do
      case Repo.get_by(AgentSchedule, id: id, agent_id: agent_id, user_id: user_id) do
        nil -> {:error, :not_found}
        schedule -> json(conn, %{schedule: schedule_json(schedule)})
      end
    end
  end

  def update(conn, %{"agent_id" => agent_id, "id" => id} = params) do
    user_id = conn.assigns.user_id

    with :ok <- verify_agent_owner(agent_id, user_id) do
      case Repo.get_by(AgentSchedule, id: id, agent_id: agent_id, user_id: user_id) do
        nil ->
          {:error, :not_found}

        schedule ->
          allowed = ["schedule_type", "cron_expression", "interval_seconds", "run_at", "enabled", "payload", "max_runs"]
          update_attrs = Map.take(params, allowed)

          with {:ok, updated} <- schedule |> AgentSchedule.changeset(update_attrs) |> Repo.update() do
            json(conn, %{schedule: schedule_json(updated)})
          end
      end
    end
  end

  def delete(conn, %{"agent_id" => agent_id, "id" => id}) do
    user_id = conn.assigns.user_id

    with :ok <- verify_agent_owner(agent_id, user_id) do
      case Repo.get_by(AgentSchedule, id: id, agent_id: agent_id, user_id: user_id) do
        nil -> {:error, :not_found}
        schedule ->
          with {:ok, _} <- Repo.delete(schedule) do
            send_resp(conn, :no_content, "")
          end
      end
    end
  end

  defp verify_agent_owner(agent_id, user_id) do
    case RaccoonAgents.get_agent(agent_id) do
      nil -> {:error, :not_found}
      %{creator_id: ^user_id} -> :ok
      _agent -> {:error, :forbidden}
    end
  end

  defp schedule_json(schedule) do
    %{
      id: schedule.id,
      agent_id: schedule.agent_id,
      schedule_type: schedule.schedule_type,
      cron_expression: schedule.cron_expression,
      interval_seconds: schedule.interval_seconds,
      run_at: schedule.run_at,
      enabled: schedule.enabled,
      last_run_at: schedule.last_run_at,
      next_run_at: schedule.next_run_at,
      run_count: schedule.run_count,
      max_runs: schedule.max_runs,
      payload: schedule.payload,
      created_at: schedule.inserted_at,
      updated_at: schedule.updated_at
    }
  end
end
