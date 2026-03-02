defmodule RaccoonGatewayWeb.FallbackController do
  @moduledoc """
  Translates controller action results into HTTP responses.
  Handles error tuples returned by controller actions and converts
  them to properly formatted JSON error responses.
  """

  use RaccoonGatewayWeb, :controller

  def call(conn, {:error, %Ecto.Changeset{} = changeset}) do
    errors =
      Ecto.Changeset.traverse_errors(changeset, fn {msg, opts} ->
        Regex.replace(~r"%{(\w+)}", msg, fn _, key ->
          opts |> Keyword.get(String.to_existing_atom(key), key) |> to_string()
        end)
      end)

    conn
    |> put_status(:unprocessable_entity)
    |> json(%{error: %{code: "validation_failed", message: "Validation failed", details: errors}})
  end

  def call(conn, {:error, :not_found}) do
    conn
    |> put_status(:not_found)
    |> json(%{error: %{code: "not_found", message: "Resource not found"}})
  end

  def call(conn, {:error, :unauthorized}) do
    conn
    |> put_status(:unauthorized)
    |> json(%{error: %{code: "unauthorized", message: "Invalid credentials"}})
  end

  def call(conn, {:error, :invalid_credentials}) do
    conn
    |> put_status(:unauthorized)
    |> json(%{error: %{code: "unauthorized", message: "Invalid email or password"}})
  end

  def call(conn, {:error, :token_revoked}) do
    conn
    |> put_status(:unauthorized)
    |> json(%{error: %{code: "token_revoked", message: "Token has been revoked"}})
  end

  def call(conn, {:error, :invalid_token}) do
    conn
    |> put_status(:unauthorized)
    |> json(%{error: %{code: "invalid_token", message: "Token is invalid or expired"}})
  end

  def call(conn, {:error, :forbidden}) do
    conn
    |> put_status(:forbidden)
    |> json(%{error: %{code: "forbidden", message: "You do not have permission"}})
  end

  def call(conn, {:error, :resource_not_found}) do
    conn
    |> put_status(:not_found)
    |> json(%{error: %{code: "not_found", message: "Resource not found"}})
  end

  def call(conn, {:error, :not_implemented}) do
    conn
    |> put_status(501)
    |> json(%{error: %{code: "not_implemented", message: "This feature is not yet implemented"}})
  end

  def call(conn, {:error, %RaccoonShared.Error{} = error}) do
    status =
      case error.code do
        "not_found" -> :not_found
        "validation_failed" -> :unprocessable_entity
        "rate_limited" -> 429
        "idempotency_conflict" -> :conflict
        "forbidden" -> :forbidden
        "bridge_not_connected" -> :bad_request
        "deadline_exceeded" -> :gateway_timeout
        "tool_permission_denied" -> :forbidden
        _ -> :internal_server_error
      end

    conn
    |> put_status(status)
    |> json(%{error: %{code: error.code, message: error.message, details: error.details}})
  end
end
