#!/bin/sh
set -eu

umask 077
backup=${1:?usage: MIRTHSPOOL_RESTORE_CONFIRM=EMPTY_TARGET scripts/restore.sh BACKUP_DIRECTORY}
test "${MIRTHSPOOL_RESTORE_CONFIRM:-}" = EMPTY_TARGET || {
  echo "refusing restore without MIRTHSPOOL_RESTORE_CONFIRM=EMPTY_TARGET" >&2
  exit 2
}
scripts/verify-backup.sh "$backup"

existing=$(docker compose exec -T postgres psql --username=mirthspool --dbname=mirthspool --tuples-only --no-align --command="SELECT count(*) FROM pg_catalog.pg_tables WHERE schemaname = 'public' AND tablename = 'User'")
test "$existing" = 0 || { echo "target database is not empty" >&2; exit 3; }
docker compose exec -T postgres pg_restore --username=mirthspool --dbname=mirthspool --clean --if-exists --no-owner --no-privileges < "$backup/database.dump"
docker compose run --rm --no-deps -T worker sh -c 'test -z "$(find /var/lib/mirthspool/media/objects -type f -print -quit 2>/dev/null)"'
docker compose run --rm --no-deps -T worker tar -C /var/lib/mirthspool/media -xzf - < "$backup/media-cache.tar.gz"
scripts/reconcile-cache.sh
docker compose exec -T postgres psql --username=mirthspool --dbname=mirthspool --set=ON_ERROR_STOP=1 --command='SELECT count(*) AS users FROM "User"; SELECT count(*) AS sources FROM "Source"; SELECT count(*) AS content FROM "ContentItem"; SELECT count(*) AS actions FROM "UserAction";'
printf '%s\n' 'restore completed; credential decryption still requires the original external APP_ENCRYPTION_KEY'
