#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")"/.. && pwd)"
cd "$project_root"

compose_cmd=""
if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
  compose_cmd=(docker compose)
elif command -v docker-compose >/dev/null 2>&1; then
  compose_cmd=(docker-compose)
else
  echo "Error: ni 'docker compose' ni 'docker-compose' está disponible en este sistema." >&2
  exit 1
fi

ensure_daemon() {
  local check_cmd=(docker info)
  if ! command -v docker >/dev/null 2>&1; then
    check_cmd=(docker-compose ps)
  fi

  if ! "${check_cmd[@]}" >/dev/null 2>&1; then
    local hint="Asegúrate de que el daemon de Docker esté en ejecución y que tengas permisos para acceder a él."
    case "$(uname -s)" in
      MINGW*|MSYS*|CYGWIN*)
        hint+=" En Windows, inicia Docker Desktop y espera a que muestre el estado 'Running'."
        ;;
    esac
    echo "Error: no se pudo conectar con el daemon de Docker." >&2
    echo "$hint" >&2
    exit 1
  fi
}

ensure_daemon

"${compose_cmd[@]}" up --build -d "$@"

