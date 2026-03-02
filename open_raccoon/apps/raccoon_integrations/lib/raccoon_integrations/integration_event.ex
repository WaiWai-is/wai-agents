defmodule RaccoonIntegrations.IntegrationEvent do
  @moduledoc """
  Normalized webhook event struct.

  All inbound webhook payloads are normalized into this struct
  for uniform processing by the channel router and event system.
  """

  @type t :: %__MODULE__{
          service: String.t(),
          event_type: String.t(),
          external_id: String.t() | nil,
          actor: map(),
          payload: map(),
          raw_payload: map(),
          timestamp: DateTime.t()
        }

  defstruct [
    :service,
    :event_type,
    :external_id,
    :actor,
    :payload,
    :raw_payload,
    :timestamp
  ]
end
