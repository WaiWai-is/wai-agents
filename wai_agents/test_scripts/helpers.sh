#!/usr/bin/env bash
# helpers.sh — Shared functions for WaiAgents API tests

set -uo pipefail

BASE="${BASE_URL:-https://openraccoon.com/api/v1}"
PASS=0
FAIL=0
TOTAL=0
ERRORS=()

# Auth endpoints are rate-limited in production.
# Keep retries centralized so all test phases inherit stable behavior.
AUTH_MAX_RETRIES="${AUTH_MAX_RETRIES:-4}"
AUTH_RETRY_DELAY_SECONDS="${AUTH_RETRY_DELAY_SECONDS:-13}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m'

# --- Logging ---

log_info() {
  echo -e "${BLUE}[INFO]${NC} $1"
}

log_pass() {
  echo -e "${GREEN}[PASS]${NC} $1"
}

log_fail() {
  echo -e "${RED}[FAIL]${NC} $1"
}

log_section() {
  echo ""
  echo -e "${BOLD}=== $1 ===${NC}"
  echo ""
}

# --- HTTP Request ---
# Usage: make_request METHOD PATH [BODY] [TOKEN]
# Sets: HTTP_STATUS, HTTP_BODY, HTTP_LATENCY
make_request() {
  local method="$1"
  local path="$2"
  local body="${3:-}"
  local token="${4:-}"
  local idempotency_key="${5:-}"

  local url="${BASE}${path}"
  local curl_args=(-s -w "\n%{http_code}\n%{time_total}" -X "$method")

  curl_args+=(-H "Content-Type: application/json")

  if [[ -n "$token" ]]; then
    curl_args+=(-H "Authorization: Bearer $token")
  fi

  if [[ -n "$idempotency_key" ]]; then
    curl_args+=(-H "Idempotency-Key: $idempotency_key")
  fi

  if [[ -n "$body" ]]; then
    curl_args+=(-d "$body")
  fi

  local output
  output=$(curl "${curl_args[@]}" "$url" 2>/dev/null) || {
    HTTP_STATUS="000"
    HTTP_BODY="Connection refused or timeout"
    HTTP_LATENCY="0"
    return 1
  }

  # Parse: body is everything up to last 2 lines, status is second-to-last, time is last
  HTTP_BODY=$(echo "$output" | sed '$d' | sed '$d')
  HTTP_STATUS=$(echo "$output" | tail -2 | head -1)
  HTTP_LATENCY=$(echo "$output" | tail -1)
}

# --- Assertions ---

assert_status() {
  local expected="$1"
  local actual="$2"
  local test_name="$3"
  local details="${4:-}"

  TOTAL=$((TOTAL + 1))

  if [[ "$actual" == "$expected" ]]; then
    PASS=$((PASS + 1))
    log_pass "$test_name (HTTP $actual) [${HTTP_LATENCY}s]"
    return 0
  else
    FAIL=$((FAIL + 1))
    log_fail "$test_name — expected $expected, got $actual [${HTTP_LATENCY}s]"
    if [[ -n "$details" ]]; then
      echo "       Details: $details"
    fi
    if [[ -n "${HTTP_BODY:-}" ]]; then
      echo "       Response: $(echo "$HTTP_BODY" | head -c 200)"
    fi
    ERRORS+=("$test_name: expected $expected, got $actual")
    return 1
  fi
}

# Assert status is in a set of acceptable codes
assert_status_in() {
  local test_name="$1"
  local actual="$2"
  shift 2
  local expected_codes=("$@")

  TOTAL=$((TOTAL + 1))

  for code in "${expected_codes[@]}"; do
    if [[ "$actual" == "$code" ]]; then
      PASS=$((PASS + 1))
      log_pass "$test_name (HTTP $actual) [${HTTP_LATENCY}s]"
      return 0
    fi
  done

  FAIL=$((FAIL + 1))
  log_fail "$test_name — got $actual, expected one of: ${expected_codes[*]} [${HTTP_LATENCY}s]"
  if [[ -n "${HTTP_BODY:-}" ]]; then
    echo "       Response: $(echo "$HTTP_BODY" | head -c 200)"
  fi
  ERRORS+=("$test_name: got $actual, expected one of: ${expected_codes[*]}")
  return 1
}

# Assert a JSON field exists in HTTP_BODY
assert_json_field() {
  local field="$1"
  local test_name="$2"
  local json="${3:-$HTTP_BODY}"

  TOTAL=$((TOTAL + 1))

  if echo "$json" | python3 -c "import sys,json; d=json.load(sys.stdin); assert '$field' in d" 2>/dev/null; then
    PASS=$((PASS + 1))
    log_pass "$test_name — field '$field' present"
    return 0
  else
    FAIL=$((FAIL + 1))
    log_fail "$test_name — field '$field' missing"
    ERRORS+=("$test_name: field '$field' missing")
    return 1
  fi
}

# Extract a JSON field value
json_field() {
  local field="$1"
  local json="${2:-$HTTP_BODY}"
  echo "$json" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('$field',''))" 2>/dev/null
}

# Extract a nested JSON field (dot notation)
json_nested() {
  local path="$1"
  local json="${2:-$HTTP_BODY}"
  echo "$json" | python3 -c "
import sys, json
d = json.load(sys.stdin)
keys = '$path'.split('.')
for k in keys:
    if isinstance(d, dict):
        d = d.get(k, '')
    else:
        d = ''
        break
print(d)
" 2>/dev/null
}

# --- Auth Helpers ---

# Retry auth requests on HTTP 429. Leaves HTTP_* globals from final attempt.
auth_request_with_retry() {
  local method="$1"
  local path="$2"
  local body="$3"

  local attempt=1
  local max_attempts=$((AUTH_MAX_RETRIES + 1))

  while (( attempt <= max_attempts )); do
    make_request "$method" "$path" "$body"

    if [[ "$HTTP_STATUS" != "429" ]]; then
      return 0
    fi

    if (( attempt == max_attempts )); then
      return 0
    fi

    log_info "Auth rate-limited (HTTP 429) on $path; retry $attempt/$AUTH_MAX_RETRIES in ${AUTH_RETRY_DELAY_SECONDS}s"
    sleep "$AUTH_RETRY_DELAY_SECONDS"
    attempt=$((attempt + 1))
  done

  return 0
}

extract_auth_payload() {
  ACCESS_TOKEN=$(echo "$HTTP_BODY" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('tokens',{}).get('access_token',''))" 2>/dev/null)
  REFRESH_TOKEN=$(echo "$HTTP_BODY" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('tokens',{}).get('refresh_token',''))" 2>/dev/null)
  USER_ID=$(echo "$HTTP_BODY" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('user',{}).get('id',''))" 2>/dev/null)
}

# Register a user. Sets: USER_ID, ACCESS_TOKEN, REFRESH_TOKEN
register_user() {
  local username="$1"
  local email="$2"
  local password="$3"

  auth_request_with_retry POST "/auth/register" \
    "{\"username\":\"$username\",\"email\":\"$email\",\"password\":\"$password\"}"

  if [[ "$HTTP_STATUS" == "200" || "$HTTP_STATUS" == "201" ]]; then
    extract_auth_payload
    return 0
  fi
  return 1
}

# Login a user. Sets: USER_ID, ACCESS_TOKEN, REFRESH_TOKEN
login_user() {
  local email="$1"
  local password="$2"

  auth_request_with_retry POST "/auth/login" \
    "{\"email\":\"$email\",\"password\":\"$password\"}"

  if [[ "$HTTP_STATUS" == "200" ]]; then
    extract_auth_payload
    return 0
  fi
  return 1
}

# --- UUID Generator ---

gen_uuid() {
  python3 -c "import uuid; print(uuid.uuid4())"
}

# --- Summary ---

print_summary() {
  echo ""
  echo -e "${BOLD}==============================${NC}"
  echo -e "${BOLD}  Test Summary${NC}"
  echo -e "${BOLD}==============================${NC}"
  echo -e "  Total:  $TOTAL"
  echo -e "  ${GREEN}Passed: $PASS${NC}"
  echo -e "  ${RED}Failed: $FAIL${NC}"
  echo -e "${BOLD}==============================${NC}"

  if [[ ${#ERRORS[@]} -gt 0 ]]; then
    echo ""
    echo -e "${RED}Failed tests:${NC}"
    for err in "${ERRORS[@]}"; do
      echo "  - $err"
    done
  fi

  echo ""
  if [[ $FAIL -eq 0 ]]; then
    echo -e "${GREEN}${BOLD}ALL TESTS PASSED${NC}"
  else
    echo -e "${RED}${BOLD}SOME TESTS FAILED${NC}"
  fi
}
