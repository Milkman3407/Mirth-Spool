#!/bin/sh
set -eu

backup=${1:?usage: scripts/verify-backup.sh BACKUP_DIRECTORY}
test -f "$backup/database.dump"
test -f "$backup/media-cache.tar.gz"
test -f "$backup/SHA256SUMS"
(cd "$backup" && sha256sum --check SHA256SUMS)
docker compose exec -T postgres pg_restore --list < "$backup/database.dump" > /dev/null
tar -tzf "$backup/media-cache.tar.gz" > /dev/null
printf '%s\n' 'backup artifact is structurally valid'
