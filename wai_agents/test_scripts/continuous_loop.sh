#!/usr/bin/env bash
# continuous_loop.sh — long-running iterative test orchestration
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
UMBRELLA_DIR="$REPO_ROOT/wai_agents"
SWIFT_DIR="$REPO_ROOT/WaiAgents"
RUNTIME_DIR="$REPO_ROOT/agent_runtime"

LOOP_HOURS="${LOOP_HOURS:-8}"
CYCLE_DELAY_SECONDS="${CYCLE_DELAY_SECONDS:-20}"
BASE_URL="${BASE_URL:-https://openraccoon.com/api/v1}"
ARTIFACT_ROOT="${ARTIFACT_ROOT:-/tmp/wai_agents_continuous}"
MAX_CYCLES="${MAX_CYCLES:-0}"

RUN_LOCAL_TESTS="${RUN_LOCAL_TESTS:-1}"
LOCAL_TESTS_EVERY_CYCLES="${LOCAL_TESTS_EVERY_CYCLES:-1}"
RUN_SOAK="${RUN_SOAK:-1}"
SOAK_EVERY_CYCLES="${SOAK_EVERY_CYCLES:-4}"
SOAK_DURATION_HOURS="${SOAK_DURATION_HOURS:-1}"
ENABLE_SCREENSHOTS="${ENABLE_SCREENSHOTS:-1}"

PHASE_RETRY_COUNT="${PHASE_RETRY_COUNT:-2}"
AUTH_MAX_RETRIES="${AUTH_MAX_RETRIES:-4}"
AUTH_RETRY_DELAY_SECONDS="${AUTH_RETRY_DELAY_SECONDS:-13}"
FAIL_ON_RED="${FAIL_ON_RED:-1}"

DEPLOY_TRIGGER_CMD="${DEPLOY_TRIGGER_CMD:-}"
FIX_HOOK_CMD="${FIX_HOOK_CMD:-}"
UI_BASE_URL="${UI_BASE_URL:-$BASE_URL}"

usage() {
  cat <<'EOF'
Usage: ./continuous_loop.sh [options]

Core:
  --hours HOURS                   Total run time (default: 8)
  --base-url URL                  API base URL (default: https://openraccoon.com/api/v1)
  --artifact-root DIR             Artifact root directory (default: /tmp/wai_agents_continuous)
  --cycle-delay SECONDS           Delay between cycles (default: 20)
  --max-cycles N                  Stop after N cycles (0 = no cap)

Test selection:
  --with-local-tests              Run mix/swift/pytest checks in loop (default: on)
  --no-local-tests                Skip local unit/integration checks
  --local-tests-every N           Run local checks every N cycles (default: 1)
  --with-soak                     Enable soak test in loop (default: on)
  --no-soak                       Disable soak test
  --soak-every N                  Run soak every N cycles (default: 4)
  --soak-hours HOURS              Duration for soak step (default: 1)
  --phase-retries N               Retries for full API suite step (default: 2)

Evidence / automation:
  --with-screenshots              Capture screenshots each cycle (default: on)
  --no-screenshots                Disable screenshot capture
  --ui-base-url URL               UI URL used for screenshot probes
  --deploy-cmd CMD                Optional command run after a green cycle
  --fix-cmd CMD                   Optional command run after a red cycle

Auth stability:
  --auth-max-retries N            Login/register retry count for HTTP 429 (default: 4)
  --auth-retry-delay SECONDS      Delay between auth retries (default: 13)
  --fail-on-red                   Exit non-zero when any cycle is red (default: on)
  --allow-red                     Always exit 0, even when cycles fail

  --help                          Show this help
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --hours)
      LOOP_HOURS="$2"
      shift
      ;;
    --base-url)
      BASE_URL="$2"
      shift
      ;;
    --artifact-root)
      ARTIFACT_ROOT="$2"
      shift
      ;;
    --cycle-delay)
      CYCLE_DELAY_SECONDS="$2"
      shift
      ;;
    --max-cycles)
      MAX_CYCLES="$2"
      shift
      ;;
    --with-local-tests)
      RUN_LOCAL_TESTS=1
      ;;
    --no-local-tests)
      RUN_LOCAL_TESTS=0
      ;;
    --local-tests-every)
      LOCAL_TESTS_EVERY_CYCLES="$2"
      shift
      ;;
    --with-soak)
      RUN_SOAK=1
      ;;
    --no-soak)
      RUN_SOAK=0
      ;;
    --soak-every)
      SOAK_EVERY_CYCLES="$2"
      shift
      ;;
    --soak-hours)
      SOAK_DURATION_HOURS="$2"
      shift
      ;;
    --phase-retries)
      PHASE_RETRY_COUNT="$2"
      shift
      ;;
    --with-screenshots)
      ENABLE_SCREENSHOTS=1
      ;;
    --no-screenshots)
      ENABLE_SCREENSHOTS=0
      ;;
    --ui-base-url)
      UI_BASE_URL="$2"
      shift
      ;;
    --deploy-cmd)
      DEPLOY_TRIGGER_CMD="$2"
      shift
      ;;
    --fix-cmd)
      FIX_HOOK_CMD="$2"
      shift
      ;;
    --auth-max-retries)
      AUTH_MAX_RETRIES="$2"
      shift
      ;;
    --auth-retry-delay)
      AUTH_RETRY_DELAY_SECONDS="$2"
      shift
      ;;
    --fail-on-red)
      FAIL_ON_RED=1
      ;;
    --allow-red)
      FAIL_ON_RED=0
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

if [[ "$UI_BASE_URL" == *"/api/v1" ]]; then
  UI_BASE_URL="${UI_BASE_URL%/api/v1}"
fi

RUN_ID="$(date -u +%Y%m%dT%H%M%SZ)"
RUN_DIR="$ARTIFACT_ROOT/run_$RUN_ID"
GLOBAL_LOG="$RUN_DIR/continuous.log"
CYCLES_TSV="$RUN_DIR/cycles.tsv"

mkdir -p "$RUN_DIR"
touch "$GLOBAL_LOG"
printf "cycle\tstatus\tfailures\tduration_seconds\tstarted_at\tended_at\tpath\n" > "$CYCLES_TSV"

export BASE_URL
export AUTH_MAX_RETRIES
export AUTH_RETRY_DELAY_SECONDS

log() {
  local ts
  ts="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  echo "[$ts] $*" | tee -a "$GLOBAL_LOG"
}

ensure_executable() {
  local path="$1"
  if [[ ! -x "$path" ]]; then
    chmod +x "$path"
  fi
}

run_step() {
  local cycle_dir="$1"
  local step_name="$2"
  local workdir="$3"
  local command="$4"
  local log_file="$5"

  local started_at
  started_at="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  local start_s
  start_s="$(date +%s)"

  (
    cd "$workdir" || exit 1
    bash -lc "$command"
  ) >"$log_file" 2>&1
  local code=$?

  local ended_at
  ended_at="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  local end_s
  end_s="$(date +%s)"
  local duration=$((end_s - start_s))

  printf "%s\t%s\t%s\t%s\t%s\t%s\t%s\n" \
    "$step_name" "$code" "$duration" "$started_at" "$ended_at" "$workdir" "$log_file" >> "$cycle_dir/steps.tsv"

  if [[ $code -eq 0 ]]; then
    log "Cycle $CURRENT_CYCLE: PASS $step_name (${duration}s)"
  else
    log "Cycle $CURRENT_CYCLE: FAIL $step_name (exit=$code, ${duration}s, log=$log_file)"
  fi

  return $code
}

run_api_suite_with_retries() {
  local cycle_dir="$1"
  local attempts="$2"
  local attempt=1
  local code=1

  while (( attempt <= attempts )); do
    local log_file="$cycle_dir/api_suite.attempt${attempt}.log"
    local cmd="./run_all.sh --non-interactive --no-soak --base-url \"$BASE_URL\" --summary-json \"$cycle_dir/run_all_summary.json\""
    run_step "$cycle_dir" "api_suite_attempt_${attempt}" "$SCRIPT_DIR" "$cmd" "$log_file"
    code=$?
    if [[ $code -eq 0 ]]; then
      return 0
    fi

    if (( attempt < attempts )); then
      log "Cycle $CURRENT_CYCLE: retrying API suite in ${AUTH_RETRY_DELAY_SECONDS}s (attempt $attempt/$attempts)"
      sleep "$AUTH_RETRY_DELAY_SECONDS"
    fi
    attempt=$((attempt + 1))
  done

  return "$code"
}

generate_cycle_report_html() {
  local cycle_dir="$1"
  python3 - "$cycle_dir/steps.tsv" "$cycle_dir/report.html" "$CURRENT_CYCLE" <<'PY'
import html
import sys

steps_tsv, report_html, cycle = sys.argv[1:4]
rows = []
with open(steps_tsv, "r", encoding="utf-8") as f:
    for line in f:
        if line.startswith("step\t"):
            continue
        step, code, dur, started, ended, workdir, logfile = line.rstrip("\n").split("\t")
        rows.append(
            {
                "step": step,
                "code": int(code),
                "dur": int(dur),
                "started": started,
                "ended": ended,
                "workdir": workdir,
                "logfile": logfile,
            }
        )

passed = sum(1 for r in rows if r["code"] == 0)
failed = sum(1 for r in rows if r["code"] != 0)
status = "GREEN" if failed == 0 else "RED"

table_rows = []
for r in rows:
    klass = "ok" if r["code"] == 0 else "bad"
    table_rows.append(
        "<tr class='{klass}'><td>{step}</td><td>{code}</td><td>{dur}s</td>"
        "<td>{started}</td><td>{ended}</td><td>{workdir}</td><td>{logfile}</td></tr>".format(
            klass=klass,
            step=html.escape(r["step"]),
            code=r["code"],
            dur=r["dur"],
            started=html.escape(r["started"]),
            ended=html.escape(r["ended"]),
            workdir=html.escape(r["workdir"]),
            logfile=html.escape(r["logfile"]),
        )
    )

doc = f"""<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>WaiAgents Cycle {cycle} Report</title>
  <style>
    body {{ font-family: Menlo, Monaco, monospace; margin: 24px; background: #fafafa; color: #222; }}
    h1 {{ margin: 0 0 8px; }}
    .meta {{ margin-bottom: 18px; }}
    .badge {{ display: inline-block; padding: 4px 10px; border-radius: 999px; font-weight: 700; }}
    .green {{ background: #d9f9e5; color: #0f6a37; }}
    .red {{ background: #ffdfe0; color: #8a1f25; }}
    table {{ width: 100%; border-collapse: collapse; background: #fff; }}
    th, td {{ border: 1px solid #ddd; padding: 8px; font-size: 12px; text-align: left; vertical-align: top; }}
    th {{ background: #f0f0f0; }}
    tr.ok td {{ background: #f7fff9; }}
    tr.bad td {{ background: #fff6f6; }}
  </style>
</head>
<body>
  <h1>Cycle {cycle} Report</h1>
  <div class="meta">
    <span class="badge {'green' if failed == 0 else 'red'}">{status}</span>
    <span>Passed: {passed}</span>
    <span>Failed: {failed}</span>
  </div>
  <table>
    <thead>
      <tr>
        <th>Step</th><th>Exit</th><th>Duration</th><th>Started</th><th>Ended</th><th>Workdir</th><th>Log</th>
      </tr>
    </thead>
    <tbody>
      {''.join(table_rows)}
    </tbody>
  </table>
</body>
</html>
"""

with open(report_html, "w", encoding="utf-8") as f:
    f.write(doc)
PY
}

capture_cycle_screenshots() {
  local cycle_dir="$1"
  local screenshot_dir="$cycle_dir/screenshots"
  mkdir -p "$screenshot_dir"

  if ! command -v npx >/dev/null 2>&1; then
    log "Cycle $CURRENT_CYCLE: npx not found; screenshot capture skipped"
    return 0
  fi

  local report_url="file://$cycle_dir/report.html"
  npx playwright screenshot --wait-for-timeout=1000 "$report_url" \
    "$screenshot_dir/cycle_report.png" >"$cycle_dir/screenshot_report.log" 2>&1 || true

  npx playwright screenshot --wait-for-timeout=1500 "${UI_BASE_URL}/api/v1/health" \
    "$screenshot_dir/api_health.png" >"$cycle_dir/screenshot_health.log" 2>&1 || true
}

write_cycle_summary_json() {
  local cycle_dir="$1"
  local cycle_status="$2"
  local failures="$3"
  local duration="$4"
  local started="$5"
  local ended="$6"

  python3 - "$cycle_dir/steps.tsv" "$cycle_dir/cycle_summary.json" "$CURRENT_CYCLE" "$cycle_status" "$failures" "$duration" "$started" "$ended" <<'PY'
import json
import sys

steps_tsv, out_file, cycle, status, failures, duration, started, ended = sys.argv[1:9]
steps = []
with open(steps_tsv, "r", encoding="utf-8") as f:
    for line in f:
        if line.startswith("step\t"):
            continue
        step, code, dur, s, e, workdir, logfile = line.rstrip("\n").split("\t")
        steps.append(
            {
                "step": step,
                "exit_code": int(code),
                "duration_seconds": int(dur),
                "started_at": s,
                "ended_at": e,
                "workdir": workdir,
                "log_file": logfile,
            }
        )

doc = {
    "cycle": int(cycle),
    "status": status,
    "failures": int(failures),
    "duration_seconds": int(duration),
    "started_at": started,
    "ended_at": ended,
    "steps": steps,
}
with open(out_file, "w", encoding="utf-8") as f:
    json.dump(doc, f, indent=2)
PY
}

write_run_summary_json() {
  python3 - "$CYCLES_TSV" "$RUN_DIR/run_summary.json" "$RUN_DIR" <<'PY'
import json
import sys

cycles_tsv, out_file, run_dir = sys.argv[1:4]
cycles = []
with open(cycles_tsv, "r", encoding="utf-8") as f:
    for line in f:
        if line.startswith("cycle\t"):
            continue
        cycle, status, failures, duration, started, ended, path = line.rstrip("\n").split("\t")
        cycles.append(
            {
                "cycle": int(cycle),
                "status": status,
                "failures": int(failures),
                "duration_seconds": int(duration),
                "started_at": started,
                "ended_at": ended,
                "path": path,
            }
        )

green = sum(1 for c in cycles if c["status"] == "green")
red = sum(1 for c in cycles if c["status"] == "red")
summary = {
    "run_dir": run_dir,
    "total_cycles": len(cycles),
    "green_cycles": green,
    "red_cycles": red,
    "cycles": cycles,
}
with open(out_file, "w", encoding="utf-8") as f:
    json.dump(summary, f, indent=2)
PY
}

ensure_executable "$SCRIPT_DIR/run_all.sh"
ensure_executable "$SCRIPT_DIR/soak_test.sh"

LOOP_SECONDS="$(python3 - "$LOOP_HOURS" <<'PY'
import math
import sys
hours = float(sys.argv[1])
print(max(0, math.floor(hours * 3600)))
PY
)"

RUN_START_S="$(date +%s)"
RUN_END_S=$((RUN_START_S + LOOP_SECONDS))

log "Continuous run started"
log "Run directory: $RUN_DIR"
log "Base URL: $BASE_URL"
log "Target duration: ${LOOP_HOURS}h (${LOOP_SECONDS}s)"
log "Local tests: $RUN_LOCAL_TESTS (every $LOCAL_TESTS_EVERY_CYCLES cycle(s))"
log "Soak tests: $RUN_SOAK (every $SOAK_EVERY_CYCLES cycle(s), ${SOAK_DURATION_HOURS}h)"
log "Screenshots: $ENABLE_SCREENSHOTS"

CURRENT_CYCLE=0
while true; do
  NOW_S="$(date +%s)"
  if (( NOW_S >= RUN_END_S )); then
    log "Reached target duration."
    break
  fi
  if (( MAX_CYCLES > 0 && CURRENT_CYCLE >= MAX_CYCLES )); then
    log "Reached max cycles ($MAX_CYCLES)."
    break
  fi

  CURRENT_CYCLE=$((CURRENT_CYCLE + 1))
  CYCLE_NAME="$(printf "cycle_%04d" "$CURRENT_CYCLE")"
  CYCLE_DIR="$RUN_DIR/$CYCLE_NAME"
  mkdir -p "$CYCLE_DIR"
  printf "step\texit_code\tduration_seconds\tstarted_at\tended_at\tworkdir\tlog_file\n" > "$CYCLE_DIR/steps.tsv"

  CYCLE_STARTED_AT="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  CYCLE_START_S="$(date +%s)"
  CYCLE_FAILURES=0

  log "Cycle $CURRENT_CYCLE started"

  run_api_suite_with_retries "$CYCLE_DIR" "$PHASE_RETRY_COUNT" || CYCLE_FAILURES=$((CYCLE_FAILURES + 1))

  if (( RUN_LOCAL_TESTS == 1 )) && (( CURRENT_CYCLE % LOCAL_TESTS_EVERY_CYCLES == 0 )); then
    run_step "$CYCLE_DIR" "mix_test" "$UMBRELLA_DIR" "mix test" "$CYCLE_DIR/mix_test.log" || CYCLE_FAILURES=$((CYCLE_FAILURES + 1))
    run_step "$CYCLE_DIR" "swift_test" "$SWIFT_DIR" "swift test" "$CYCLE_DIR/swift_test.log" || CYCLE_FAILURES=$((CYCLE_FAILURES + 1))
    run_step "$CYCLE_DIR" "pytest" "$RUNTIME_DIR" "uv run pytest" "$CYCLE_DIR/pytest.log" || CYCLE_FAILURES=$((CYCLE_FAILURES + 1))
  fi

  if (( RUN_SOAK == 1 )) && (( CURRENT_CYCLE % SOAK_EVERY_CYCLES == 0 )); then
    local_soak_cmd="SOAK_DURATION_HOURS=$SOAK_DURATION_HOURS ./soak_test.sh"
    run_step "$CYCLE_DIR" "soak_test" "$SCRIPT_DIR" "$local_soak_cmd" "$CYCLE_DIR/soak_test.log" || CYCLE_FAILURES=$((CYCLE_FAILURES + 1))
  fi

  generate_cycle_report_html "$CYCLE_DIR"
  if (( ENABLE_SCREENSHOTS == 1 )); then
    capture_cycle_screenshots "$CYCLE_DIR"
  fi

  if [[ -n "$DEPLOY_TRIGGER_CMD" && $CYCLE_FAILURES -eq 0 ]]; then
    run_step "$CYCLE_DIR" "deploy_hook" "$REPO_ROOT" "$DEPLOY_TRIGGER_CMD" "$CYCLE_DIR/deploy_hook.log" || CYCLE_FAILURES=$((CYCLE_FAILURES + 1))
  fi

  if [[ -n "$FIX_HOOK_CMD" && $CYCLE_FAILURES -gt 0 ]]; then
    run_step "$CYCLE_DIR" "fix_hook" "$REPO_ROOT" "$FIX_HOOK_CMD" "$CYCLE_DIR/fix_hook.log" || true
  fi

  CYCLE_END_S="$(date +%s)"
  CYCLE_ENDED_AT="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  CYCLE_DURATION=$((CYCLE_END_S - CYCLE_START_S))
  CYCLE_STATUS="green"
  if (( CYCLE_FAILURES > 0 )); then
    CYCLE_STATUS="red"
  fi

  printf "%s\t%s\t%s\t%s\t%s\t%s\t%s\n" \
    "$CURRENT_CYCLE" "$CYCLE_STATUS" "$CYCLE_FAILURES" "$CYCLE_DURATION" \
    "$CYCLE_STARTED_AT" "$CYCLE_ENDED_AT" "$CYCLE_DIR" >> "$CYCLES_TSV"
  write_cycle_summary_json "$CYCLE_DIR" "$CYCLE_STATUS" "$CYCLE_FAILURES" "$CYCLE_DURATION" "$CYCLE_STARTED_AT" "$CYCLE_ENDED_AT"

  log "Cycle $CURRENT_CYCLE finished with status=$CYCLE_STATUS failures=$CYCLE_FAILURES duration=${CYCLE_DURATION}s"

  NOW_S="$(date +%s)"
  if (( NOW_S < RUN_END_S )); then
    sleep "$CYCLE_DELAY_SECONDS"
  fi
done

write_run_summary_json
log "Continuous run complete. Summary: $RUN_DIR/run_summary.json"
log "Cycle table: $CYCLES_TSV"

RED_CYCLES="$(awk -F'\t' 'NR>1 && $2=="red" {c+=1} END {print c+0}' "$CYCLES_TSV")"
if (( FAIL_ON_RED == 1 && RED_CYCLES > 0 )); then
  exit 1
fi
exit 0
