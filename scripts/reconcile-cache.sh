#!/bin/sh
set -eu

missing=$(mktemp)
trap 'rm -f "$missing"' EXIT HUP INT TERM
docker compose exec -T postgres psql --username=mirthspool --dbname=mirthspool --tuples-only --no-align --field-separator='|' --command='SELECT id, "storageKey" FROM "MediaAsset" WHERE "cacheState" = '\''CACHED'\'' AND "storageKey" IS NOT NULL' |
while IFS='|' read -r id key; do
  case "$id:$key" in
    ????????-????-????-????-????????????:objects/*) ;;
    *) echo "invalid cache metadata" >&2; exit 4 ;;
  esac
  docker compose run --rm --no-deps -T worker test -f "/var/lib/mirthspool/media/$key" || printf '%s\n' "$id" >> "$missing"
done
while IFS= read -r id; do
  docker compose exec -T postgres psql --username=mirthspool --dbname=mirthspool --set=ON_ERROR_STOP=1 --variable=id="$id" --command='UPDATE "MediaAsset" SET "cacheState" = '\''EVICTED'\'', "storageKey" = NULL, "cachedAt" = NULL, "lastAccessedAt" = NULL WHERE id = :'\''id'\''::uuid'
done < "$missing"
docker compose run --rm --no-deps -T worker find /var/lib/mirthspool/media/.tmp -type f -name '*.part' -delete 2>/dev/null || true
printf 'cache metadata reconciled; missing_objects=%s\n' "$(wc -l < "$missing" | tr -d ' ')"
