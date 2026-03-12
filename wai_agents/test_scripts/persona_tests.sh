#!/usr/bin/env bash
# persona_tests.sh — E2E tests for all 10 seeded personas
#
# Tests: login, conversations, marketplace, feed, messaging,
#        agent conversations, feed likes, and logout.
#
# NOTE: Auth endpoints are rate-limited to 5 req/min per IP.
#       This script batches auth requests with waits between batches.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/helpers.sh"

# Persona definitions
USERNAMES=( alex_dev maya_writer sam_designer jordan_student taylor_data riley_pm casey_research morgan_maker avery_teacher quinn_admin )
EMAILS=(    alex@openraccoon.com maya@openraccoon.com sam@openraccoon.com jordan@openraccoon.com taylor@openraccoon.com riley@openraccoon.com casey@openraccoon.com morgan@openraccoon.com avery@openraccoon.com quinn@openraccoon.com )
PASSWORD="TestPass123!"

# Storage for tokens (parallel arrays indexed same as USERNAMES)
PERSONA_TOKENS=()
PERSONA_UIDS=()

# Helper: find index of a username
idx_of() {
  local target="$1"
  for i in "${!USERNAMES[@]}"; do
    if [[ "${USERNAMES[$i]}" == "$target" ]]; then
      echo "$i"
      return 0
    fi
  done
  echo "-1"
}

# Helper: get token by username
token_for() {
  local idx
  idx=$(idx_of "$1")
  if [[ "$idx" -ge 0 ]]; then
    echo "${PERSONA_TOKENS[$idx]:-}"
  fi
}

# ─── Phase 1: Login All Personas ───

log_section "Phase 1: Login All 10 Personas"

login_count=0
for i in "${!USERNAMES[@]}"; do
  username="${USERNAMES[$i]}"
  email="${EMAILS[$i]}"

  # Rate limit: wait after every 4 logins (stay under 5/min)
  if (( login_count > 0 && login_count % 4 == 0 )); then
    log_info "Rate limit pause (65s)..."
    sleep 65
  fi

  login_user "$email" "$PASSWORD"
  assert_status "200" "$HTTP_STATUS" "Login $username"

  if [[ "$HTTP_STATUS" == "200" ]]; then
    PERSONA_TOKENS[$i]="$ACCESS_TOKEN"
    PERSONA_UIDS[$i]="$USER_ID"
  else
    PERSONA_TOKENS[$i]=""
    PERSONA_UIDS[$i]=""
  fi

  login_count=$((login_count + 1))
done

# ─── Phase 2: Verify Conversations ───

log_section "Phase 2: Verify Conversations"

# Users with seeded conversations
USERS_WITH_CONVOS=( alex_dev maya_writer jordan_student avery_teacher morgan_maker riley_pm )

for username in "${USERS_WITH_CONVOS[@]}"; do
  token=$(token_for "$username")
  if [[ -z "$token" ]]; then
    log_fail "Conversations for $username — no token (login failed)"
    FAIL=$((FAIL + 1))
    TOTAL=$((TOTAL + 1))
    continue
  fi

  make_request GET "/conversations" "" "$token"
  assert_status "200" "$HTTP_STATUS" "List conversations for $username"

  if [[ "$HTTP_STATUS" == "200" ]]; then
    conv_count=$(echo "$HTTP_BODY" | python3 -c "
import sys, json
d = json.load(sys.stdin)
items = d.get('items', d.get('conversations', []))
print(len(items))
" 2>/dev/null)

    TOTAL=$((TOTAL + 1))
    if [[ "${conv_count:-0}" -gt 0 ]]; then
      PASS=$((PASS + 1))
      log_pass "$username has $conv_count conversation(s)"
    else
      FAIL=$((FAIL + 1))
      log_fail "$username has 0 conversations (expected > 0)"
      ERRORS+=("$username: expected conversations, got 0")
    fi
  fi
done

# ─── Phase 3: Verify Marketplace (8 Public Agents) ───

log_section "Phase 3: Verify Marketplace"

MP_TOKEN=$(token_for "jordan_student")
if [[ -n "$MP_TOKEN" ]]; then
  make_request GET "/marketplace" "" "$MP_TOKEN"
  assert_status "200" "$HTTP_STATUS" "Marketplace endpoint"

  if [[ "$HTTP_STATUS" == "200" ]]; then
    agent_count=$(echo "$HTTP_BODY" | python3 -c "
import sys, json
d = json.load(sys.stdin)
items = d.get('items', [])
print(len(items))
" 2>/dev/null)

    TOTAL=$((TOTAL + 1))
    if [[ "${agent_count:-0}" -ge 8 ]]; then
      PASS=$((PASS + 1))
      log_pass "Marketplace has $agent_count agents (expected >= 8)"
    else
      FAIL=$((FAIL + 1))
      log_fail "Marketplace has $agent_count agents (expected >= 8)"
      ERRORS+=("Marketplace: expected >= 8 agents, got $agent_count")
    fi

    # Verify specific agent names
    EXPECTED_AGENTS=( "Code Assistant" "Writing Coach" "Design Helper" "Data Analyzer" "Project Planner" "Research Navigator" "Fun Chat Bot" "Study Buddy" )
    for expected_agent in "${EXPECTED_AGENTS[@]}"; do
      TOTAL=$((TOTAL + 1))
      if echo "$HTTP_BODY" | python3 -c "
import sys, json
d = json.load(sys.stdin)
names = [a['name'] for a in d.get('items', [])]
assert '$expected_agent' in names
" 2>/dev/null; then
        PASS=$((PASS + 1))
        log_pass "Agent '$expected_agent' found in marketplace"
      else
        FAIL=$((FAIL + 1))
        log_fail "Agent '$expected_agent' NOT found in marketplace"
        ERRORS+=("Missing agent: $expected_agent")
      fi
    done
  fi
else
  log_fail "No token for marketplace test"
  FAIL=$((FAIL + 1))
  TOTAL=$((TOTAL + 1))
fi

# ─── Phase 4: Verify Feed ───

log_section "Phase 4: Verify Feed"

if [[ -n "$MP_TOKEN" ]]; then
  make_request GET "/feed" "" "$MP_TOKEN"
  assert_status "200" "$HTTP_STATUS" "Feed endpoint"

  if [[ "$HTTP_STATUS" == "200" ]]; then
    feed_count=$(echo "$HTTP_BODY" | python3 -c "
import sys, json
d = json.load(sys.stdin)
items = d.get('items', [])
print(len(items))
" 2>/dev/null)

    TOTAL=$((TOTAL + 1))
    if [[ "${feed_count:-0}" -gt 0 ]]; then
      PASS=$((PASS + 1))
      log_pass "Feed has $feed_count item(s)"
    else
      FAIL=$((FAIL + 1))
      log_fail "Feed has 0 items (expected > 0)"
      ERRORS+=("Feed: expected > 0 items, got 0")
    fi
  fi
else
  log_fail "No token for feed test"
  FAIL=$((FAIL + 1))
  TOTAL=$((TOTAL + 1))
fi

# ─── Phase 5: Send a Message ───

log_section "Phase 5: Send Message in Existing Conversation"

JORDAN_TOKEN=$(token_for "jordan_student")
if [[ -n "$JORDAN_TOKEN" ]]; then
  # Get first conversation
  make_request GET "/conversations" "" "$JORDAN_TOKEN"
  CONV_ID=$(echo "$HTTP_BODY" | python3 -c "
import sys, json
d = json.load(sys.stdin)
items = d.get('items', d.get('conversations', []))
if items:
    print(items[0]['id'])
else:
    print('')
" 2>/dev/null)

  if [[ -n "$CONV_ID" ]]; then
    IDEM_KEY=$(gen_uuid)
    make_request POST "/conversations/$CONV_ID/messages" \
      '{"content":{"text":"Hello from the persona test script"}}' \
      "$JORDAN_TOKEN" "$IDEM_KEY"
    assert_status_in "Send message as jordan_student" "$HTTP_STATUS" "200" "201"
  else
    log_fail "No conversation found for jordan_student"
    FAIL=$((FAIL + 1))
    TOTAL=$((TOTAL + 1))
  fi
else
  log_fail "No token for jordan_student"
  FAIL=$((FAIL + 1))
  TOTAL=$((TOTAL + 1))
fi

# ─── Phase 6: Create New Agent Conversation ───

log_section "Phase 6: Create Agent Conversation"

ALEX_TOKEN=$(token_for "alex_dev")
if [[ -n "$ALEX_TOKEN" ]]; then
  # Find Code Assistant agent ID from marketplace
  make_request GET "/marketplace" "" "$ALEX_TOKEN"
  CODE_ASSISTANT_ID=$(echo "$HTTP_BODY" | python3 -c "
import sys, json
d = json.load(sys.stdin)
for a in d.get('items', []):
    if a['name'] == 'Code Assistant':
        print(a['id'])
        break
" 2>/dev/null)

  if [[ -n "$CODE_ASSISTANT_ID" ]]; then
    make_request POST "/agents/$CODE_ASSISTANT_ID/conversation" "" "$ALEX_TOKEN"
    assert_status_in "Start agent conversation (alex_dev + Code Assistant)" "$HTTP_STATUS" "200" "201"

    if [[ "$HTTP_STATUS" == "200" || "$HTTP_STATUS" == "201" ]]; then
      agent_conv_id=$(json_nested "conversation.id" "$HTTP_BODY" 2>/dev/null)
      if [[ -n "$agent_conv_id" ]]; then
        log_pass "Agent conversation created: ${agent_conv_id:0:20}..."
      fi
    fi
  else
    log_fail "Code Assistant agent not found"
    FAIL=$((FAIL + 1))
    TOTAL=$((TOTAL + 1))
  fi
else
  log_fail "No token for alex_dev"
  FAIL=$((FAIL + 1))
  TOTAL=$((TOTAL + 1))
fi

# ─── Phase 7: Like a Feed Item ───

log_section "Phase 7: Like a Feed Item"

if [[ -n "$MP_TOKEN" ]]; then
  make_request GET "/feed" "" "$MP_TOKEN"
  FEED_ITEM_ID=$(echo "$HTTP_BODY" | python3 -c "
import sys, json
d = json.load(sys.stdin)
items = d.get('items', [])
if items:
    print(items[0]['id'])
else:
    print('')
" 2>/dev/null)

  if [[ -n "$FEED_ITEM_ID" ]]; then
    make_request POST "/feed/$FEED_ITEM_ID/like" "" "$MP_TOKEN"
    assert_status_in "Like feed item" "$HTTP_STATUS" "200" "201" "204"
  else
    log_info "No feed items to like (skipping)"
  fi
else
  log_fail "No token for feed like test"
  FAIL=$((FAIL + 1))
  TOTAL=$((TOTAL + 1))
fi

# ─── Phase 8: Real-Time Chat Between Two Users ───

log_section "Phase 8: Real-Time Chat (alex_dev <-> maya_writer)"

ALEX_TOKEN=$(token_for "alex_dev")
MAYA_TOKEN=$(token_for "maya_writer")

if [[ -n "$ALEX_TOKEN" && -n "$MAYA_TOKEN" ]]; then
  # Find Alex's DM conversation
  make_request GET "/conversations" "" "$ALEX_TOKEN"
  DM_CONV_ID=$(echo "$HTTP_BODY" | python3 -c "
import sys, json
d = json.load(sys.stdin)
for c in d.get('items', d.get('conversations', [])):
    if c.get('type') == 'dm':
        print(c['id'])
        break
" 2>/dev/null)

  if [[ -n "$DM_CONV_ID" ]]; then
    # Alex sends a message
    IDEM_KEY=$(gen_uuid)
    make_request POST "/conversations/$DM_CONV_ID/messages" \
      '{"content":{"text":"Hey Maya, testing real-time chat"}}' \
      "$ALEX_TOKEN" "$IDEM_KEY"
    assert_status_in "Alex sends DM to Maya" "$HTTP_STATUS" "200" "201"

    # Maya checks messages
    sleep 1
    make_request GET "/conversations/$DM_CONV_ID/messages" "" "$MAYA_TOKEN"
    assert_status "200" "$HTTP_STATUS" "Maya reads DM conversation"

    if [[ "$HTTP_STATUS" == "200" ]]; then
      has_test_msg=$(echo "$HTTP_BODY" | python3 -c "
import sys, json
d = json.load(sys.stdin)
msgs = d.get('items', d.get('messages', []))
found = any('testing real-time chat' in str(m.get('content', '')) for m in msgs)
print('yes' if found else 'no')
" 2>/dev/null)

      TOTAL=$((TOTAL + 1))
      if [[ "$has_test_msg" == "yes" ]]; then
        PASS=$((PASS + 1))
        log_pass "Maya can see Alex's message"
      else
        FAIL=$((FAIL + 1))
        log_fail "Maya cannot see Alex's message"
        ERRORS+=("Real-time chat: Maya missing Alex's message")
      fi
    fi

    # Maya replies
    IDEM_KEY=$(gen_uuid)
    make_request POST "/conversations/$DM_CONV_ID/messages" \
      '{"content":{"text":"Got it Alex, chat works great"}}' \
      "$MAYA_TOKEN" "$IDEM_KEY"
    assert_status_in "Maya replies to Alex" "$HTTP_STATUS" "200" "201"

    # Alex checks messages
    sleep 1
    make_request GET "/conversations/$DM_CONV_ID/messages" "" "$ALEX_TOKEN"
    assert_status "200" "$HTTP_STATUS" "Alex reads updated conversation"

    if [[ "$HTTP_STATUS" == "200" ]]; then
      has_reply=$(echo "$HTTP_BODY" | python3 -c "
import sys, json
d = json.load(sys.stdin)
msgs = d.get('items', d.get('messages', []))
found = any('chat works great' in str(m.get('content', '')) for m in msgs)
print('yes' if found else 'no')
" 2>/dev/null)

      TOTAL=$((TOTAL + 1))
      if [[ "$has_reply" == "yes" ]]; then
        PASS=$((PASS + 1))
        log_pass "Alex can see Maya's reply"
      else
        FAIL=$((FAIL + 1))
        log_fail "Alex cannot see Maya's reply"
        ERRORS+=("Real-time chat: Alex missing Maya's reply")
      fi
    fi
  else
    log_info "No DM conversation found between Alex and Maya (skipping chat test)"
  fi
else
  log_fail "Missing tokens for real-time chat test"
  FAIL=$((FAIL + 1))
  TOTAL=$((TOTAL + 1))
fi

# ─── Phase 9: Verify User Profiles ───

log_section "Phase 9: Verify User Profiles"

if [[ -n "$JORDAN_TOKEN" ]]; then
  make_request GET "/users/me" "" "$JORDAN_TOKEN"
  assert_status "200" "$HTTP_STATUS" "Get own profile (jordan_student)"

  if [[ "$HTTP_STATUS" == "200" ]]; then
    profile_username=$(echo "$HTTP_BODY" | python3 -c "
import sys, json
d = json.load(sys.stdin)
u = d.get('user', d)
print(u.get('username', ''))
" 2>/dev/null)

    TOTAL=$((TOTAL + 1))
    if [[ "$profile_username" == "jordan_student" ]]; then
      PASS=$((PASS + 1))
      log_pass "Profile username matches: $profile_username"
    else
      FAIL=$((FAIL + 1))
      log_fail "Profile username mismatch: got '$profile_username', expected 'jordan_student'"
      ERRORS+=("Profile: expected jordan_student, got $profile_username")
    fi
  fi
fi

# ─── Phase 10: Logout ───

log_section "Phase 10: Logout"

# Only logout a few users to stay within rate limits
LOGOUT_USERS=( jordan_student alex_dev maya_writer )
logout_count=0

for username in "${LOGOUT_USERS[@]}"; do
  token=$(token_for "$username")
  if [[ -z "$token" ]]; then
    continue
  fi

  if (( logout_count > 0 && logout_count % 4 == 0 )); then
    log_info "Rate limit pause..."
    sleep 65
  fi

  make_request DELETE "/auth/logout" '{"refresh_token":"placeholder"}' "$token"
  assert_status_in "Logout $username" "$HTTP_STATUS" "200" "204"
  logout_count=$((logout_count + 1))
done

# ─── Summary ───

print_summary

# Exit with failure code if any tests failed
if [[ $FAIL -gt 0 ]]; then
  exit 1
fi
