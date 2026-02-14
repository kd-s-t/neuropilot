#!/usr/bin/env bash
set -e
cd "$(dirname "$0")/.."

if [ -f scripts/.env.vultr ]; then
  set -a
  source scripts/.env.vultr
  set +a
fi

if [ -z "${VULTR_CR_REGISTRY}" ]; then
  if [ -n "${VULTR_CR_HOST}" ]; then
    case "${VULTR_CR_HOST}" in
      */*) VULTR_CR_REGISTRY="${VULTR_CR_HOST}" ;;
      *)   VULTR_CR_REGISTRY="${VULTR_CR_HOST}/${VULTR_CR_NAME:-neuropilot}" ;;
    esac
  else
    echo "Set VULTR_CR_REGISTRY (e.g. sgp.vultrcr.com/neuropilot) or VULTR_CR_HOST. Optional: source scripts/.env.vultr"
    exit 1
  fi
fi

: "${VULTR_CR_USER:?Set VULTR_CR_USER}"
: "${VULTR_CR_PASSWORD:?Set VULTR_CR_PASSWORD}"
: "${NEXT_PUBLIC_BACKEND_URL:=https://api.theneuropilot.com}"

echo "$VULTR_CR_PASSWORD" | docker login "https://$VULTR_CR_REGISTRY" -u "$VULTR_CR_USER" --password-stdin

docker build --platform linux/amd64 -t "$VULTR_CR_REGISTRY/backend:latest" -f _backend/Dockerfile _backend
docker push "$VULTR_CR_REGISTRY/backend:latest"

docker build --platform linux/amd64 -t "$VULTR_CR_REGISTRY/frontend:latest" \
  --build-arg "NEXT_PUBLIC_BACKEND_URL=$NEXT_PUBLIC_BACKEND_URL" \
  -f _frontend/Dockerfile _frontend
docker push "$VULTR_CR_REGISTRY/frontend:latest"

echo "Pushed backend:latest and frontend:latest to $VULTR_CR_REGISTRY"
