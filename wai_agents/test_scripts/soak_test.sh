#!/usr/bin/env bash
# soak_test.sh — Continuous long-running soak test for WaiAgents API
# Runs a random mix of API operations every 30 seconds for hours.
# Logs CSV metrics to /tmp/wai_agents_soak_test.log

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/helpers.sh"

# Override set -e from helpers.sh — soak test must not exit on individual failures
set +e

BASE="${BASE_URL:-https://openraccoon.com/api/v1}"

# --- Configuration ---

SOAK_DURATION_HOURS="${SOAK_DURATION_HOURS:-4}"
SOAK_INTERVAL_SECONDS=30
LOG_FILE="/tmp/wai_agents_soak_test.log"
TOKEN_FILE="/tmp/wai_agents_test_tokens.env"

# --- Load tokens ---

if [[ ! -f "$TOKEN_FILE" ]]; then
  echo "ERROR: Token file not found: $TOKEN_FILE" >&2
  echo "Run auth_tests.sh first to create test accounts and tokens." >&2
  exit 1
fi

source "$TOKEN_FILE"

# --- Token refresh function ---
# Tokens expire in 15 minutes. Re-login all users periodically.

refresh_all_tokens() {
  log_info "Refreshing all user tokens..."
  login_user "$ALICE_EMAIL" "$ALICE_PASSWORD"
  if [[ "$HTTP_STATUS" == "200" ]]; then
    ALICE_TOKEN="$ACCESS_TOKEN"; ALICE_ID="$USER_ID"
  fi
  sleep 13
  login_user "$BOB_EMAIL" "$BOB_PASSWORD"
  if [[ "$HTTP_STATUS" == "200" ]]; then
    BOB_TOKEN="$ACCESS_TOKEN"; BOB_ID="$USER_ID"
  fi
  sleep 13
  login_user "$CHARLIE_EMAIL" "$CHARLIE_PASSWORD"
  if [[ "$HTTP_STATUS" == "200" ]]; then
    CHARLIE_TOKEN="$ACCESS_TOKEN"; CHARLIE_ID="$USER_ID"
  fi
  sleep 13
  login_user "$DIANA_EMAIL" "$DIANA_PASSWORD"
  if [[ "$HTTP_STATUS" == "200" ]]; then
    DIANA_TOKEN="$ACCESS_TOKEN"; DIANA_ID="$USER_ID"
  fi
  USER_TOKENS=("$ALICE_TOKEN" "$BOB_TOKEN" "$CHARLIE_TOKEN" "$DIANA_TOKEN")
  USER_IDS=("$ALICE_ID" "$BOB_ID" "$CHARLIE_ID" "$DIANA_ID")
  log_info "Token refresh complete"
}

# Initial login
refresh_all_tokens
LAST_REFRESH=$(date +%s)
TOKEN_REFRESH_INTERVAL=600  # Refresh every 10 minutes

# --- User pool ---

USER_NAMES=("alice" "bob" "charlie" "diana")
USER_TOKENS=("$ALICE_TOKEN" "$BOB_TOKEN" "$CHARLIE_TOKEN" "$DIANA_TOKEN")
USER_IDS=("$ALICE_ID" "$BOB_ID" "$CHARLIE_ID" "$DIANA_ID")

# --- Resource tracking arrays ---

CONVERSATION_IDS=()
AGENT_IDS=()
FEED_ITEM_IDS=()

# --- Stats ---

TOTAL_REQUESTS=0
SUCCESS_COUNT=0
ERROR_COUNT=0
LATENCY_SUM=0
LATENCY_MIN=999999
LATENCY_MAX=0
# Note: macOS bash 3 doesn't support associative arrays, so we track errors as a list
ERROR_STATUS_LOG=""

START_TIME=$(date +%s)
END_TIME=$((START_TIME + SOAK_DURATION_HOURS * 3600))
ITERATION=0

# --- Colors ---

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m'

# --- Helper functions ---

random_int() {
  # Returns random int in range [0, $1)
  echo $(( RANDOM % $1 ))
}

random_user_index() {
  random_int ${#USER_NAMES[@]}
}

random_token() {
  local idx
  idx=$(random_user_index)
  echo "${USER_TOKENS[$idx]}"
}

random_user_id() {
  local idx
  idx=$(random_user_index)
  echo "${USER_IDS[$idx]}"
}

# Convert latency from seconds (float) to milliseconds (int)
latency_ms() {
  local latency="$1"
  python3 -c "print(int(float('$latency') * 1000))" 2>/dev/null || echo "0"
}

# Log a CSV row: timestamp,endpoint,method,status_code,latency_ms
log_csv() {
  local endpoint="$1"
  local method="$2"
  local status="$3"
  local latency="$4"
  local ms
  ms=$(latency_ms "$latency")
  echo "$(date -u +"%Y-%m-%dT%H:%M:%SZ"),$method $endpoint,$status,$ms" >> "$LOG_FILE"
}

# Update stats after a request
update_stats() {
  local endpoint="$1"
  local method="$2"
  local status="$3"
  local latency="$4"

  TOTAL_REQUESTS=$((TOTAL_REQUESTS + 1))

  local ms
  ms=$(latency_ms "$latency")

  # Accumulate latency
  LATENCY_SUM=$((LATENCY_SUM + ms))

  # Min/max
  if (( ms < LATENCY_MIN )); then
    LATENCY_MIN=$ms
  fi
  if (( ms > LATENCY_MAX )); then
    LATENCY_MAX=$ms
  fi

  # Success vs error
  if [[ "$status" =~ ^2[0-9]{2}$ ]]; then
    SUCCESS_COUNT=$((SUCCESS_COUNT + 1))
  else
    ERROR_COUNT=$((ERROR_COUNT + 1))
    ERROR_STATUS_LOG="${ERROR_STATUS_LOG}${status}\n"
  fi

  # Log CSV
  log_csv "$endpoint" "$method" "$status" "$latency"

  # Alert on critical issues
  if [[ "$status" =~ ^5[0-9]{2}$ ]]; then
    echo -e "${RED}[ALERT] 500 error: $method $endpoint -> HTTP $status${NC}" >&2
    echo "ALERT,$(date -u +"%Y-%m-%dT%H:%M:%SZ"),500_ERROR,$method $endpoint,$status" >> "$LOG_FILE"
  fi

  if [[ "$status" == "000" ]]; then
    echo -e "${RED}[ALERT] Connection refused: $method $endpoint${NC}" >&2
    echo "ALERT,$(date -u +"%Y-%m-%dT%H:%M:%SZ"),CONNECTION_REFUSED,$method $endpoint,$status" >> "$LOG_FILE"
  fi

  if (( ms > 5000 )); then
    echo -e "${YELLOW}[ALERT] Slow request (${ms}ms): $method $endpoint -> HTTP $status${NC}" >&2
    echo "ALERT,$(date -u +"%Y-%m-%dT%H:%M:%SZ"),SLOW_REQUEST,$method $endpoint,${ms}ms" >> "$LOG_FILE"
  fi
}

# Execute a request and track stats
soak_request() {
  local method="$1"
  local path="$2"
  local body="${3:-}"
  local token="${4:-}"
  local idempotency_key="${5:-}"

  make_request "$method" "$path" "$body" "$token" "$idempotency_key"
  update_stats "$path" "$method" "$HTTP_STATUS" "$HTTP_LATENCY"
}

print_iteration_summary() {
  local now
  now=$(date +%s)
  local elapsed=$((now - START_TIME))
  local hours=$((elapsed / 3600))
  local minutes=$(( (elapsed % 3600) / 60 ))
  local seconds=$((elapsed % 60))

  local avg_latency=0
  if (( TOTAL_REQUESTS > 0 )); then
    avg_latency=$((LATENCY_SUM / TOTAL_REQUESTS))
  fi

  local success_rate=0
  if (( TOTAL_REQUESTS > 0 )); then
    success_rate=$(python3 -c "print(f'{($SUCCESS_COUNT / $TOTAL_REQUESTS) * 100:.1f}')" 2>/dev/null || echo "0")
  fi

  echo ""
  echo -e "${BOLD}==============================${NC}"
  echo -e "${BOLD}  Soak Test Summary (iteration $ITERATION)${NC}"
  echo -e "${BOLD}==============================${NC}"
  echo -e "  Uptime:          ${hours}h ${minutes}m ${seconds}s"
  echo -e "  Total requests:  $TOTAL_REQUESTS"
  echo -e "  ${GREEN}Success:         $SUCCESS_COUNT${NC}"
  echo -e "  ${RED}Errors:          $ERROR_COUNT${NC}"
  echo -e "  Success rate:    ${success_rate}%"
  echo -e "  Avg latency:     ${avg_latency}ms"
  echo -e "  Min latency:     ${LATENCY_MIN}ms"
  echo -e "  Max latency:     ${LATENCY_MAX}ms"
  echo -e "  Conversations:   ${#CONVERSATION_IDS[@]}"
  echo -e "  Agents:          ${#AGENT_IDS[@]}"
  echo -e "  Feed items:      ${#FEED_ITEM_IDS[@]}"

  if [[ -n "$ERROR_STATUS_LOG" ]]; then
    echo -e "  ${RED}Error status codes:${NC}"
    echo -e "$ERROR_STATUS_LOG" | sort | uniq -c | sort -rn | while read count code; do
      [[ -n "$code" ]] && echo -e "    HTTP $code: $count"
    done
  fi

  echo -e "${BOLD}==============================${NC}"
  echo ""
}

# --- Operations ---

op_health_check() {
  soak_request GET "/health"
}

op_login_random_user() {
  local idx
  idx=$(random_user_index)
  local token="${USER_TOKENS[$idx]}"
  soak_request GET "/users/me" "" "$token"
}

op_create_conversation() {
  local token
  token=$(random_token)
  local title="Soak Test Conv $(date +%s)_${RANDOM}"
  soak_request POST "/conversations" "{\"title\":\"$title\",\"type\":\"dm\"}" "$token"
  if [[ "$HTTP_STATUS" =~ ^2[0-9]{2}$ ]]; then
    local conv_id
    conv_id=$(json_nested "conversation.id")
    if [[ -z "$conv_id" ]]; then
      conv_id=$(json_field "id")
    fi
    if [[ -n "$conv_id" ]]; then
      CONVERSATION_IDS+=("$conv_id")
    fi
  fi
}

op_send_message() {
  if (( ${#CONVERSATION_IDS[@]} == 0 )); then
    return
  fi
  local idx
  idx=$(random_int ${#CONVERSATION_IDS[@]})
  local conv_id="${CONVERSATION_IDS[$idx]}"
  local token
  token=$(random_token)
  local idem_key
  idem_key=$(gen_uuid)
  soak_request POST "/conversations/${conv_id}/messages" \
    "{\"content\":{\"text\":\"Soak test message at $(date -u +"%H:%M:%S")\"},\"type\":\"text\"}" \
    "$token" "$idem_key"
}

op_list_conversations() {
  local token
  token=$(random_token)
  soak_request GET "/conversations" "" "$token"
}

op_list_messages() {
  if (( ${#CONVERSATION_IDS[@]} == 0 )); then
    return
  fi
  local idx
  idx=$(random_int ${#CONVERSATION_IDS[@]})
  local conv_id="${CONVERSATION_IDS[$idx]}"
  local token
  token=$(random_token)
  soak_request GET "/conversations/${conv_id}/messages" "" "$token"
}

op_create_agent() {
  local token
  token=$(random_token)
  local name="SoakAgent_$(date +%s)_${RANDOM}"
  local slug="soak-agent-$(date +%s)-${RANDOM}"
  soak_request POST "/agents" \
    "{\"name\":\"$name\",\"slug\":\"$slug\",\"system_prompt\":\"Soak test agent.\",\"model\":\"claude-sonnet-4-6\"}" \
    "$token"
  if [[ "$HTTP_STATUS" =~ ^2[0-9]{2}$ ]]; then
    local agent_id
    agent_id=$(json_nested "agent.id")
    if [[ -z "$agent_id" ]]; then
      agent_id=$(json_field "id")
    fi
    if [[ -n "$agent_id" ]]; then
      AGENT_IDS+=("$agent_id")
    fi
  fi
}

op_submit_feed_item() {
  local token
  token=$(random_token)
  local idem_key
  idem_key=$(gen_uuid)
  soak_request POST "/feed" \
    "{\"content\":\"Soak test feed post at $(date -u +"%Y-%m-%dT%H:%M:%SZ")\",\"type\":\"text\"}" \
    "$token" "$idem_key"
  if [[ "$HTTP_STATUS" =~ ^[25][0-9]{2}$ ]]; then
    local feed_id
    feed_id=$(json_nested "data.id")
    if [[ -z "$feed_id" ]]; then
      feed_id=$(json_field "id")
    fi
    if [[ -n "$feed_id" ]]; then
      FEED_ITEM_IDS+=("$feed_id")
    fi
  fi
}

op_like_feed_item() {
  if (( ${#FEED_ITEM_IDS[@]} == 0 )); then
    return
  fi
  local idx
  idx=$(random_int ${#FEED_ITEM_IDS[@]})
  local feed_id="${FEED_ITEM_IDS[$idx]}"
  local token
  token=$(random_token)
  soak_request POST "/feed/${feed_id}/like" "" "$token"
}

# --- Main loop ---

echo -e "${BOLD}============================================${NC}"
echo -e "${BOLD}  WaiAgents Soak Test${NC}"
echo -e "${BOLD}============================================${NC}"
echo -e "  Duration:    ${SOAK_DURATION_HOURS} hours"
echo -e "  Interval:    ${SOAK_INTERVAL_SECONDS}s"
echo -e "  Log file:    ${LOG_FILE}"
echo -e "  Started at:  $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
echo -e "  Users:       ${USER_NAMES[*]}"
echo -e "${BOLD}============================================${NC}"
echo ""

# Initialize log file with CSV header
echo "timestamp,endpoint,status_code,latency_ms" > "$LOG_FILE"

while (( $(date +%s) < END_TIME )); do
  ITERATION=$((ITERATION + 1))

  echo -e "${BLUE}[$(date +"%H:%M:%S")] Iteration $ITERATION${NC}"

  # Refresh tokens every 10 minutes to avoid expiry
  NOW=$(date +%s)
  if (( NOW - LAST_REFRESH > TOKEN_REFRESH_INTERVAL )); then
    refresh_all_tokens
    LAST_REFRESH=$NOW
  fi

  # Health check — every iteration
  op_health_check

  # Verify token — every iteration (acts as login check)
  op_login_random_user

  # List conversations — every iteration
  op_list_conversations

  # Send message to random conversation — every iteration if conversations exist
  op_send_message

  # List messages in random conversation — if conversations exist
  op_list_messages

  # Create conversation — 10% chance
  if (( $(random_int 100) < 10 )); then
    op_create_conversation
  fi

  # Create agent — 5% chance
  if (( $(random_int 100) < 5 )); then
    op_create_agent
  fi

  # Submit feed item — 2% chance
  if (( $(random_int 100) < 2 )); then
    op_submit_feed_item
  fi

  # Like random feed item — 10% chance
  if (( $(random_int 100) < 10 )); then
    op_like_feed_item
  fi

  # Print summary every 100 iterations
  if (( ITERATION % 100 == 0 )); then
    print_iteration_summary
  fi

  # Sleep until next iteration
  sleep "$SOAK_INTERVAL_SECONDS"
done

# --- Final summary ---

echo ""
echo -e "${BOLD}============================================${NC}"
echo -e "${BOLD}  Soak Test Complete${NC}"
echo -e "${BOLD}============================================${NC}"
echo -e "  Finished at: $(date -u +"%Y-%m-%dT%H:%M:%SZ")"

print_iteration_summary

echo -e "  Log file:    ${LOG_FILE}"
echo -e "${BOLD}============================================${NC}"

# Exit with error if any 500s occurred
if echo -e "$ERROR_STATUS_LOG" | grep -q "^500$\|^502$\|^503$"; then
  exit 1
fi
exit 0
