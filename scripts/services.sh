#!/usr/bin/env bash
#
# Meeting Intelligence — service manager
#
# Usage:
#   ./scripts/services.sh status
#   ./scripts/services.sh start [api|client|postgres|all]
#   ./scripts/services.sh stop  [api|client|postgres|all]
#   ./scripts/services.sh restart [api|client|postgres|all]
#
# Or from project root:
#   npm run services -- status
#   npm run services -- restart all

set -u

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN_DIR="$ROOT_DIR/.run"
ENV_FILE="$ROOT_DIR/server/.env"

API_PORT="${API_PORT:-3001}"
CLIENT_PORT="${CLIENT_PORT:-5173}"
PGHOST="${PGHOST:-localhost}"
PGPORT="${PGPORT:-5432}"
PGDATABASE="${PGDATABASE:-meeting_intelligence}"
PGUSER="${PGUSER:-}"

API_PID_FILE="$RUN_DIR/api.pid"
CLIENT_PID_FILE="$RUN_DIR/client.pid"
API_LOG="$RUN_DIR/api.log"
CLIENT_LOG="$RUN_DIR/client.log"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
RESET='\033[0m'

load_env() {
  if [[ -f "$ENV_FILE" ]]; then
    # shellcheck disable=SC1090
    set -a
    source <(grep -E '^[A-Za-z_][A-Za-z0-9_]*=' "$ENV_FILE" | sed 's/\r$//')
    set +a
    API_PORT="${PORT:-$API_PORT}"
    PGHOST="${PGHOST:-localhost}"
    PGPORT="${PGPORT:-5432}"
    PGDATABASE="${PGDATABASE:-meeting_intelligence}"
  fi
}

info()  { echo -e "${BLUE}→${RESET} $*"; }
ok()    { echo -e "${GREEN}✓${RESET} $*"; }
warn()  { echo -e "${YELLOW}!${RESET} $*"; }
fail()  { echo -e "${RED}✗${RESET} $*"; }

port_pids() {
  local port="$1"
  lsof -ti "tcp:${port}" -sTCP:LISTEN 2>/dev/null || true
}

pid_alive() {
  local pid="$1"
  [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null
}

api_healthy() {
  curl -sf "http://127.0.0.1:${API_PORT}/health" >/dev/null 2>&1
}

client_healthy() {
  curl -sf "http://127.0.0.1:${CLIENT_PORT}/" >/dev/null 2>&1
}

postgres_healthy() {
  if ! command -v pg_isready >/dev/null 2>&1; then
    return 1
  fi
  local args=(-h "$PGHOST" -p "$PGPORT")
  [[ -n "$PGUSER" ]] && args+=(-U "$PGUSER")
  [[ -n "$PGDATABASE" ]] && args+=(-d "$PGDATABASE")
  pg_isready "${args[@]}" >/dev/null 2>&1
}

service_state() {
  local name="$1"
  case "$name" in
    api)
      if api_healthy; then
        echo "running"
      elif [[ -n "$(port_pids "$API_PORT")" ]]; then
        echo "unhealthy"
      else
        echo "stopped"
      fi
      ;;
    client)
      if client_healthy; then
        echo "running"
      elif [[ -n "$(port_pids "$CLIENT_PORT")" ]]; then
        echo "unhealthy"
      else
        echo "stopped"
      fi
      ;;
    postgres)
      if postgres_healthy; then
        echo "running"
      else
        echo "stopped"
      fi
      ;;
  esac
}

print_status_line() {
  local name="$1"
  local label="$2"
  local detail="$3"
  local state
  state="$(service_state "$name")"

  local color="$RED"
  local icon="✗"
  case "$state" in
    running)   color="$GREEN"; icon="✓" ;;
    unhealthy) color="$YELLOW"; icon="!" ;;
  esac

  printf "  ${color}${icon}${RESET} %-10s %-10s %s\n" "$label" "$state" "$detail"
}

cmd_status() {
  load_env
  echo ""
  echo -e "${BOLD}Meeting Intelligence — service status${RESET}"
  echo "  Project: $ROOT_DIR"
  echo ""

  print_status_line api "API" "http://localhost:${API_PORT}  (/health)"
  print_status_line client "Client" "http://localhost:${CLIENT_PORT}"
  print_status_line postgres "PostgreSQL" "${PGHOST}:${PGPORT}/${PGDATABASE} (user: ${PGUSER:-—})"

  echo ""
  if [[ -f "$API_LOG" ]]; then
    echo "  Logs: $API_LOG"
    echo "        $CLIENT_LOG"
  fi
  echo ""
}

wait_for() {
  local name="$1"
  local check_fn="$2"
  local timeout="${3:-30}"
  local i=0

  while (( i < timeout )); do
    if $check_fn; then
      ok "$name is up"
      return 0
    fi
    sleep 1
    (( i++ )) || true
  done

  fail "$name did not become ready within ${timeout}s (check logs in $RUN_DIR)"
  return 1
}

kill_port() {
  local port="$1"
  local label="$2"
  local pids
  pids="$(port_pids "$port")"

  if [[ -z "$pids" ]]; then
    info "$label not running on port $port"
    return 0
  fi

  info "Stopping $label (port $port)…"
  # shellcheck disable=SC2086
  kill -TERM $pids 2>/dev/null || true
  sleep 1

  pids="$(port_pids "$port")"
  if [[ -n "$pids" ]]; then
    # shellcheck disable=SC2086
    kill -KILL $pids 2>/dev/null || true
  fi

  ok "$label stopped"
}

start_api() {
  load_env
  if api_healthy; then
    warn "API already running on port $API_PORT"
    return 0
  fi

  local existing
  existing="$(port_pids "$API_PORT")"
  if [[ -n "$existing" ]]; then
    fail "Port $API_PORT is in use but /health failed. Run: $0 stop api"
    return 1
  fi

  mkdir -p "$RUN_DIR"
  info "Starting API on port ${API_PORT}…"
  (
    cd "$ROOT_DIR" || exit 1
    nohup npm run dev --workspace=server >>"$API_LOG" 2>&1 &
    echo $! >"$API_PID_FILE"
  )

  wait_for "API" api_healthy 45
}

start_client() {
  load_env
  if client_healthy; then
    warn "Client already running on port $CLIENT_PORT"
    return 0
  fi

  local existing
  existing="$(port_pids "$CLIENT_PORT")"
  if [[ -n "$existing" ]]; then
    fail "Port $CLIENT_PORT is in use but app is not responding. Run: $0 stop client"
    return 1
  fi

  mkdir -p "$RUN_DIR"
  info "Starting client on port ${CLIENT_PORT}…"
  (
    cd "$ROOT_DIR" || exit 1
    nohup npm run dev --workspace=client >>"$CLIENT_LOG" 2>&1 &
    echo $! >"$CLIENT_PID_FILE"
  )

  wait_for "Client" client_healthy 45
}

detect_postgres_brew_service() {
  if ! command -v brew >/dev/null 2>&1; then
    return 1
  fi

  local svc
  for svc in postgresql@17 postgresql@16 postgresql@15 postgresql@14 postgresql; do
    if brew services list 2>/dev/null | grep -q "^${svc}[[:space:]]"; then
      echo "$svc"
      return 0
    fi
  done

  # Installed but maybe not in services list yet
  for svc in postgresql@17 postgresql@16 postgresql@15 postgresql@14 postgresql; do
    if brew list "$svc" &>/dev/null; then
      echo "$svc"
      return 0
    fi
  done

  return 1
}

start_postgres() {
  load_env
  if postgres_healthy; then
    warn "PostgreSQL already accepting connections"
    return 0
  fi

  if command -v brew >/dev/null 2>&1; then
    local svc
    if svc="$(detect_postgres_brew_service)"; then
      info "Starting PostgreSQL via Homebrew ($svc)…"
      brew services start "$svc"
      wait_for "PostgreSQL" postgres_healthy 30
      return $?
    fi
  fi

  fail "Could not start PostgreSQL automatically."
  echo "  Start it manually, e.g.:"
  echo "    brew services start postgresql@16"
  echo "    pg_ctl -D /usr/local/var/postgres start"
  return 1
}

stop_api() {
  load_env
  kill_port "$API_PORT" "API"
  rm -f "$API_PID_FILE"
}

stop_client() {
  load_env
  kill_port "$CLIENT_PORT" "Client"
  rm -f "$CLIENT_PID_FILE"
}

stop_postgres() {
  load_env
  if ! postgres_healthy; then
    info "PostgreSQL is not running"
    return 0
  fi

  if command -v brew >/dev/null 2>&1; then
    local svc
    if svc="$(detect_postgres_brew_service)"; then
      info "Stopping PostgreSQL via Homebrew ($svc)…"
      brew services stop "$svc"
      ok "PostgreSQL stopped"
      return 0
    fi
  fi

  warn "PostgreSQL is running but no Homebrew service was detected."
  echo "  Stop it manually with brew services stop postgresql@<version>"
  return 1
}

run_action() {
  local action="$1"
  local target="${2:-all}"

  case "$target" in
    api|client|postgres|all) ;;
    *)
      fail "Unknown service: $target"
      usage
      return 1
      ;;
  esac

  case "$action" in
    start)
      case "$target" in
        api)      start_api ;;
        client)   start_client ;;
        postgres) start_postgres ;;
        all)
          start_postgres || true
          start_api
          start_client
          echo ""
          cmd_status
          ;;
      esac
      ;;
    stop)
      case "$target" in
        api)      stop_api ;;
        client)   stop_client ;;
        postgres) stop_postgres ;;
        all)
          stop_client
          stop_api
          info "PostgreSQL left running (use '$0 stop postgres' to stop it)"
          echo ""
          cmd_status
          ;;
      esac
      ;;
    restart)
      case "$target" in
        api)
          stop_api
          start_api
          ;;
        client)
          stop_client
          start_client
          ;;
        postgres)
          stop_postgres || true
          start_postgres
          ;;
        all)
          stop_client
          stop_api
          start_postgres || true
          start_api
          start_client
          echo ""
          cmd_status
          ;;
      esac
      ;;
    *)
      fail "Unknown action: $action"
      usage
      return 1
      ;;
  esac
}

usage() {
  cat <<EOF

${BOLD}Usage:${RESET}
  $0 status
  $0 start   [api|client|postgres|all]
  $0 stop    [api|client|postgres|all]
  $0 restart [api|client|postgres|all]

${BOLD}Examples:${RESET}
  $0 status
  $0 start all          # postgres + API + client
  $0 restart api
  $0 stop client

${BOLD}npm:${RESET}
  npm run services -- status
  npm run services -- restart all

${BOLD}Notes:${RESET}
  - API default:  http://localhost:3001
  - Client default: http://localhost:5173
  - Logs: $RUN_DIR/
  - PostgreSQL reads server/.env (PGHOST, PGPORT, PGUSER, PGDATABASE)

EOF
}

main() {
  local cmd="${1:-}"
  local target="${2:-all}"

  case "$cmd" in
    status|"") cmd_status ;;
    start|stop|restart) run_action "$cmd" "$target" ;;
    -h|--help|help) usage ;;
    *)
      fail "Unknown command: $cmd"
      usage
      exit 1
      ;;
  esac
}

main "$@"
