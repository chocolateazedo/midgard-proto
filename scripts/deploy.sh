#!/bin/bash
set -e

APP_DIR="/opt/botflow"

cd "$APP_DIR"

echo "$(date) — Verificando atualizações..."

git fetch origin main

LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse origin/main)

if [ "$LOCAL" = "$REMOTE" ]; then
  echo "$(date) — Sem alterações. Nada a fazer."
  exit 0
fi

echo "$(date) — Nova versão detectada. Atualizando..."

git pull origin main

echo "$(date) — Rebuilding containers..."
docker compose -f docker-compose.prod.yml build --no-cache
docker compose -f docker-compose.prod.yml up -d

# Limpar imagens antigas
docker image prune -f

echo "$(date) — Deploy concluído!"
