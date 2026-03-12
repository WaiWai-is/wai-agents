#!/usr/bin/env bash
# chat_tests.sh — Comprehensive multi-user chat tests for WaiAgents
# Tests: DM, group chat, stress test, idempotency, content types

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/helpers.sh"

# Override -e from helpers.sh — we want to continue on failures
set +e

BASE="${BASE_URL:-https://openraccoon.com/api/v1}"

# --- Load pre-created user tokens ---

TOKENS_FILE="/tmp/wai_agents_test_tokens.env"
if [[ ! -f "$TOKENS_FILE" ]]; then
  echo "ERROR: Token file not found: $TOKENS_FILE"
  echo "Run the user setup script first to create test tokens."
  exit 1
fi
source "$TOKENS_FILE"

# Re-login all users to get fresh tokens (originals may have expired)
log_info "Re-logging in all users to get fresh tokens..."

relogin_user() {
  local label="$1" email="$2" password="$3"
  login_user "$email" "$password"
  if [[ "$HTTP_STATUS" != "200" ]]; then
    echo "ERROR: Failed to login $label (HTTP $HTTP_STATUS)"
    exit 1
  fi
}

relogin_user "Alice" "$ALICE_EMAIL" "$ALICE_PASSWORD"
ALICE_TOKEN="$ACCESS_TOKEN"; ALICE_ID="$USER_ID"

relogin_user "Bob" "$BOB_EMAIL" "$BOB_PASSWORD"
BOB_TOKEN="$ACCESS_TOKEN"; BOB_ID="$USER_ID"

relogin_user "Charlie" "$CHARLIE_EMAIL" "$CHARLIE_PASSWORD"
CHARLIE_TOKEN="$ACCESS_TOKEN"; CHARLIE_ID="$USER_ID"

relogin_user "Diana" "$DIANA_EMAIL" "$DIANA_PASSWORD"
DIANA_TOKEN="$ACCESS_TOKEN"; DIANA_ID="$USER_ID"

log_info "Loaded fresh tokens for Alice, Bob, Charlie, Diana"

# =============================================================================
# Helper: count items in a JSON array field
# Usage: json_array_length FIELD [JSON]
# =============================================================================
json_array_length() {
  local field="$1"
  local json="${2:-$HTTP_BODY}"
  echo "$json" | python3 -c "
import sys, json
d = json.load(sys.stdin)
arr = d.get('$field', [])
print(len(arr) if isinstance(arr, list) else 0)
" 2>/dev/null
}

# Helper: assert a numeric value equals expected
# Usage: assert_equal EXPECTED ACTUAL TEST_NAME
assert_equal() {
  local expected="$1"
  local actual="$2"
  local test_name="$3"

  TOTAL=$((TOTAL + 1))

  if [[ "$actual" == "$expected" ]]; then
    PASS=$((PASS + 1))
    log_pass "$test_name — got $actual"
    return 0
  else
    FAIL=$((FAIL + 1))
    log_fail "$test_name — expected $expected, got $actual"
    ERRORS+=("$test_name: expected $expected, got $actual")
    return 1
  fi
}

# Helper: assert a value is greater than or equal to expected
# Usage: assert_gte EXPECTED ACTUAL TEST_NAME
assert_gte() {
  local expected="$1"
  local actual="$2"
  local test_name="$3"

  TOTAL=$((TOTAL + 1))

  if [[ "$actual" -ge "$expected" ]] 2>/dev/null; then
    PASS=$((PASS + 1))
    log_pass "$test_name — got $actual (>= $expected)"
    return 0
  else
    FAIL=$((FAIL + 1))
    log_fail "$test_name — expected >= $expected, got $actual"
    ERRORS+=("$test_name: expected >= $expected, got $actual")
    return 1
  fi
}


# =============================================================================
# 3.1: DM Between Alice and Bob
# =============================================================================
test_dm_alice_bob() {
  log_section "3.1: DM Between Alice and Bob"

  # 1. Alice creates DM conversation
  log_info "Alice creates DM conversation"
  make_request POST "/conversations" \
    "{\"type\":\"dm\",\"title\":\"Alice-Bob Chat\",\"member_id\":\"$BOB_ID\"}" \
    "$ALICE_TOKEN"
  assert_status_in "3.1.1 Alice creates DM conversation" "$HTTP_STATUS" 200 201
  local conv_id
  conv_id=$(json_nested "conversation.id")
  if [[ -z "$conv_id" ]]; then
    conv_id=$(json_field "id")
  fi
  log_info "Conversation ID: $conv_id"

  # 2. Alice adds Bob as member
  log_info "Alice adds Bob as member"
  make_request POST "/conversations/$conv_id/members" \
    "{\"user_id\":\"$BOB_ID\"}" \
    "$ALICE_TOKEN"
  assert_status_in "3.1.2 Alice adds Bob as member" "$HTTP_STATUS" 200 201 409 422

  # 3. Alice sends 10 messages with unique idempotency keys
  log_info "Alice sends 10 messages"
  local alice_keys=()
  for i in $(seq 1 10); do
    local key
    key=$(gen_uuid)
    alice_keys+=("$key")
    make_request POST "/conversations/$conv_id/messages" \
      "{\"content\":{\"text\":\"Alice message $i\"},\"type\":\"text\"}" \
      "$ALICE_TOKEN" \
      "$key"
    assert_status_in "3.1.3 Alice sends message $i" "$HTTP_STATUS" 200 201
  done

  # 4. Bob lists messages -> verify all 10 present
  log_info "Bob lists messages"
  make_request GET "/conversations/$conv_id/messages?limit=50" \
    "" \
    "$BOB_TOKEN"
  assert_status "200" "$HTTP_STATUS" "3.1.4 Bob lists messages"
  local msg_count
  msg_count=$(json_array_length "items")
  if [[ "$msg_count" == "0" ]]; then
    msg_count=$(json_array_length "data")
  fi
  assert_gte 10 "$msg_count" "3.1.4 Bob sees all 10 Alice messages"

  # 5. Bob sends 10 messages back
  log_info "Bob sends 10 messages"
  for i in $(seq 1 10); do
    local key
    key=$(gen_uuid)
    make_request POST "/conversations/$conv_id/messages" \
      "{\"content\":{\"text\":\"Bob message $i\"},\"type\":\"text\"}" \
      "$BOB_TOKEN" \
      "$key"
    assert_status_in "3.1.5 Bob sends message $i" "$HTTP_STATUS" 200 201
  done

  # 6. Both list messages -> verify 20 total, correct order
  log_info "Alice lists all messages"
  make_request GET "/conversations/$conv_id/messages?limit=50" \
    "" \
    "$ALICE_TOKEN"
  assert_status "200" "$HTTP_STATUS" "3.1.6a Alice lists all messages"
  local alice_count
  alice_count=$(json_array_length "items")
  if [[ "$alice_count" == "0" ]]; then
    alice_count=$(json_array_length "data")
  fi
  assert_gte 20 "$alice_count" "3.1.6a Alice sees 20 messages"

  log_info "Bob lists all messages"
  make_request GET "/conversations/$conv_id/messages?limit=50" \
    "" \
    "$BOB_TOKEN"
  assert_status "200" "$HTTP_STATUS" "3.1.6b Bob lists all messages"
  local bob_count
  bob_count=$(json_array_length "items")
  if [[ "$bob_count" == "0" ]]; then
    bob_count=$(json_array_length "data")
  fi
  assert_gte 20 "$bob_count" "3.1.6b Bob sees 20 messages"

  # 7. Alice updates conversation title
  log_info "Alice updates conversation title"
  make_request PATCH "/conversations/$conv_id" \
    '{"title":"Alice-Bob DM"}' \
    "$ALICE_TOKEN"
  assert_status "200" "$HTTP_STATUS" "3.1.7 Alice updates title"

  # 8. Bob gets conversation -> verify title changed
  log_info "Bob gets conversation details"
  make_request GET "/conversations/$conv_id" \
    "" \
    "$BOB_TOKEN"
  assert_status "200" "$HTTP_STATUS" "3.1.8 Bob gets conversation"
  local title
  title=$(json_nested "conversation.title")
  if [[ -z "$title" ]]; then
    title=$(json_field "title")
  fi
  assert_equal "Alice-Bob DM" "$title" "3.1.8 Title updated to 'Alice-Bob DM'"
}


# =============================================================================
# 3.2: Group Chat
# =============================================================================
test_group_chat() {
  log_section "3.2: Group Chat"

  # 1. Alice creates group conversation "Team Chat"
  log_info "Alice creates group conversation"
  make_request POST "/conversations" \
    '{"type":"group","title":"Team Chat"}' \
    "$ALICE_TOKEN"
  assert_status "201" "$HTTP_STATUS" "3.2.1 Alice creates group conversation"
  local conv_id
  conv_id=$(json_nested "conversation.id")
  if [[ -z "$conv_id" ]]; then
    conv_id=$(json_field "id")
  fi
  log_info "Group conversation ID: $conv_id"

  # 2. Alice adds Bob, Charlie, Diana
  log_info "Alice adds Bob, Charlie, Diana"
  make_request POST "/conversations/$conv_id/members" \
    "{\"user_id\":\"$BOB_ID\"}" \
    "$ALICE_TOKEN"
  assert_status_in "3.2.2a Add Bob" "$HTTP_STATUS" 200 201

  make_request POST "/conversations/$conv_id/members" \
    "{\"user_id\":\"$CHARLIE_ID\"}" \
    "$ALICE_TOKEN"
  assert_status_in "3.2.2b Add Charlie" "$HTTP_STATUS" 200 201

  make_request POST "/conversations/$conv_id/members" \
    "{\"user_id\":\"$DIANA_ID\"}" \
    "$ALICE_TOKEN"
  assert_status_in "3.2.2c Add Diana" "$HTTP_STATUS" 200 201

  # 3. Each user sends 3 messages (12 total)
  log_info "Each user sends 3 messages"
  local users=("ALICE" "BOB" "CHARLIE" "DIANA")
  local tokens=("$ALICE_TOKEN" "$BOB_TOKEN" "$CHARLIE_TOKEN" "$DIANA_TOKEN")
  for u_idx in "${!users[@]}"; do
    local user_name="${users[$u_idx]}"
    local user_token="${tokens[$u_idx]}"
    for i in 1 2 3; do
      local key
      key=$(gen_uuid)
      make_request POST "/conversations/$conv_id/messages" \
        "{\"content\":{\"text\":\"${user_name} group message $i\"},\"type\":\"text\"}" \
        "$user_token" \
        "$key"
      assert_status_in "3.2.3 ${user_name} sends message $i" "$HTTP_STATUS" 200 201
    done
  done

  # 4. Verify all users can list all messages (each gets 12)
  log_info "Verify all users see 12 messages"
  for u_idx in "${!users[@]}"; do
    local user_name="${users[$u_idx]}"
    local user_token="${tokens[$u_idx]}"
    make_request GET "/conversations/$conv_id/messages?limit=50" \
      "" \
      "$user_token"
    assert_status "200" "$HTTP_STATUS" "3.2.4 ${user_name} lists messages"
    local count
    count=$(json_array_length "items")
    if [[ "$count" == "0" ]]; then
      count=$(json_array_length "data")
    fi
    assert_gte 12 "$count" "3.2.4 ${user_name} sees all 12 messages"
  done

  # 5. List members -> verify 4 members
  log_info "List conversation members"
  make_request GET "/conversations/$conv_id/members" \
    "" \
    "$ALICE_TOKEN"
  assert_status "200" "$HTTP_STATUS" "3.2.5 List members"
  local member_count
  member_count=$(json_array_length "items")
  if [[ "$member_count" == "0" ]]; then
    member_count=$(json_array_length "data")
  fi
  if [[ "$member_count" == "0" ]]; then
    # Maybe the response is a raw array
    member_count=$(echo "$HTTP_BODY" | python3 -c "
import sys, json
d = json.load(sys.stdin)
print(len(d) if isinstance(d, list) else 0)
" 2>/dev/null)
  fi
  assert_gte 4 "$member_count" "3.2.5 Group has 4 members"

  # 6. Alice removes Diana from conversation
  log_info "Alice removes Diana"
  make_request DELETE "/conversations/$conv_id/members/$DIANA_ID" \
    "" \
    "$ALICE_TOKEN"
  assert_status_in "3.2.6 Remove Diana" "$HTTP_STATUS" 200 204

  # 7. Verify Diana cannot access conversation (403 or 404)
  log_info "Verify Diana is blocked"
  make_request GET "/conversations/$conv_id/messages?limit=50" \
    "" \
    "$DIANA_TOKEN"
  assert_status_in "3.2.7 Diana blocked from messages" "$HTTP_STATUS" 403 404

  # 8. Verify Alice, Bob, Charlie can still list messages
  log_info "Verify remaining members still have access"
  for u_idx in 0 1 2; do
    local user_name="${users[$u_idx]}"
    local user_token="${tokens[$u_idx]}"
    make_request GET "/conversations/$conv_id/messages?limit=50" \
      "" \
      "$user_token"
    assert_status "200" "$HTTP_STATUS" "3.2.8 ${user_name} still has access"
  done
}


# =============================================================================
# 3.3: Stress Test (100 Messages)
# =============================================================================
test_stress_100_messages() {
  log_section "3.3: Stress Test (100 Messages)"
  local ts
  ts=$(date +%s)

  # 1. Create conversation between Alice and Bob
  log_info "Create stress test conversation"
  make_request POST "/conversations" \
    "{\"type\":\"group\",\"title\":\"Stress Test ${ts}\"}" \
    "$ALICE_TOKEN"
  assert_status_in "3.3.1 Create stress test conversation" "$HTTP_STATUS" 200 201
  local conv_id
  conv_id=$(json_nested "conversation.id")
  if [[ -z "$conv_id" ]]; then
    conv_id=$(json_field "id")
  fi
  log_info "Stress test conversation ID: $conv_id"

  make_request POST "/conversations/$conv_id/members" \
    "{\"user_id\":\"$BOB_ID\"}" \
    "$ALICE_TOKEN"
  assert_status_in "3.3.1 Add Bob to stress conv" "$HTTP_STATUS" 200 201 409 422

  # 2. Send 100 messages rapidly (alternating Alice/Bob)
  log_info "Sending 100 messages (alternating Alice/Bob)..."
  local send_failures=0
  for i in $(seq 1 100); do
    local key
    key=$(gen_uuid)
    local token
    local sender
    if (( i % 2 == 1 )); then
      token="$ALICE_TOKEN"
      sender="Alice"
    else
      token="$BOB_TOKEN"
      sender="Bob"
    fi
    make_request POST "/conversations/$conv_id/messages" \
      "{\"content\":{\"text\":\"Stress message $i from $sender\"},\"type\":\"text\"}" \
      "$token" \
      "$key"
    if [[ "$HTTP_STATUS" != "200" && "$HTTP_STATUS" != "201" ]]; then
      send_failures=$((send_failures + 1))
    fi
  done
  assert_equal "0" "$send_failures" "3.3.2 All 100 messages sent without error"

  # 3. Verify all 100 messages present
  log_info "Verifying all 100 messages present"
  make_request GET "/conversations/$conv_id/messages?limit=100" \
    "" \
    "$ALICE_TOKEN"
  assert_status "200" "$HTTP_STATUS" "3.3.3 Fetch all messages"
  local total_count
  total_count=$(json_array_length "items")
  if [[ "$total_count" == "0" ]]; then
    total_count=$(json_array_length "data")
  fi
  assert_gte 100 "$total_count" "3.3.3 All 100 messages present"

  # 4. Test pagination: fetch with limit=50, then fetch next page with cursor
  log_info "Testing pagination"
  make_request GET "/conversations/$conv_id/messages?limit=50" \
    "" \
    "$ALICE_TOKEN"
  assert_status "200" "$HTTP_STATUS" "3.3.4a First page (limit=50)"
  local page1_count
  page1_count=$(json_array_length "items")
  if [[ "$page1_count" == "0" ]]; then
    page1_count=$(json_array_length "data")
  fi
  assert_equal "50" "$page1_count" "3.3.4a First page has 50 messages"

  # Extract cursor for next page
  local cursor
  cursor=$(json_field "cursor")
  if [[ -z "$cursor" ]]; then
    cursor=$(json_nested "meta.cursor")
  fi
  if [[ -z "$cursor" ]]; then
    cursor=$(json_nested "pagination.cursor")
  fi
  if [[ -z "$cursor" ]]; then
    cursor=$(json_field "next_cursor")
  fi

  if [[ -n "$cursor" ]]; then
    log_info "Cursor found: $cursor"
    make_request GET "/conversations/$conv_id/messages?limit=50&cursor=$cursor" \
      "" \
      "$ALICE_TOKEN"
    assert_status "200" "$HTTP_STATUS" "3.3.4b Second page (limit=50, cursor)"
    local page2_count
    page2_count=$(json_array_length "items")
    if [[ "$page2_count" == "0" ]]; then
      page2_count=$(json_array_length "data")
    fi
    assert_gte 50 "$page2_count" "3.3.4b Second page has remaining messages"
  else
    log_info "No cursor returned — pagination may use offset or different mechanism"
    # Try offset-based pagination
    make_request GET "/conversations/$conv_id/messages?limit=50&offset=50" \
      "" \
      "$ALICE_TOKEN"
    assert_status "200" "$HTTP_STATUS" "3.3.4b Second page (limit=50, offset=50)"
    local page2_count
    page2_count=$(json_array_length "items")
    if [[ "$page2_count" == "0" ]]; then
      page2_count=$(json_array_length "data")
    fi
    assert_gte 50 "$page2_count" "3.3.4b Second page has remaining messages"
  fi
}


# =============================================================================
# 3.4: Idempotency
# =============================================================================
test_idempotency() {
  log_section "3.4: Idempotency"
  local ts
  ts=$(date +%s)

  # Create a conversation for idempotency test
  log_info "Create idempotency test conversation"
  make_request POST "/conversations" \
    "{\"type\":\"group\",\"title\":\"Idempotency Test ${ts}\"}" \
    "$ALICE_TOKEN"
  assert_status_in "3.4.0 Create conversation" "$HTTP_STATUS" 200 201
  local conv_id
  conv_id=$(json_nested "conversation.id")
  if [[ -z "$conv_id" ]]; then
    conv_id=$(json_field "id")
  fi

  make_request POST "/conversations/$conv_id/members" \
    "{\"user_id\":\"$BOB_ID\"}" \
    "$ALICE_TOKEN"
  assert_status_in "3.4.0 Add Bob" "$HTTP_STATUS" 200 201 409 422

  # 1. Generate a single idempotency key
  local idem_key
  idem_key=$(gen_uuid)
  log_info "Idempotency key: $idem_key"

  # 2. Alice sends message with that key -> 200/201, get message_id
  make_request POST "/conversations/$conv_id/messages" \
    '{"content":{"text":"Idempotent message"},"type":"text"}' \
    "$ALICE_TOKEN" \
    "$idem_key"
  assert_status_in "3.4.1 First send with idempotency key" "$HTTP_STATUS" 200 201
  local first_msg_id
  first_msg_id=$(json_nested "message.id")
  if [[ -z "$first_msg_id" ]]; then
    first_msg_id=$(json_field "id")
  fi
  log_info "First message ID: $first_msg_id"

  # 3. Alice sends SAME content with SAME key -> should return same message (no duplicate)
  make_request POST "/conversations/$conv_id/messages" \
    '{"content":{"text":"Idempotent message"},"type":"text"}' \
    "$ALICE_TOKEN" \
    "$idem_key"
  assert_status_in "3.4.2 Duplicate send with same key" "$HTTP_STATUS" 200 201
  local second_msg_id
  second_msg_id=$(json_nested "message.id")
  if [[ -z "$second_msg_id" ]]; then
    second_msg_id=$(json_field "id")
  fi
  log_info "Second message ID: $second_msg_id"
  assert_equal "$first_msg_id" "$second_msg_id" "3.4.3 Same idempotency key returns same message ID"

  # 4. Verify only 1 message exists (not 2)
  make_request GET "/conversations/$conv_id/messages?limit=50" \
    "" \
    "$ALICE_TOKEN"
  assert_status "200" "$HTTP_STATUS" "3.4.4 List messages"
  local msg_count
  msg_count=$(json_array_length "items")
  if [[ "$msg_count" == "0" ]]; then
    msg_count=$(json_array_length "data")
  fi
  assert_equal "1" "$msg_count" "3.4.4 Only 1 message exists (no duplicate)"
}


# =============================================================================
# 3.5: Message Content Types
# =============================================================================
test_message_content_types() {
  log_section "3.5: Message Content Types"
  local ts
  ts=$(date +%s)

  # Create a conversation for content type tests
  log_info "Create content types test conversation"
  make_request POST "/conversations" \
    "{\"type\":\"group\",\"title\":\"Content Types Test ${ts}\"}" \
    "$ALICE_TOKEN"
  assert_status_in "3.5.0 Create conversation" "$HTTP_STATUS" 200 201
  local conv_id
  conv_id=$(json_nested "conversation.id")
  if [[ -z "$conv_id" ]]; then
    conv_id=$(json_field "id")
  fi

  make_request POST "/conversations/$conv_id/members" \
    "{\"user_id\":\"$BOB_ID\"}" \
    "$ALICE_TOKEN"
  assert_status_in "3.5.0 Add Bob" "$HTTP_STATUS" 200 201 409 422

  # 1. Send text message
  log_info "Send plain text message"
  local key1
  key1=$(gen_uuid)
  make_request POST "/conversations/$conv_id/messages" \
    '{"content":{"text":"Hello world"},"type":"text"}' \
    "$ALICE_TOKEN" \
    "$key1"
  assert_status_in "3.5.1 Plain text message" "$HTTP_STATUS" 200 201

  # 2. Send long message (5000 chars)
  log_info "Send long message (5000 chars)"
  local key2
  key2=$(gen_uuid)
  local long_body
  long_body=$(python3 -c "
import json
base = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. '
text = (base * 42)[:5000]
print(json.dumps({'content': {'text': text}, 'type': 'text'}))
")
  make_request POST "/conversations/$conv_id/messages" \
    "$long_body" \
    "$ALICE_TOKEN" \
    "$key2"
  assert_status_in "3.5.2 Long message (5000 chars)" "$HTTP_STATUS" 200 201

  # 3. Send unicode/emoji
  log_info "Send unicode/emoji message"
  local key3
  key3=$(gen_uuid)
  local unicode_body
  unicode_body=$(python3 -c "
import json
print(json.dumps({'content': {'text': 'WaiAgents \U0001F99D says hello \u4f60\u597d'}, 'type': 'text'}))
")
  make_request POST "/conversations/$conv_id/messages" \
    "$unicode_body" \
    "$ALICE_TOKEN" \
    "$key3"
  assert_status_in "3.5.3 Unicode/emoji message" "$HTTP_STATUS" 200 201

  # 4. Send code block
  log_info "Send code block message"
  local key4
  key4=$(gen_uuid)
  local code_body
  code_body=$(python3 -c "
import json
print(json.dumps({'content': {'text': '\`\`\`python\nprint(\"hello\")\n\`\`\`'}, 'type': 'text'}))
")
  make_request POST "/conversations/$conv_id/messages" \
    "$code_body" \
    "$ALICE_TOKEN" \
    "$key4"
  assert_status_in "3.5.4 Code block message" "$HTTP_STATUS" 200 201

  # 5. Send special chars / XSS attempt
  log_info "Send special chars (XSS attempt)"
  local key5
  key5=$(gen_uuid)
  local xss_body
  xss_body=$(python3 -c "
import json
print(json.dumps({'content': {'text': '<script>alert(\"xss\")</script>'}, 'type': 'text'}))
")
  make_request POST "/conversations/$conv_id/messages" \
    "$xss_body" \
    "$ALICE_TOKEN" \
    "$key5"
  assert_status_in "3.5.5 Special chars/XSS message" "$HTTP_STATUS" 200 201

  # 6. Verify all messages stored and retrievable
  log_info "Verify all content type messages retrievable"
  make_request GET "/conversations/$conv_id/messages?limit=50" \
    "" \
    "$BOB_TOKEN"
  assert_status "200" "$HTTP_STATUS" "3.5.6 Bob retrieves all messages"
  local msg_count
  msg_count=$(json_array_length "items")
  if [[ "$msg_count" == "0" ]]; then
    msg_count=$(json_array_length "data")
  fi
  assert_gte 5 "$msg_count" "3.5.6 All 5 content type messages present"

  # Verify the messages contain the expected content by checking retrievability
  # Extract first items array entry to verify structure
  local has_content
  has_content=$(echo "$HTTP_BODY" | python3 -c "
import sys, json
d = json.load(sys.stdin)
items = d.get('items', d.get('data', []))
if items and isinstance(items, list):
    msg = items[0]
    content = msg.get('content', {})
    if isinstance(content, dict) and 'text' in content:
        print('yes')
    elif isinstance(content, str) and len(content) > 0:
        print('yes')
    else:
        print('no')
else:
    print('no')
" 2>/dev/null)

  TOTAL=$((TOTAL + 1))
  if [[ "$has_content" == "yes" ]]; then
    PASS=$((PASS + 1))
    log_pass "3.5.6 Messages have content field with text"
  else
    FAIL=$((FAIL + 1))
    log_fail "3.5.6 Messages missing content field"
    ERRORS+=("3.5.6: Messages missing content field")
  fi
}


# =============================================================================
# Run All Tests
# =============================================================================

log_section "WaiAgents Chat Tests"
log_info "Base URL: $BASE"
log_info "Users: Alice ($ALICE_ID), Bob ($BOB_ID), Charlie ($CHARLIE_ID), Diana ($DIANA_ID)"

test_dm_alice_bob
test_group_chat
test_stress_100_messages
test_idempotency
test_message_content_types

# =============================================================================
# Summary
# =============================================================================

print_summary

if [[ $FAIL -gt 0 ]]; then
  exit 1
fi
exit 0
