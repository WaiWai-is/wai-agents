#!/usr/bin/env bash
# run_all.sh — Master test runner for WaiAgents API tests
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BOLD='\033[1m'
NC='\033[0m'

PHASE_RESULTS=()
OVERALL_FAIL=0
START_TIME=$(date +%s)
PHASE_TSV_FILE=""
TOKEN_FILE="/tmp/wai_agents_test_tokens.env"

NON_INTERACTIVE=false
RUN_SOAK_MODE="prompt" # prompt | yes | no
SOAK_FOREGROUND=false
SOAK_DURATION_HOURS="${SOAK_DURATION_HOURS:-4}"
SOAK_LOG_FILE="${SOAK_LOG_FILE:-/tmp/wai_agents_soak_test.log}"
SUMMARY_JSON=""
BASE_URL_OVERRIDE="${BASE_URL:-}"

usage() {
  cat <<'EOF'
Usage: ./run_all.sh [options]

Options:
  --non-interactive          Never prompt for input.
  --with-soak                Run soak test after phases.
  --no-soak                  Skip soak test.
  --soak-foreground          Run soak test in foreground.
  --soak-hours HOURS         Soak duration in hours (default: SOAK_DURATION_HOURS or 4).
  --soak-log FILE            Soak log file path (default: /tmp/wai_agents_soak_test.log).
  --summary-json FILE        Write machine-readable summary JSON.
  --base-url URL             API base URL, e.g. https://openraccoon.com/api/v1
  --help                     Show this help.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --non-interactive)
      NON_INTERACTIVE=true
      ;;
    --with-soak)
      RUN_SOAK_MODE="yes"
      ;;
    --no-soak)
      RUN_SOAK_MODE="no"
      ;;
    --soak-foreground)
      SOAK_FOREGROUND=true
      ;;
    --soak-hours)
      SOAK_DURATION_HOURS="$2"
      shift
      ;;
    --soak-log)
      SOAK_LOG_FILE="$2"
      shift
      ;;
    --summary-json)
      SUMMARY_JSON="$2"
      shift
      ;;
    --base-url)
      BASE_URL_OVERRIDE="$2"
      shift
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
  shift
done

if [[ -n "$BASE_URL_OVERRIDE" ]]; then
  export BASE_URL="$BASE_URL_OVERRIDE"
fi
export SOAK_DURATION_HOURS
export SOAK_LOG_FILE
PHASE_TSV_FILE="$(mktemp /tmp/wai_agents_phase_summary.XXXXXX)"

# Start each run with a fresh token file so downstream phases never use stale credentials.
rm -f "$TOKEN_FILE"

echo -e "${BOLD}╔══════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║       WaiAgents — Full Test Suite             ║${NC}"
echo -e "${BOLD}║       $(date '+%Y-%m-%d %H:%M:%S')                       ║${NC}"
echo -e "${BOLD}╚══════════════════════════════════════════════════╝${NC}"
echo ""
echo "Base URL: ${BASE_URL:-https://openraccoon.com/api/v1}"
echo "Non-interactive: $NON_INTERACTIVE"
echo ""

append_phase_tsv() {
  local phase_num="$1"
  local script="$2"
  local desc="$3"
  local status="$4"
  local exit_code="$5"
  local duration="$6"
  printf "%s\t%s\t%s\t%s\t%s\t%s\n" \
    "$phase_num" "$script" "$desc" "$status" "$exit_code" "$duration" >> "$PHASE_TSV_FILE"
}

run_phase() {
  local phase_num="$1"
  local script="$2"
  local desc="$3"

  echo ""
  echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${BOLD}  Phase $phase_num: $desc${NC}"
  echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo ""

  if [[ ! -f "$script" ]]; then
    echo -e "${YELLOW}[SKIP]${NC} $script not found"
    PHASE_RESULTS+=("Phase $phase_num ($desc): ${YELLOW}SKIPPED${NC}")
    append_phase_tsv "$phase_num" "$script" "$desc" "skipped" 0 0
    return 0
  fi

  if [[ ! -x "$script" ]]; then
    chmod +x "$script"
  fi

  local start_time
  start_time=$(date +%s)

  "./$script"
  local exit_code=$?

  local end_time
  end_time=$(date +%s)
  local duration=$((end_time - start_time))

  if [[ $exit_code -eq 0 ]]; then
    PHASE_RESULTS+=("Phase $phase_num ($desc): ${GREEN}PASSED${NC} (${duration}s)")
    append_phase_tsv "$phase_num" "$script" "$desc" "passed" "$exit_code" "$duration"
  else
    PHASE_RESULTS+=("Phase $phase_num ($desc): ${RED}FAILED${NC} ($exit_code failures, ${duration}s)")
    append_phase_tsv "$phase_num" "$script" "$desc" "failed" "$exit_code" "$duration"
    OVERALL_FAIL=$((OVERALL_FAIL + 1))
  fi

  return $exit_code
}

# --- Phase 1: API Smoke Test ---
run_phase 1 "api_smoke_test.sh" "API Smoke Test" || true

# --- Phase 2: Auth Tests (creates tokens for subsequent phases) ---
run_phase 2 "auth_tests.sh" "Auth Flow Tests" || true

# --- Phases 3-8 require tokens from Phase 2 ---
token_file_valid() {
  if [[ ! -f "$TOKEN_FILE" ]]; then
    return 1
  fi

  # shellcheck disable=SC1090
  source "$TOKEN_FILE"

  [[ -n "${ALICE_EMAIL:-}" ]] && [[ -n "${ALICE_PASSWORD:-}" ]] && \
    [[ -n "${BOB_EMAIL:-}" ]] && [[ -n "${BOB_PASSWORD:-}" ]] && \
    [[ -n "${CHARLIE_EMAIL:-}" ]] && [[ -n "${CHARLIE_PASSWORD:-}" ]] && \
    [[ -n "${DIANA_EMAIL:-}" ]] && [[ -n "${DIANA_PASSWORD:-}" ]]
}

if token_file_valid; then
  echo ""
  echo -e "${GREEN}Token file found. Running phases 3-8...${NC}"

  run_phase 3 "chat_tests.sh" "Multi-User Chat" || true
  run_phase 4 "agent_tests.sh" "Agent System & Marketplace" || true
  run_phase 5 "page_tests.sh" "Page System" || true
  run_phase 6 "feed_tests.sh" "Feed & Social" || true
  run_phase 7 "bridge_tests.sh" "Bridge Connections" || true
  run_phase 8 "edge_case_tests.sh" "Edge Cases & Security" || true
else
  echo ""
  echo -e "${RED}WARNING: $TOKEN_FILE missing or invalid.${NC}"
  echo "Auth tests may have failed or produced incomplete credentials. Skipping phases 3-8."
  PHASE_RESULTS+=("Phases 3-8: ${YELLOW}SKIPPED${NC} (no tokens)")
  append_phase_tsv "3-8" "-" "Phases 3-8 gated on auth tokens" "skipped" 1 0
  OVERALL_FAIL=$((OVERALL_FAIL + 1))
fi

# --- Overall Summary ---
echo ""
echo -e "${BOLD}╔══════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║              Overall Test Results                ║${NC}"
echo -e "${BOLD}╚══════════════════════════════════════════════════╝${NC}"
echo ""

for result in "${PHASE_RESULTS[@]}"; do
  echo -e "  $result"
done

echo ""
echo -e "${BOLD}Completed at: $(date '+%Y-%m-%d %H:%M:%S')${NC}"
echo ""

if [[ -n "$SUMMARY_JSON" ]]; then
  RUN_ENDED_AT=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
  RUN_DURATION=$(( $(date +%s) - START_TIME ))
  python3 - "$PHASE_TSV_FILE" "$SUMMARY_JSON" "$RUN_ENDED_AT" "$RUN_DURATION" "$OVERALL_FAIL" <<'PY'
import json
import sys

tsv_file, out_file, ended_at, run_duration, overall_fail = sys.argv[1:6]
phases = []
with open(tsv_file, "r", encoding="utf-8") as f:
    for line in f:
        phase_num, script, desc, status, exit_code, duration = line.rstrip("\n").split("\t")
        phases.append(
            {
                "phase": phase_num,
                "script": script,
                "description": desc,
                "status": status,
                "exit_code": int(exit_code),
                "duration_seconds": int(duration),
            }
        )

summary = {
    "ended_at": ended_at,
    "duration_seconds": int(run_duration),
    "overall_failures": int(overall_fail),
    "all_passed": int(overall_fail) == 0,
    "phases": phases,
}
with open(out_file, "w", encoding="utf-8") as f:
    json.dump(summary, f, indent=2)
PY
  echo "Summary JSON written to: $SUMMARY_JSON"
fi

run_soak_test() {
  if [[ ! -f "$TOKEN_FILE" ]]; then
    echo -e "${RED}Cannot start soak test: no token file.${NC}"
    return 1
  fi

  if [[ ! -x ./soak_test.sh ]]; then
    chmod +x ./soak_test.sh
  fi

  if [[ "$SOAK_FOREGROUND" == "true" ]]; then
    echo "Running soak test in foreground for ${SOAK_DURATION_HOURS}h..."
    ./soak_test.sh | tee -a "$SOAK_LOG_FILE"
    return "${PIPESTATUS[0]}"
  fi

  echo "Starting soak test in background..."
  nohup ./soak_test.sh >> "$SOAK_LOG_FILE" 2>&1 &
  SOAK_PID=$!
  echo ""
  echo -e "${GREEN}Soak test started${NC}"
  echo "  PID: $SOAK_PID"
  echo "  Log: $SOAK_LOG_FILE"
  echo "  Duration: ${SOAK_DURATION_HOURS} hours"
  echo ""
  echo "Monitor with: tail -f $SOAK_LOG_FILE"
  echo "Stop with: kill $SOAK_PID"
  return 0
}

# --- Soak Test ---
should_run_soak="no"
if [[ "$RUN_SOAK_MODE" == "yes" ]]; then
  should_run_soak="yes"
elif [[ "$RUN_SOAK_MODE" == "prompt" && "$NON_INTERACTIVE" == "false" ]]; then
  echo -e "${BOLD}Soak test can run for ${SOAK_DURATION_HOURS} hours.${NC}"
  read -rp "Start soak test? [y/N] " answer
  if [[ "$answer" =~ ^[Yy] ]]; then
    should_run_soak="yes"
  fi
fi

if [[ "$should_run_soak" == "yes" ]]; then
  run_soak_test || OVERALL_FAIL=$((OVERALL_FAIL + 1))
else
  echo "Soak test skipped."
fi

rm -f "$PHASE_TSV_FILE"

if [[ $OVERALL_FAIL -gt 0 ]]; then
  exit 1
fi
exit 0
