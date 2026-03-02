defmodule RaccoonIntegrations.RateLimiterTest do
  use ExUnit.Case, async: false

  alias RaccoonIntegrations.RateLimiter

  setup do
    # Reinitialize the ETS table for each test
    if :ets.whereis(:integration_rate_limits) != :undefined do
      :ets.delete_all_objects(:integration_rate_limits)
    end

    :ok
  end

  describe "check_rate/3" do
    test "allows requests under the limit" do
      assert :ok = RateLimiter.check_rate("user1", "github", 5)
    end

    test "allows requests up to the limit" do
      for _ <- 1..4 do
        RateLimiter.record_call("user2", "github")
      end

      assert :ok = RateLimiter.check_rate("user2", "github", 5)
    end

    test "blocks requests over the limit" do
      for _ <- 1..5 do
        RateLimiter.record_call("user3", "slack")
      end

      assert {:error, :rate_limited} = RateLimiter.check_rate("user3", "slack", 5)
    end

    test "different users have independent limits" do
      for _ <- 1..5 do
        RateLimiter.record_call("user4", "github")
      end

      assert {:error, :rate_limited} = RateLimiter.check_rate("user4", "github", 5)
      assert :ok = RateLimiter.check_rate("user5", "github", 5)
    end

    test "different services have independent limits" do
      for _ <- 1..5 do
        RateLimiter.record_call("user6", "github")
      end

      assert {:error, :rate_limited} = RateLimiter.check_rate("user6", "github", 5)
      assert :ok = RateLimiter.check_rate("user6", "slack", 5)
    end
  end

  describe "record_call/2" do
    test "records a call" do
      assert :ok = RateLimiter.record_call("user7", "notion")
    end
  end
end
