#!/usr/bin/env bash
set -Eeuo pipefail

readonly root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
readonly project_name="${MIRTHSPOOL_ACCEPTANCE_PROJECT:-mirthspool-release-acceptance}"
readonly http_port="${MIRTHSPOOL_ACCEPTANCE_HTTP_PORT:-53170}"
readonly web_image="${MIRTHSPOOL_WEB_IMAGE:-mirthspool-web:release-acceptance}"
readonly worker_image="${MIRTHSPOOL_WORKER_IMAGE:-mirthspool-worker:release-acceptance}"
readonly compose_files=(-f compose.yaml -f compose.release.yaml)
readonly build_version="${BUILD_VERSION:-$(node -p "JSON.parse(require('node:fs').readFileSync('package.json', 'utf8')).version")}"
readonly build_revision="${BUILD_REVISION:-acceptance}"

export APP_ENCRYPTION_KEY="${APP_ENCRYPTION_KEY:-bWlydGhzcG9vbC1yZWxlYXNlLXRlc3Qta2V5LTAwMDE=}"
export COMPOSE_PROJECT_NAME="$project_name"
export MIRTHSPOOL_AUTH_SECRET="${MIRTHSPOOL_AUTH_SECRET:-release-acceptance-auth-secret-000000000}"
export MIRTHSPOOL_SETUP_TOKEN="${MIRTHSPOOL_SETUP_TOKEN:-$(openssl rand -base64 32 | tr -d '\n')}"
export MIRTHSPOOL_TRUSTED_PROXY_SECRET="${MIRTHSPOOL_TRUSTED_PROXY_SECRET:-$(openssl rand -base64 32 | tr -d '\n')}"
export MIRTHSPOOL_DATABASE_PASSWORD="${MIRTHSPOOL_DATABASE_PASSWORD:-release-acceptance-database-password}"
export MIRTHSPOOL_HTTP_PORT="$http_port"
export MIRTHSPOOL_PUBLIC_ORIGIN="http://127.0.0.1:${http_port}"
export MIRTHSPOOL_WEB_IMAGE="$web_image"
export MIRTHSPOOL_WORKER_IMAGE="$worker_image"

compose() {
  docker compose "${compose_files[@]}" "$@"
}

cleanup() {
  compose down --volumes --remove-orphans >/dev/null 2>&1 || true
}
trap cleanup EXIT

cd "$root_dir"
cleanup

if [[ "${MIRTHSPOOL_ACCEPTANCE_SKIP_BUILD:-false}" != "true" ]]; then
  docker build --build-arg BUILD_VERSION="$build_version" --build-arg BUILD_REVISION="$build_revision" \
    --tag "$web_image" --file apps/web/Dockerfile .
  docker build --build-arg BUILD_VERSION="$build_version" --build-arg BUILD_REVISION="$build_revision" \
    --tag "$worker_image" --file apps/worker/Dockerfile .
fi

compose up --detach --wait postgres redis
compose --profile tools run --rm migrate
compose up --detach --wait web worker

node -e "fetch('http://127.0.0.1:${http_port}/api/health/ready').then(async response => { if (!response.ok) throw new Error(await response.text()); console.log('release readiness check passed'); }).catch(error => { console.error(error); process.exit(1); })"

if [[ -n "${MIRTHSPOOL_PREVIOUS_WEB_IMAGE:-}" && -n "${MIRTHSPOOL_PREVIOUS_WORKER_IMAGE:-}" ]]; then
  cleanup
  MIRTHSPOOL_WEB_IMAGE="$web_image"
  MIRTHSPOOL_WORKER_IMAGE="$worker_image"
  export MIRTHSPOOL_WEB_IMAGE MIRTHSPOOL_WORKER_IMAGE
  compose up --detach --wait postgres redis
  compose --profile tools run --rm migrate
  MIRTHSPOOL_WEB_IMAGE="$MIRTHSPOOL_PREVIOUS_WEB_IMAGE"
  MIRTHSPOOL_WORKER_IMAGE="$MIRTHSPOOL_PREVIOUS_WORKER_IMAGE"
  export MIRTHSPOOL_WEB_IMAGE MIRTHSPOOL_WORKER_IMAGE
  compose up --detach --wait web worker
  node -e "fetch('http://127.0.0.1:${http_port}/api/health/ready').then(response => { if (!response.ok) throw new Error('previous release readiness failed'); console.log('previous release readiness check passed'); }).catch(error => { console.error(error); process.exit(1); })"
  compose stop web worker
  MIRTHSPOOL_WEB_IMAGE="$web_image"
  MIRTHSPOOL_WORKER_IMAGE="$worker_image"
  export MIRTHSPOOL_WEB_IMAGE MIRTHSPOOL_WORKER_IMAGE
  compose --profile tools run --rm migrate
  compose up --detach --wait web worker
  node -e "fetch('http://127.0.0.1:${http_port}/api/health/ready').then(response => { if (!response.ok) throw new Error('upgrade readiness failed'); console.log('upgrade readiness check passed'); }).catch(error => { console.error(error); process.exit(1); })"
fi

echo "release acceptance passed"
