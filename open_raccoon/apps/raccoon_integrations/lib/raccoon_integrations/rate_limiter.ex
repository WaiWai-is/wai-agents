defmodule RaccoonIntegrations.RateLimiter do
  @moduledoc """
  Per-integration sliding window rate limiter using ETS.

  Tracks request counts per user per service within a configurable window.
  """

  @table :integration_rate_limits

  @doc """
  Initialize the ETS table for rate limiting.
  """
  def init do
    :ets.new(@table, [:named_table, :public, :set, read_concurrency: true, write_concurrency: true])
  end

  @doc """
  Check if a request is allowed under the rate limit.
  Returns :ok if allowed, {:error, :rate_limited} if not.
  """
  def check_rate(user_id, service, max_requests_per_minute) do
    key = {user_id, service}
    now = System.system_time(:second)
    window_start = now - 60

    case :ets.lookup(@table, key) do
      [{^key, requests}] ->
        # Filter to requests within the window
        current = Enum.filter(requests, fn ts -> ts > window_start end)

        if length(current) < max_requests_per_minute do
          :ok
        else
          {:error, :rate_limited}
        end

      [] ->
        :ok
    end
  end

  @doc """
  Record a request for rate limiting.
  """
  def record_call(user_id, service) do
    key = {user_id, service}
    now = System.system_time(:second)
    window_start = now - 60

    case :ets.lookup(@table, key) do
      [{^key, requests}] ->
        # Prune old entries and add new one
        current = Enum.filter(requests, fn ts -> ts > window_start end)
        :ets.insert(@table, {key, [now | current]})

      [] ->
        :ets.insert(@table, {key, [now]})
    end

    :ok
  end
end
