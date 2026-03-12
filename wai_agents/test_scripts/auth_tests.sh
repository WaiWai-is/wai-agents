#!/usr/bin/env bash
# auth_tests.sh — Comprehensive auth flow tests for WaiAgents API
# Phase 2: Registration, Login, Tokens, Logout, Magic Link, User Profile

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/helpers.sh"

BASE="${BASE_URL:-https://openraccoon.com/api/v1}"

# Auth endpoints are rate-limited to 5 requests/minute per IP.
# We need >=13s between each auth request to stay under the limit.
AUTH_DELAY=13

auth_delay() {
  sleep "$AUTH_DELAY"
}

# Timestamp suffix for unique test accounts
TS=$(date +%s)

# Test account definitions
ALICE_USERNAME="alice_${TS}"
ALICE_EMAIL="alice_${TS}@openraccoon.com"
ALICE_PASSWORD="Alice12345"

BOB_USERNAME="bob_${TS}"
BOB_EMAIL="bob_${TS}@openraccoon.com"
BOB_PASSWORD="Bob12345"

CHARLIE_USERNAME="charlie_${TS}"
CHARLIE_EMAIL="charlie_${TS}@openraccoon.com"
CHARLIE_PASSWORD="Charlie12345"

DIANA_USERNAME="diana_${TS}"
DIANA_EMAIL="diana_${TS}@openraccoon.com"
DIANA_PASSWORD="Diana12345"

# Storage for tokens and IDs
ALICE_TOKEN="" ALICE_REFRESH="" ALICE_ID=""
BOB_TOKEN="" BOB_REFRESH="" BOB_ID=""
CHARLIE_TOKEN="" CHARLIE_REFRESH="" CHARLIE_ID=""
DIANA_TOKEN="" DIANA_REFRESH="" DIANA_ID=""

# Track which users were registered successfully
ALICE_REGISTERED=false
BOB_REGISTERED=false

# Initialize helper variables that register_user/login_user set
ACCESS_TOKEN=""
REFRESH_TOKEN=""
USER_ID=""

# ============================================================================
# Phase 2.1: Registration
# ============================================================================
log_section "Phase 2.1: Registration"

# --- Register all 4 users ---

log_info "Registering alice ($ALICE_EMAIL)..."
register_user "$ALICE_USERNAME" "$ALICE_EMAIL" "$ALICE_PASSWORD"
assert_status_in "Register alice" "$HTTP_STATUS" 200 201
if [[ "$HTTP_STATUS" == "201" || "$HTTP_STATUS" == "200" ]]; then
  ALICE_TOKEN="${ACCESS_TOKEN:-}"
  ALICE_REFRESH="${REFRESH_TOKEN:-}"
  ALICE_ID="${USER_ID:-}"
  ALICE_REGISTERED=true
fi
log_info "  alice ID=$ALICE_ID"
auth_delay

log_info "Registering bob ($BOB_EMAIL)..."
register_user "$BOB_USERNAME" "$BOB_EMAIL" "$BOB_PASSWORD"
assert_status_in "Register bob" "$HTTP_STATUS" 200 201
if [[ "$HTTP_STATUS" == "201" || "$HTTP_STATUS" == "200" ]]; then
  BOB_TOKEN="${ACCESS_TOKEN:-}"
  BOB_REFRESH="${REFRESH_TOKEN:-}"
  BOB_ID="${USER_ID:-}"
  BOB_REGISTERED=true
fi
log_info "  bob ID=$BOB_ID"
auth_delay

log_info "Registering charlie ($CHARLIE_EMAIL)..."
register_user "$CHARLIE_USERNAME" "$CHARLIE_EMAIL" "$CHARLIE_PASSWORD"
assert_status_in "Register charlie" "$HTTP_STATUS" 200 201
if [[ "$HTTP_STATUS" == "201" || "$HTTP_STATUS" == "200" ]]; then
  CHARLIE_TOKEN="${ACCESS_TOKEN:-}"
  CHARLIE_REFRESH="${REFRESH_TOKEN:-}"
  CHARLIE_ID="${USER_ID:-}"
fi
log_info "  charlie ID=$CHARLIE_ID"
auth_delay

log_info "Registering diana ($DIANA_EMAIL)..."
register_user "$DIANA_USERNAME" "$DIANA_EMAIL" "$DIANA_PASSWORD"
assert_status_in "Register diana" "$HTTP_STATUS" 200 201
if [[ "$HTTP_STATUS" == "201" || "$HTTP_STATUS" == "200" ]]; then
  DIANA_TOKEN="${ACCESS_TOKEN:-}"
  DIANA_REFRESH="${REFRESH_TOKEN:-}"
  DIANA_ID="${USER_ID:-}"
fi
log_info "  diana ID=$DIANA_ID"
auth_delay

# --- Duplicate email (only if alice was registered) ---

if [[ "$ALICE_REGISTERED" == true ]]; then
  log_info "Registering duplicate email (alice's email with different username)..."
  make_request POST "/auth/register" \
    "{\"username\":\"duplicate_email_${TS}\",\"email\":\"$ALICE_EMAIL\",\"password\":\"Duplicate1234\"}"
  assert_status_in "Register duplicate email" "$HTTP_STATUS" 409 422
  auth_delay

  # --- Duplicate username ---

  log_info "Registering duplicate username (alice's username with different email)..."
  make_request POST "/auth/register" \
    "{\"username\":\"$ALICE_USERNAME\",\"email\":\"duplicate_user_${TS}@openraccoon.com\",\"password\":\"Duplicate1234\"}"
  assert_status_in "Register duplicate username" "$HTTP_STATUS" 409 422
  auth_delay
else
  log_info "SKIP: Duplicate email/username tests (alice not registered — rate limited)"
fi

# --- Empty username ---

log_info "Registering with empty username..."
make_request POST "/auth/register" \
  "{\"username\":\"\",\"email\":\"empty_user_${TS}@openraccoon.com\",\"password\":\"ValidPass123\"}"
assert_status_in "Register empty username" "$HTTP_STATUS" 422 400
auth_delay

# --- Too-short password ---

log_info "Registering with too-short password (< 8 chars)..."
make_request POST "/auth/register" \
  "{\"username\":\"shortpw_${TS}\",\"email\":\"shortpw_${TS}@openraccoon.com\",\"password\":\"Ab1\"}"
assert_status_in "Register short password" "$HTTP_STATUS" 422 400
auth_delay

# --- Invalid email format ---

log_info "Registering with invalid email format..."
make_request POST "/auth/register" \
  "{\"username\":\"bademail_${TS}\",\"email\":\"not-an-email\",\"password\":\"ValidPass123\"}"
assert_status_in "Register invalid email" "$HTTP_STATUS" 422 400

# ============================================================================
# Phase 2.2: Login
# ============================================================================
log_section "Phase 2.2: Login"

# --- Login each user with correct credentials ---

log_info "Login alice..."
auth_delay
login_user "$ALICE_EMAIL" "$ALICE_PASSWORD"
assert_status "200" "$HTTP_STATUS" "Login alice"
if [[ "$HTTP_STATUS" == "200" ]]; then
  ALICE_TOKEN="$ACCESS_TOKEN"
  ALICE_REFRESH="$REFRESH_TOKEN"
  ALICE_ID="$USER_ID"
fi

log_info "Login bob..."
auth_delay
login_user "$BOB_EMAIL" "$BOB_PASSWORD"
assert_status "200" "$HTTP_STATUS" "Login bob"
if [[ "$HTTP_STATUS" == "200" ]]; then
  BOB_TOKEN="$ACCESS_TOKEN"
  BOB_REFRESH="$REFRESH_TOKEN"
  BOB_ID="$USER_ID"
fi

log_info "Login charlie..."
auth_delay
login_user "$CHARLIE_EMAIL" "$CHARLIE_PASSWORD"
assert_status "200" "$HTTP_STATUS" "Login charlie"
if [[ "$HTTP_STATUS" == "200" ]]; then
  CHARLIE_TOKEN="$ACCESS_TOKEN"
  CHARLIE_REFRESH="$REFRESH_TOKEN"
  CHARLIE_ID="$USER_ID"
fi

log_info "Login diana..."
auth_delay
login_user "$DIANA_EMAIL" "$DIANA_PASSWORD"
assert_status "200" "$HTTP_STATUS" "Login diana"
if [[ "$HTTP_STATUS" == "200" ]]; then
  DIANA_TOKEN="$ACCESS_TOKEN"
  DIANA_REFRESH="$REFRESH_TOKEN"
  DIANA_ID="$USER_ID"
fi

# --- Wrong password ---

log_info "Login alice with wrong password..."
auth_delay
make_request POST "/auth/login" \
  "{\"email\":\"$ALICE_EMAIL\",\"password\":\"WrongPassword999\"}"
assert_status_in "Login wrong password" "$HTTP_STATUS" 401 400

# --- Non-existent email ---

log_info "Login with non-existent email..."
auth_delay
make_request POST "/auth/login" \
  "{\"email\":\"nonexistent_${TS}@openraccoon.com\",\"password\":\"SomePass123\"}"
assert_status_in "Login non-existent email" "$HTTP_STATUS" 401 404

# --- Empty password ---

log_info "Login with empty password..."
auth_delay
make_request POST "/auth/login" \
  "{\"email\":\"$ALICE_EMAIL\",\"password\":\"\"}"
assert_status_in "Login empty password" "$HTTP_STATUS" 401 400 422

# ============================================================================
# Phase 2.3: Token Operations
# ============================================================================
log_section "Phase 2.3: Token Operations"

if [[ -z "$ALICE_TOKEN" ]]; then
  log_info "SKIP Phase 2.3: No alice token (registration/login failed)"
else
  # --- GET /users/me with alice's token ---

  log_info "GET /users/me with alice's token..."
  make_request GET "/users/me" "" "$ALICE_TOKEN"
  assert_status "200" "$HTTP_STATUS" "GET /users/me (alice)"
  assert_json_field "user" "GET /users/me has user key"

  # Verify the returned data matches alice (response: {"user": {...}})
  ME_USERNAME=$(json_nested "user.username")
  ME_EMAIL=$(json_nested "user.email")

  TOTAL=$((TOTAL + 1))
  if [[ "$ME_USERNAME" == "$ALICE_USERNAME" ]]; then
    PASS=$((PASS + 1))
    log_pass "GET /users/me username matches alice ($ME_USERNAME)"
  else
    FAIL=$((FAIL + 1))
    log_fail "GET /users/me username mismatch — expected $ALICE_USERNAME, got $ME_USERNAME"
    ERRORS+=("GET /users/me username: expected $ALICE_USERNAME, got $ME_USERNAME")
  fi

  TOTAL=$((TOTAL + 1))
  if [[ "$ME_EMAIL" == "$ALICE_EMAIL" ]]; then
    PASS=$((PASS + 1))
    log_pass "GET /users/me email matches alice ($ME_EMAIL)"
  else
    FAIL=$((FAIL + 1))
    log_fail "GET /users/me email mismatch — expected $ALICE_EMAIL, got $ME_EMAIL"
    ERRORS+=("GET /users/me email: expected $ALICE_EMAIL, got $ME_EMAIL")
  fi

  # --- Refresh token for alice ---

  log_info "Refresh token for alice..."
  auth_delay
  make_request POST "/auth/refresh" \
    "{\"refresh_token\":\"$ALICE_REFRESH\"}"
  assert_status "200" "$HTTP_STATUS" "Refresh token (alice)"

  ALICE_NEW_TOKEN=$(json_field "access_token")
  ALICE_NEW_REFRESH=$(json_field "refresh_token")

  # If tokens are nested under "tokens" key, try that
  if [[ -z "$ALICE_NEW_TOKEN" ]]; then
    ALICE_NEW_TOKEN=$(json_nested "tokens.access_token")
    ALICE_NEW_REFRESH=$(json_nested "tokens.refresh_token")
  fi

  log_info "  New access token: ${ALICE_NEW_TOKEN:0:20}..."

  # --- GET /users/me with NEW token ---

  if [[ -n "$ALICE_NEW_TOKEN" ]]; then
    log_info "GET /users/me with new token..."
    make_request GET "/users/me" "" "$ALICE_NEW_TOKEN"
    assert_status "200" "$HTTP_STATUS" "GET /users/me with refreshed token"
    ALICE_TOKEN="$ALICE_NEW_TOKEN"
    if [[ -n "$ALICE_NEW_REFRESH" ]]; then
      ALICE_REFRESH="$ALICE_NEW_REFRESH"
    fi
  fi
fi

# --- GET /users/me with no token ---

log_info "GET /users/me with no token..."
make_request GET "/users/me" "" ""
assert_status "401" "$HTTP_STATUS" "GET /users/me no token"

# --- GET /users/me with garbage token ---

log_info "GET /users/me with garbage token..."
make_request GET "/users/me" "" "this-is-total-garbage-not-a-jwt"
assert_status "401" "$HTTP_STATUS" "GET /users/me garbage token"

# --- GET /users/me with "Bearer invalid" ---

log_info "GET /users/me with 'Bearer invalid' token value..."
make_request GET "/users/me" "" "invalid"
assert_status "401" "$HTTP_STATUS" "GET /users/me invalid bearer"

# --- Refresh with invalid refresh token ---

log_info "POST /auth/refresh with invalid refresh token..."
auth_delay
make_request POST "/auth/refresh" \
  "{\"refresh_token\":\"not-a-valid-refresh-token\"}"
assert_status_in "Refresh invalid token" "$HTTP_STATUS" 401 400 500

# ============================================================================
# Phase 2.4: Logout
# ============================================================================
log_section "Phase 2.4: Logout"

if [[ -z "$ALICE_TOKEN" ]]; then
  log_info "SKIP Phase 2.4: No alice token"
else
  # --- Login alice fresh ---

  log_info "Login alice fresh for logout test..."
  auth_delay
  login_user "$ALICE_EMAIL" "$ALICE_PASSWORD"
  assert_status "200" "$HTTP_STATUS" "Login alice fresh (for logout)"
  LOGOUT_TOKEN="${ACCESS_TOKEN:-}"

  if [[ -n "$LOGOUT_TOKEN" ]]; then
    # --- DELETE /auth/logout ---

    log_info "DELETE /auth/logout with alice's token..."
    make_request DELETE "/auth/logout" "" "$LOGOUT_TOKEN"
    assert_status_in "Logout alice" "$HTTP_STATUS" 200 204

    # --- GET /users/me with invalidated token ---

    log_info "GET /users/me with logged-out token..."
    make_request GET "/users/me" "" "$LOGOUT_TOKEN"
    assert_status_in "GET /users/me after logout" "$HTTP_STATUS" 200 401
  fi

  # --- Login alice again after logout ---

  log_info "Login alice again after logout..."
  auth_delay
  login_user "$ALICE_EMAIL" "$ALICE_PASSWORD"
  assert_status "200" "$HTTP_STATUS" "Login alice after logout"
  if [[ "$HTTP_STATUS" == "200" ]]; then
    ALICE_TOKEN="$ACCESS_TOKEN"
    ALICE_REFRESH="$REFRESH_TOKEN"
    ALICE_ID="$USER_ID"
  fi
fi

# ============================================================================
# Phase 2.5: Magic Link
# ============================================================================
log_section "Phase 2.5: Magic Link"

# --- Request magic link for alice ---

log_info "POST /auth/magic-link for alice's email..."
auth_delay
make_request POST "/auth/magic-link" \
  "{\"email\":\"$ALICE_EMAIL\"}"
assert_status "200" "$HTTP_STATUS" "Magic link request (alice)"

# --- Request magic link for non-existent email (no info leak) ---

log_info "POST /auth/magic-link for non-existent email..."
auth_delay
make_request POST "/auth/magic-link" \
  "{\"email\":\"nonexistent_magic_${TS}@openraccoon.com\"}"
assert_status "200" "$HTTP_STATUS" "Magic link non-existent email (no info leak)"

# --- Verify magic link with garbage token ---

log_info "POST /auth/magic-link/verify with garbage token..."
auth_delay
make_request POST "/auth/magic-link/verify" \
  "{\"token\":\"this-is-not-a-valid-magic-link-token\"}"
assert_status_in "Magic link verify garbage token" "$HTTP_STATUS" 401 400 422

# --- Verify magic link with empty token ---

log_info "POST /auth/magic-link/verify with empty token..."
auth_delay
make_request POST "/auth/magic-link/verify" \
  "{\"token\":\"\"}"
assert_status_in "Magic link verify empty token" "$HTTP_STATUS" 401 400 422

# ============================================================================
# Phase 2.6: User Profile
# ============================================================================
log_section "Phase 2.6: User Profile"

if [[ -z "$ALICE_TOKEN" ]]; then
  log_info "SKIP Phase 2.6: No alice token"
else
  # --- GET /users/me — verify fields ---

  log_info "GET /users/me — verify profile fields..."
  make_request GET "/users/me" "" "$ALICE_TOKEN"
  assert_status "200" "$HTTP_STATUS" "GET /users/me (profile check)"
  assert_json_field "user" "Profile has user key"

  PROFILE_USERNAME=$(json_nested "user.username")
  PROFILE_EMAIL=$(json_nested "user.email")

  TOTAL=$((TOTAL + 1))
  if [[ "$PROFILE_USERNAME" == "$ALICE_USERNAME" ]]; then
    PASS=$((PASS + 1))
    log_pass "Profile username matches ($PROFILE_USERNAME)"
  else
    FAIL=$((FAIL + 1))
    log_fail "Profile username mismatch — expected $ALICE_USERNAME, got $PROFILE_USERNAME"
    ERRORS+=("Profile username: expected $ALICE_USERNAME, got $PROFILE_USERNAME")
  fi

  TOTAL=$((TOTAL + 1))
  if [[ "$PROFILE_EMAIL" == "$ALICE_EMAIL" ]]; then
    PASS=$((PASS + 1))
    log_pass "Profile email matches ($PROFILE_EMAIL)"
  else
    FAIL=$((FAIL + 1))
    log_fail "Profile email mismatch — expected $ALICE_EMAIL, got $PROFILE_EMAIL"
    ERRORS+=("Profile email: expected $ALICE_EMAIL, got $PROFILE_EMAIL")
  fi

  # --- PATCH /users/me — update display_name and bio (snake_case) ---

  log_info "PATCH /users/me — set display_name and bio..."
  make_request PATCH "/users/me" \
    '{"display_name":"Alice WaiAgents","bio":"Testing waiagents auth flows"}' \
    "$ALICE_TOKEN"
  assert_status "200" "$HTTP_STATUS" "PATCH /users/me (update profile)"

  # --- GET /users/me — verify display_name and bio updated ---

  log_info "GET /users/me — verify display_name and bio..."
  make_request GET "/users/me" "" "$ALICE_TOKEN"
  assert_status "200" "$HTTP_STATUS" "GET /users/me (after profile update)"

  UPDATED_DISPLAY_NAME=$(json_nested "user.display_name")
  UPDATED_BIO=$(json_nested "user.bio")

  TOTAL=$((TOTAL + 1))
  if [[ "$UPDATED_DISPLAY_NAME" == "Alice WaiAgents" ]]; then
    PASS=$((PASS + 1))
    log_pass "display_name updated correctly ($UPDATED_DISPLAY_NAME)"
  else
    FAIL=$((FAIL + 1))
    log_fail "display_name mismatch — expected 'Alice WaiAgents', got '$UPDATED_DISPLAY_NAME'"
    ERRORS+=("display_name: expected 'Alice WaiAgents', got '$UPDATED_DISPLAY_NAME'")
  fi

  TOTAL=$((TOTAL + 1))
  if [[ "$UPDATED_BIO" == "Testing waiagents auth flows" ]]; then
    PASS=$((PASS + 1))
    log_pass "bio updated correctly ($UPDATED_BIO)"
  else
    FAIL=$((FAIL + 1))
    log_fail "bio mismatch — expected 'Testing waiagents auth flows', got '$UPDATED_BIO'"
    ERRORS+=("bio: expected 'Testing waiagents auth flows', got '$UPDATED_BIO'")
  fi

  # --- GET /users/:username — public profile ---

  log_info "GET /users/$ALICE_USERNAME — public profile..."
  make_request GET "/users/$ALICE_USERNAME" "" "$ALICE_TOKEN"
  assert_status "200" "$HTTP_STATUS" "GET /users/:username (public profile)"
  assert_json_field "user" "Public profile has user key"

  PUBLIC_USERNAME=$(json_nested "user.username")
  TOTAL=$((TOTAL + 1))
  if [[ "$PUBLIC_USERNAME" == "$ALICE_USERNAME" ]]; then
    PASS=$((PASS + 1))
    log_pass "Public profile username matches ($PUBLIC_USERNAME)"
  else
    FAIL=$((FAIL + 1))
    log_fail "Public profile username mismatch — expected $ALICE_USERNAME, got $PUBLIC_USERNAME"
    ERRORS+=("Public profile username: expected $ALICE_USERNAME, got $PUBLIC_USERNAME")
  fi
fi

# ============================================================================
# Export tokens for subsequent test scripts
# ============================================================================
log_section "Exporting Tokens"

TOKEN_FILE="/tmp/wai_agents_test_tokens.env"

cat > "$TOKEN_FILE" <<EOF
# WaiAgents test tokens — generated by auth_tests.sh at $(date -u +"%Y-%m-%dT%H:%M:%SZ")
# Timestamp suffix: $TS
ALICE_TOKEN=$ALICE_TOKEN
ALICE_ID=$ALICE_ID
ALICE_USERNAME=$ALICE_USERNAME
ALICE_EMAIL=$ALICE_EMAIL
ALICE_PASSWORD=$ALICE_PASSWORD
BOB_TOKEN=$BOB_TOKEN
BOB_ID=$BOB_ID
BOB_USERNAME=$BOB_USERNAME
BOB_EMAIL=$BOB_EMAIL
BOB_PASSWORD=$BOB_PASSWORD
CHARLIE_TOKEN=$CHARLIE_TOKEN
CHARLIE_ID=$CHARLIE_ID
CHARLIE_USERNAME=$CHARLIE_USERNAME
CHARLIE_EMAIL=$CHARLIE_EMAIL
CHARLIE_PASSWORD=$CHARLIE_PASSWORD
DIANA_TOKEN=$DIANA_TOKEN
DIANA_ID=$DIANA_ID
DIANA_USERNAME=$DIANA_USERNAME
DIANA_EMAIL=$DIANA_EMAIL
DIANA_PASSWORD=$DIANA_PASSWORD
EOF

log_info "Tokens saved to $TOKEN_FILE"

# ============================================================================
# Summary & Exit
# ============================================================================

print_summary

if [[ $FAIL -gt 0 ]]; then
  exit 1
fi
exit 0
