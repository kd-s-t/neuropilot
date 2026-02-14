#!/usr/bin/env bash
set -e

GITHUB_REPO="${GITHUB_REPO:-}"
BRANCH="${BRANCH:-main}"
TARGET_DIR="${TARGET_DIR:-/root/neuropilot}"
SKIP_PULL="${SKIP_PULL:-}"
SKIP_COMPOSE_UP="${SKIP_COMPOSE_UP:-}"

usage() {
  echo "Usage: GITHUB_REPO=owner/repo [BRANCH=main] [TARGET_DIR=/root/neuropilot] $0"
  echo "  Or:   $0 owner/repo [main]"
  echo ""
  echo "Optional env: SKIP_PULL=1 to skip docker login/pull; SKIP_COMPOSE_UP=1 to skip compose up."
  echo "For docker login + pull + compose up, set: VULTR_CR_HOST VULTR_CR_NAME VULTR_CR_USER VULTR_CR_PASSWORD"
  exit 1
}

if [ -n "$1" ]; then
  GITHUB_REPO="$1"
fi
if [ -n "$2" ]; then
  BRANCH="$2"
fi

if [ -z "$GITHUB_REPO" ]; then
  echo "GITHUB_REPO (e.g. owner/neuropilot) is required."
  usage
fi

BASE_URL="https://raw.githubusercontent.com/${GITHUB_REPO}/${BRANCH}"

echo "Target dir: $TARGET_DIR"
echo "Fetching from: $BASE_URL"
mkdir -p "$TARGET_DIR"

curl -sL "${BASE_URL}/docker-compose.vultr.yml" -o "${TARGET_DIR}/docker-compose.vultr.yml"
curl -sL "${BASE_URL}/Caddyfile.template" -o "${TARGET_DIR}/Caddyfile.template"

if ! head -1 "${TARGET_DIR}/docker-compose.vultr.yml" | grep -q '^services:'; then
  echo "Downloaded file is not valid YAML (wrong repo/branch?). Check GITHUB_REPO and BRANCH."
  exit 1
fi

if [ -n "$SKIP_PULL" ]; then
  echo "Skipping docker login and pull (SKIP_PULL=1)."
else
  if [ -z "${VULTR_CR_HOST}" ] || [ -z "${VULTR_CR_NAME}" ] || [ -z "${VULTR_CR_USER}" ] || [ -z "${VULTR_CR_PASSWORD}" ]; then
    echo "Set VULTR_CR_HOST, VULTR_CR_NAME, VULTR_CR_USER, VULTR_CR_PASSWORD to run docker login and pull."
  else
    echo "$VULTR_CR_PASSWORD" | docker login "https://${VULTR_CR_HOST}/${VULTR_CR_NAME}" -u "$VULTR_CR_USER" --password-stdin
    docker pull "${VULTR_CR_HOST}/${VULTR_CR_NAME}/${VULTR_CR_HOST}/backend:latest"
    docker pull "${VULTR_CR_HOST}/${VULTR_CR_NAME}/${VULTR_CR_HOST}/frontend:latest"
  fi
fi

if [ -n "$SKIP_COMPOSE_UP" ]; then
  echo "Skipping compose up (SKIP_COMPOSE_UP=1)."
else
  if [ ! -f "${TARGET_DIR}/.env" ]; then
    echo "No ${TARGET_DIR}/.env found. Create it with at least:"
    echo "  REGISTRY_HOST=${VULTR_CR_HOST:-sgp.vultrcr.com}"
    echo "  REGISTRY_NAME=${VULTR_CR_NAME:-neuropilot/sgp.vultrcr.com}"
    echo "  SERVER_HOST=theneuropilot.com"
    echo "  DATABASE_URL=postgresql://user:password@host:5432/neuropilot"
    echo "  NEXTAUTH_SECRET=<random-string>"
    exit 1
  fi
  cd "$TARGET_DIR" && docker compose -f docker-compose.vultr.yml up -d
  echo "Compose up done. Check: docker ps"
fi
