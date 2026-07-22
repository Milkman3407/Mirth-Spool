import {
  Prisma,
  type ContentRating,
  type MediaKind,
  type PrismaClient,
} from "../generated/prisma/client.js";
import { z } from "zod";

import { contentPresentationInclude } from "./user-actions.js";

export interface SearchPosition {
  readonly id: string;
  readonly publishedAt: Date;
  readonly rank: number;
}

export interface SearchQuery {
  readonly allowedRatings: readonly ContentRating[];
  readonly favorite?: boolean;
  readonly from?: Date;
  readonly hidden?: boolean;
  readonly limit: number;
  readonly mediaKinds?: readonly MediaKind[];
  readonly position?: SearchPosition;
  readonly queryText?: string;
  readonly seen?: boolean;
  readonly sourceIds?: readonly string[];
  readonly tags?: readonly string[];
  readonly to?: Date;
  readonly userId: string;
}

type SearchRow = {
  id: string;
  publishedAt: Date;
  rank: number;
};

export async function querySearch(client: PrismaClient, input: SearchQuery) {
  const limit = z.number().int().min(1).max(50).parse(input.limit);
  z.uuid().parse(input.userId);
  if (input.allowedRatings.length === 0) {
    return Object.freeze({ hasMore: false, rows: [] });
  }
  const queryText = input.queryText?.trim();
  const queryExpression = queryText
    ? Prisma.sql`websearch_to_tsquery('simple', ${queryText})`
    : null;
  const rankExpression = queryExpression
    ? Prisma.sql`ts_rank_cd(content."searchVector", ${queryExpression})::float8`
    : Prisma.sql`0::float8`;
  const conditions: Prisma.Sql[] = [
    Prisma.sql`content."status" = 'ACTIVE'::"ContentStatus"`,
    Prisma.sql`content."duplicatePrimary" = true`,
    Prisma.sql`content."contentRating" IN (${Prisma.join(
      input.allowedRatings.map(
        (rating) => Prisma.sql`${rating}::"ContentRating"`,
      ),
    )})`,
  ];
  if (queryExpression) {
    conditions.push(Prisma.sql`content."searchVector" @@ ${queryExpression}`);
  }
  conditions.push(
    input.hidden
      ? Prisma.sql`EXISTS (
          SELECT 1 FROM "UserAction" hidden_action
          WHERE hidden_action."contentItemId" = content.id
            AND hidden_action."userId" = ${input.userId}::uuid
            AND hidden_action.kind = 'HIDE'::"ActionKind"
        )`
      : Prisma.sql`NOT EXISTS (
          SELECT 1 FROM "UserAction" hidden_action
          WHERE hidden_action."contentItemId" = content.id
            AND hidden_action."userId" = ${input.userId}::uuid
            AND hidden_action.kind = 'HIDE'::"ActionKind"
        )`,
  );
  if (input.favorite !== undefined) {
    conditions.push(
      input.favorite
        ? Prisma.sql`EXISTS (
            SELECT 1 FROM "UserAction" favorite_action
            WHERE favorite_action."contentItemId" = content.id
              AND favorite_action."userId" = ${input.userId}::uuid
              AND favorite_action.kind = 'FAVORITE'::"ActionKind"
          )`
        : Prisma.sql`NOT EXISTS (
            SELECT 1 FROM "UserAction" favorite_action
            WHERE favorite_action."contentItemId" = content.id
              AND favorite_action."userId" = ${input.userId}::uuid
              AND favorite_action.kind = 'FAVORITE'::"ActionKind"
          )`,
    );
  }
  if (input.seen !== undefined) {
    conditions.push(
      input.seen
        ? Prisma.sql`EXISTS (
            SELECT 1 FROM "UserAction" seen_action
            WHERE seen_action."contentItemId" = content.id
              AND seen_action."userId" = ${input.userId}::uuid
              AND seen_action.kind = 'VIEW'::"ActionKind"
          )`
        : Prisma.sql`NOT EXISTS (
            SELECT 1 FROM "UserAction" seen_action
            WHERE seen_action."contentItemId" = content.id
              AND seen_action."userId" = ${input.userId}::uuid
              AND seen_action.kind = 'VIEW'::"ActionKind"
          )`,
    );
  }
  if (input.from)
    conditions.push(Prisma.sql`content."publishedAt" >= ${input.from}`);
  if (input.to)
    conditions.push(Prisma.sql`content."publishedAt" <= ${input.to}`);
  if (input.sourceIds?.length) {
    conditions.push(
      Prisma.sql`EXISTS (
        SELECT 1 FROM "SourcePost" source_post
        WHERE source_post."contentItemId" = content.id
          AND source_post."sourceId" IN (${Prisma.join(
            input.sourceIds.map((sourceId) => Prisma.sql`${sourceId}::uuid`),
          )})
      )`,
    );
  }
  if (input.mediaKinds?.length) {
    conditions.push(
      Prisma.sql`EXISTS (
        SELECT 1 FROM "MediaAsset" media
        WHERE media."contentItemId" = content.id
          AND media.kind IN (${Prisma.join(
            input.mediaKinds.map((kind) => Prisma.sql`${kind}::"MediaKind"`),
          )})
      )`,
    );
  }
  for (const tag of input.tags ?? []) {
    conditions.push(
      Prisma.sql`EXISTS (
        SELECT 1
        FROM "ContentTag" content_tag
        JOIN "Tag" tag ON tag.id = content_tag."tagId"
        WHERE content_tag."contentItemId" = content.id
          AND tag.slug = ${tag}
      )`,
    );
  }
  if (input.position) {
    const position = input.position;
    conditions.push(
      Prisma.sql`(
        ${rankExpression} < ${position.rank}
        OR (
          ${rankExpression} = ${position.rank}
          AND content."publishedAt" < ${position.publishedAt}
        )
        OR (
          ${rankExpression} = ${position.rank}
          AND content."publishedAt" = ${position.publishedAt}
          AND content.id < ${position.id}::uuid
        )
      )`,
    );
  }
  const rows = await client.$queryRaw<SearchRow[]>(Prisma.sql`
    SELECT
      content.id,
      content."publishedAt",
      ${rankExpression} AS rank
    FROM "ContentItem" content
    WHERE ${Prisma.join(conditions, " AND ")}
    ORDER BY rank DESC, content."publishedAt" DESC, content.id DESC
    LIMIT ${limit + 1}
  `);
  const selected = rows.slice(0, limit);
  const content = await client.contentItem.findMany({
    include: contentPresentationInclude(input.userId),
    where: { id: { in: selected.map((row) => row.id) } },
  });
  const byId = new Map(content.map((item) => [item.id, item]));
  return Object.freeze({
    hasMore: rows.length > limit,
    rows: selected.flatMap((position) => {
      const item = byId.get(position.id);
      return item ? [{ item, position }] : [];
    }),
  });
}
