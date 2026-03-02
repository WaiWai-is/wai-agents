defmodule OpenRaccoon.MixProject do
  use Mix.Project

  def project do
    [
      apps_path: "apps",
      version: "0.1.0",
      start_permanent: Mix.env() == :prod,
      deps: deps(),
      releases: releases()
    ]
  end

  defp releases do
    [
      open_raccoon: [
        applications: [
          raccoon_shared: :permanent,
          raccoon_accounts: :permanent,
          raccoon_chat: :permanent,
          raccoon_agents: :permanent,
          raccoon_feed: :permanent,
          raccoon_bridges: :permanent,
          raccoon_pages: :permanent,
          raccoon_integrations: :permanent,
          raccoon_gateway: :permanent
        ]
      ]
    ]
  end

  # Dependencies listed here are available only for this
  # project and cannot be accessed from applications inside
  # the apps folder.
  #
  # Run "mix help deps" for examples and options.
  defp deps do
    [
      {:pgvector, "~> 0.3"},
      {:crontab, "~> 1.1"},
      {:stripity_stripe, "~> 3.0"}
    ]
  end
end
