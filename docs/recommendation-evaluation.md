# Recommendation evaluation

MirthSpool recommendations are deterministic and local. They use only a
bounded, per-user aggregate of favorites, hides, meaningful views, source IDs,
tag slugs, media kinds, and freshness. No activity or derived feature leaves
the instance.

Run `pnpm test:recommendations:eval` to execute the reproducible synthetic
offline evaluation. The gate requires zero duplicate IDs, at most 60% source
concentration, mean freshness of at most 24 hours, and at least 75% agreement
with synthetic explicit preferences.

The live candidate query is capped at 500 items. Profile refreshes process at
most 100 users per job and 5,000 action rows per user, retaining at most 100
features in each category. The admin metrics endpoint reports only aggregate
profile, stale-profile, and truncation counts.

## Migration and rollback notes

Migration `20260723210000_recommendations` adds two preference columns, a
per-user aggregate table, and an index used to select stale profiles. It does
not backfill or scan user actions; profiles are populated later by the bounded
worker job. The non-null boolean column has a constant default, so operators
should still schedule the normal brief schema-change window for PostgreSQL
table locking on large `UserPreference` tables.

To roll back, first deploy an application version that does not read the M19
schema, then drop `RecommendationProfile` (including its index and foreign key)
and remove `recommendationsEnabled` and `recommendationResetAt` from
`UserPreference`. This discards only derived recommendation profiles and reset
timestamps; favorites, hides, and view history remain intact. Applied Prisma
migrations must not be edited or removed.
