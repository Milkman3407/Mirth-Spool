#!/bin/sh
set -eu

umask 077
destination=${1:?usage: scripts/backup.sh ABSOLUTE_DESTINATION}
case "$destination" in /*) ;; *) echo "destination must be absolute" >&2; exit 2 ;; esac
mkdir -p "$destination"
work="$destination/.mirthspool-backup-$$"
archive="$destination/mirthspool-$(date -u +%Y%m%dT%H%M%SZ)"
mkdir "$work"
trap 'rm -rf "$work"' EXIT HUP INT TERM

docker compose exec -T postgres pg_dump --username=mirthspool --dbname=mirthspool --format=custom --compress=9 > "$work/database.dump"
docker compose run --rm --no-deps -T worker tar -C /var/lib/mirthspool/media -czf - . > "$work/media-cache.tar.gz"
docker compose exec -T postgres pg_dump --version | sed 's/[^0-9. A-Za-z()-]//g' > "$work/postgres-version.txt"
docker compose config --services > "$work/compose-services.txt"
printf '%s\n' 'APP_ENCRYPTION_KEY is intentionally excluded and must be backed up separately.' > "$work/EXTERNAL_KEY_REQUIRED.txt"
(cd "$work" && sha256sum database.dump media-cache.tar.gz postgres-version.txt compose-services.txt EXTERNAL_KEY_REQUIRED.txt > SHA256SUMS)
mv "$work" "$archive"
trap - EXIT HUP INT TERM
printf '%s\n' "$archive"
