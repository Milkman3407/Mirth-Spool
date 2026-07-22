#!/bin/sh
set -eu

docker compose restart worker
docker compose ps --status running worker | grep -q worker
docker compose restart redis
docker compose ps --status running redis | grep -q redis
docker compose exec -T postgres psql --username=mirthspool --dbname=mirthspool --set=ON_ERROR_STOP=1 --command='SELECT "sourceId", "externalId", count(*) FROM "SourcePost" GROUP BY 1,2 HAVING count(*) > 1' | grep -q '(0 rows)'
printf '%s\n' 'worker and Redis restart recovery passed; source identity uniqueness remains intact'
