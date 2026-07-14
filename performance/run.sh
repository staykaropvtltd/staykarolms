#!/usr/bin/env bash
# performance/run.sh
# Runs the full StayKaro LMS performance suite.
# Usage: ./run.sh [scenario]  — omit scenario to run all.
# Example: ./run.sh baseline
#          ./run.sh load
#          ./run.sh all
#
# Prerequisites: k6 installed (https://k6.io/docs/getting-started/installation/)
#   macOS:  brew install k6
#   Linux:  sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg \
#             --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
#           echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" \
#             | sudo tee /etc/apt/sources.list.d/k6.list
#           sudo apt-get update && sudo apt-get install k6

set -e

SCENARIO="${1:-all}"
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPORT_DIR="${DIR}/reports"
mkdir -p "${REPORT_DIR}"

# ── Load environment ─────────────────────────────────────────
ENV_FILE="${DIR}/.env"
if [ ! -f "${ENV_FILE}" ]; then
  echo "ERROR: ${ENV_FILE} not found. Copy .env.example and fill in credentials."
  exit 1
fi

set -a
# shellcheck source=/dev/null
source "${ENV_FILE}"
set +a

BASE_URL="${BASE_URL:-http://localhost:3001}"
echo "▶ Target: ${BASE_URL}"
echo "▶ Reports: ${REPORT_DIR}"
echo ""

K6_OPTS="-e BASE_URL=${BASE_URL}"
K6_OPTS="${K6_OPTS} -e STUDENT_EMAIL=${STUDENT_EMAIL:-}"
K6_OPTS="${K6_OPTS} -e STUDENT_PASSWORD=${STUDENT_PASSWORD:-}"
K6_OPTS="${K6_OPTS} -e FACULTY_EMAIL=${FACULTY_EMAIL:-}"
K6_OPTS="${K6_OPTS} -e FACULTY_PASSWORD=${FACULTY_PASSWORD:-}"
K6_OPTS="${K6_OPTS} -e ADMIN_EMAIL=${ADMIN_EMAIL:-}"
K6_OPTS="${K6_OPTS} -e ADMIN_PASSWORD=${ADMIN_PASSWORD:-}"
K6_OPTS="${K6_OPTS} -e SUPER_ADMIN_EMAIL=${SUPER_ADMIN_EMAIL:-}"
K6_OPTS="${K6_OPTS} -e SUPER_ADMIN_PASSWORD=${SUPER_ADMIN_PASSWORD:-}"
K6_OPTS="${K6_OPTS} -e THINK_TIME_MIN=${THINK_TIME_MIN:-1}"
K6_OPTS="${K6_OPTS} -e THINK_TIME_MAX=${THINK_TIME_MAX:-3}"
K6_OPTS="${K6_OPTS} -e REPORT_DIR=reports"

run_scenario() {
  local name="$1"
  local file="${DIR}/scenarios/${name}.js"
  if [ ! -f "${file}" ]; then
    echo "ERROR: Scenario file not found: ${file}"
    return 1
  fi
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "  Running: ${name}"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  # shellcheck disable=SC2086
  k6 run ${K6_OPTS} "${file}"
  echo ""
}

case "${SCENARIO}" in
  baseline) run_scenario baseline ;;
  load)     run_scenario load     ;;
  stress)   run_scenario stress   ;;
  spike)    run_scenario spike    ;;
  soak)     run_scenario soak     ;;
  all)
    run_scenario baseline
    echo "Cooling down 30s before load test..."
    sleep 30
    run_scenario load
    echo "Cooling down 60s before stress test..."
    sleep 60
    run_scenario stress
    echo "Cooling down 60s before spike test..."
    sleep 60
    run_scenario spike
    echo "Cooling down 60s before soak test..."
    sleep 60
    run_scenario soak
    ;;
  *)
    echo "Unknown scenario: ${SCENARIO}"
    echo "Valid options: baseline | load | stress | spike | soak | all"
    exit 1
    ;;
esac

echo "✓ Done. Reports saved to: ${REPORT_DIR}"
ls -lh "${REPORT_DIR}"/*.html 2>/dev/null || true
