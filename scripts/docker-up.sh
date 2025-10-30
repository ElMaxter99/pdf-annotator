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

"${compose_cmd[@]}" up --build -d "$@"

