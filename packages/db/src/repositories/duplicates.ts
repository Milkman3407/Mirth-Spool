import { z } from "zod";

import type {
  DuplicateReason,
  Prisma,
  PrismaClient,
} from "../generated/prisma/client.js";
import { refreshContentSearchText } from "../tags.js";

const analysisLimit = z.number().int().min(1).max(500);
const uuid = z.uuid();
const distanceThreshold = 4;
const dimensionTolerance = 0.02;
const duplicateLock = 2_147_031_014;

export interface DuplicateMatch {
  readonly contentId: string;
  readonly distance: number | null;
  readonly reason: DuplicateReason;
}

export async function listDuplicateAnalysisCandidates(
  client: PrismaClient,
  limit: number,
) {
  return client.contentItem.findMany({
    orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
    select: { id: true, updatedAt: true },
    take: analysisLimit.parse(limit),
    where: { duplicateAnalyzedAt: null, status: { not: "SUPPRESSED" } },
  });
}

export function loadDuplicateAnalysisTarget(
  client: PrismaClient,
  contentId: string,
) {
  return client.contentItem.findFirst({
    select: {
      canonicalUrlHash: true,
      duplicateGroupId: true,
      id: true,
      mediaAssets: {
        orderBy: [{ ordinal: "asc" }, { id: "asc" }],
        select: {
          cacheState: true,
          height: true,
          id: true,
          kind: true,
          mimeType: true,
          perceptualHash: true,
          sha256: true,
          storageKey: true,
          width: true,
        },
      },
    },
    where: { id: uuid.parse(contentId), status: { not: "SUPPRESSED" } },
  });
}

export function setMediaPerceptualHash(
  client: PrismaClient,
  input: {
    readonly hash: string;
    readonly height: number;
    readonly mediaId: string;
    readonly width: number;
  },
) {
  return client.mediaAsset.updateMany({
    data: {
      height: z.number().int().min(1).max(100_000).parse(input.height),
      perceptualHash: z
        .string()
        .regex(/^[0-9a-f]{16}$/u)
        .parse(input.hash),
      width: z.number().int().min(1).max(100_000).parse(input.width),
    },
    where: {
      id: uuid.parse(input.mediaId),
      kind: "IMAGE",
      perceptualHash: null,
    },
  });
}

export async function findDuplicateMatches(
  client: PrismaClient,
  contentId: string,
  limit: number,
): Promise<readonly DuplicateMatch[]> {
  const target = await loadDuplicateAnalysisTarget(client, contentId);
  if (!target) return [];
  const maximum = analysisLimit.parse(limit);
  const matches = new Map<string, DuplicateMatch>();
  const add = (match: DuplicateMatch) => {
    if (match.contentId === target.id || matches.size >= maximum) return;
    const current = matches.get(match.contentId);
    if (!current || reasonWeight(match.reason) > reasonWeight(current.reason)) {
      matches.set(match.contentId, match);
    }
  };

  if (target.canonicalUrlHash) {
    const canonical = await client.contentItem.findMany({
      orderBy: { id: "asc" },
      select: { id: true },
      take: maximum,
      where: {
        canonicalUrlHash: target.canonicalUrlHash,
        id: { not: target.id },
        status: { not: "SUPPRESSED" },
      },
    });
    for (const candidate of canonical) {
      add({
        contentId: candidate.id,
        distance: null,
        reason: "CANONICAL_URL",
      });
    }
  }

  const hashes = [
    ...new Set(
      target.mediaAssets.flatMap((asset) =>
        asset.sha256 ? [asset.sha256] : [],
      ),
    ),
  ];
  if (hashes.length > 0 && matches.size < maximum) {
    const exact = await client.mediaAsset.findMany({
      distinct: ["contentItemId"],
      orderBy: { id: "asc" },
      select: { contentItemId: true },
      take: maximum,
      where: {
        contentItem: { status: { not: "SUPPRESSED" } },
        contentItemId: { not: target.id },
        sha256: { in: hashes },
      },
    });
    for (const candidate of exact) {
      add({
        contentId: candidate.contentItemId,
        distance: 0,
        reason: "SHA256",
      });
    }
  }

  const perceptual = target.mediaAssets.find(
    (asset) =>
      asset.kind === "IMAGE" &&
      asset.perceptualHash &&
      asset.width &&
      asset.height,
  );
  if (perceptual?.perceptualHash && perceptual.width && perceptual.height) {
    const widthDelta = Math.max(
      1,
      Math.ceil(perceptual.width * dimensionTolerance),
    );
    const heightDelta = Math.max(
      1,
      Math.ceil(perceptual.height * dimensionTolerance),
    );
    const candidates = await client.mediaAsset.findMany({
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      select: {
        contentItemId: true,
        height: true,
        perceptualHash: true,
        width: true,
      },
      take: maximum,
      where: {
        contentItem: { status: { not: "SUPPRESSED" } },
        contentItemId: { not: target.id },
        height: {
          gte: perceptual.height - heightDelta,
          lte: perceptual.height + heightDelta,
        },
        kind: "IMAGE",
        perceptualHash: { not: null },
        width: {
          gte: perceptual.width - widthDelta,
          lte: perceptual.width + widthDelta,
        },
      },
    });
    for (const candidate of candidates) {
      if (!candidate.perceptualHash || !candidate.width || !candidate.height) {
        continue;
      }
      const candidateDimensions = {
        height: candidate.height,
        width: candidate.width,
      };
      const targetDimensions = {
        height: perceptual.height,
        width: perceptual.width,
      };
      if (!withinDimensions(targetDimensions, candidateDimensions)) continue;
      const distance = hammingDistance(
        perceptual.perceptualHash,
        candidate.perceptualHash,
      );
      if (distance <= distanceThreshold) {
        add({
          contentId: candidate.contentItemId,
          distance,
          reason: "PERCEPTUAL_HASH",
        });
      }
    }
  }

  return Object.freeze([...matches.values()]);
}

export async function markDuplicateAnalyzed(
  client: PrismaClient,
  contentId: string,
  analyzedAt: Date,
): Promise<void> {
  await client.contentItem.updateMany({
    data: { duplicateAnalyzedAt: analyzedAt },
    where: { id: uuid.parse(contentId) },
  });
}

export async function mergeDuplicateItems(
  client: PrismaClient,
  input: {
    readonly actorUserId?: string;
    readonly distance?: number | null;
    readonly leftContentId: string;
    readonly reason: DuplicateReason;
    readonly rightContentId: string;
  },
) {
  const left = uuid.parse(input.leftContentId);
  const right = uuid.parse(input.rightContentId);
  if (left === right) throw new TypeError("Cannot merge an item with itself.");
  if (input.actorUserId) uuid.parse(input.actorUserId);
  const distance =
    input.distance === undefined || input.distance === null
      ? null
      : z.number().min(0).max(64).parse(input.distance);
  return client.$transaction(
    async (transaction) => {
      await transaction.$executeRaw`SELECT pg_advisory_xact_lock(${duplicateLock})`;
      const items = await transaction.contentItem.findMany({
        select: { duplicateGroupId: true, id: true },
        where: { id: { in: [left, right] } },
      });
      if (items.length !== 2) throw new Error("DUPLICATE_CONTENT_NOT_FOUND");
      const groupIds = [
        ...new Set(
          items.flatMap((item) =>
            item.duplicateGroupId ? [item.duplicateGroupId] : [],
          ),
        ),
      ].sort();
      let groupId = groupIds[0];
      if (!groupId) {
        groupId = (await transaction.duplicateGroup.create({ data: {} })).id;
      }
      await transaction.duplicateGroup.updateMany({
        data: { primaryContentId: null },
        where: { id: { in: groupIds } },
      });
      const memberRows = await transaction.contentItem.findMany({
        select: { id: true },
        where: {
          OR: [
            { id: { in: [left, right] } },
            ...(groupIds.length > 0
              ? [{ duplicateGroupId: { in: groupIds } }]
              : []),
          ],
        },
      });
      const memberIds = [...new Set(memberRows.map((item) => item.id))];
      if (memberIds.length > 50) throw new Error("DUPLICATE_GROUP_LIMIT");
      await transaction.contentItem.updateMany({
        data: { duplicateGroupId: groupId, duplicatePrimary: false },
        where: { id: { in: memberIds } },
      });
      for (const obsolete of groupIds.filter((id) => id !== groupId)) {
        await transaction.duplicateGroup.delete({ where: { id: obsolete } });
      }
      const [fromContentId, toContentId] = [left, right].sort();
      await transaction.duplicateLink.upsert({
        create: {
          distance,
          fromContentId: fromContentId!,
          reason: input.reason,
          toContentId: toContentId!,
        },
        update: { distance },
        where: {
          fromContentId_toContentId_reason: {
            fromContentId: fromContentId!,
            reason: input.reason,
            toContentId: toContentId!,
          },
        },
      });
      const primaryContentId = await choosePrimary(transaction, memberIds);
      await transaction.contentItem.update({
        data: { duplicatePrimary: true },
        where: { id: primaryContentId },
      });
      await transaction.duplicateGroup.update({
        data: { primaryContentId },
        where: { id: groupId },
      });
      await refreshDuplicateGroupSearchText(
        transaction,
        groupId,
        primaryContentId,
      );
      if (input.actorUserId) {
        await transaction.auditEvent.create({
          data: {
            actorUserId: input.actorUserId,
            eventType: "duplicate.manual_merge",
            metadataJson: {
              leftContentId: left,
              reason: input.reason,
              rightContentId: right,
            },
            targetId: groupId,
            targetType: "DuplicateGroup",
          },
        });
      }
      return Object.freeze({ groupId, primaryContentId });
    },
    { isolationLevel: "Serializable", maxWait: 5_000, timeout: 20_000 },
  );
}

export async function splitDuplicateItem(
  client: PrismaClient,
  input: {
    readonly actorUserId: string;
    readonly contentId: string;
    readonly now: Date;
  },
) {
  const actorUserId = uuid.parse(input.actorUserId);
  const contentId = uuid.parse(input.contentId);
  return client.$transaction(
    async (transaction) => {
      await transaction.$executeRaw`SELECT pg_advisory_xact_lock(${duplicateLock})`;
      const item = await transaction.contentItem.findUnique({
        select: { duplicateGroupId: true },
        where: { id: contentId },
      });
      if (!item?.duplicateGroupId) return Object.freeze({ split: false });
      const groupId = item.duplicateGroupId;
      await transaction.duplicateGroup.update({
        data: { primaryContentId: null },
        where: { id: groupId },
      });
      await transaction.duplicateLink.deleteMany({
        where: {
          OR: [{ fromContentId: contentId }, { toContentId: contentId }],
        },
      });
      await transaction.contentItem.update({
        data: {
          duplicateAnalyzedAt: input.now,
          duplicateGroupId: null,
          duplicatePrimary: true,
        },
        where: { id: contentId },
      });
      const remaining = await transaction.contentItem.findMany({
        select: { id: true },
        where: { duplicateGroupId: groupId },
      });
      if (remaining.length < 2) {
        if (remaining[0]) {
          await transaction.contentItem.update({
            data: { duplicateGroupId: null, duplicatePrimary: true },
            where: { id: remaining[0].id },
          });
        }
        await transaction.duplicateGroup.delete({ where: { id: groupId } });
      } else {
        const remainingIds = remaining.map((entry) => entry.id);
        await transaction.contentItem.updateMany({
          data: { duplicatePrimary: false },
          where: { id: { in: remainingIds } },
        });
        const primaryContentId = await choosePrimary(transaction, remainingIds);
        await transaction.contentItem.update({
          data: { duplicatePrimary: true },
          where: { id: primaryContentId },
        });
        await transaction.duplicateGroup.update({
          data: { primaryContentId },
          where: { id: groupId },
        });
        await refreshDuplicateGroupSearchText(
          transaction,
          groupId,
          primaryContentId,
        );
      }
      await refreshContentSearchText(transaction, contentId);
      await transaction.auditEvent.create({
        data: {
          actorUserId,
          eventType: "duplicate.manual_split",
          metadataJson: { contentId },
          targetId: groupId,
          targetType: "DuplicateGroup",
        },
      });
      return Object.freeze({ split: true });
    },
    { isolationLevel: "Serializable", maxWait: 5_000, timeout: 20_000 },
  );
}

export function listDuplicateGroups(
  client: PrismaClient,
  input: { readonly cursor?: string; readonly limit: number },
) {
  return client.duplicateGroup.findMany({
    ...(input.cursor
      ? { cursor: { id: uuid.parse(input.cursor) }, skip: 1 }
      : {}),
    include: {
      items: {
        include: {
          duplicateLinksFrom: true,
          duplicateLinksTo: true,
          mediaAssets: {
            orderBy: [{ ordinal: "asc" }, { id: "asc" }],
            take: 1,
          },
          sourcePosts: {
            include: {
              source: {
                select: { displayName: true, id: true, kind: true },
              },
            },
          },
        },
        orderBy: [{ duplicatePrimary: "desc" }, { id: "asc" }],
      },
    },
    orderBy: { id: "asc" },
    take: z.number().int().min(1).max(50).parse(input.limit),
  });
}

async function choosePrimary(
  transaction: Prisma.TransactionClient,
  contentIds: readonly string[],
): Promise<string> {
  const candidates = await transaction.contentItem.findMany({
    include: {
      mediaAssets: { orderBy: [{ ordinal: "asc" }, { id: "asc" }] },
      sourcePosts: { include: { source: { select: { priority: true } } } },
    },
    where: { id: { in: [...contentIds] } },
  });
  candidates.sort((left, right) => {
    const leftQuality = quality(left);
    const rightQuality = quality(right);
    for (let index = 0; index < leftQuality.length; index += 1) {
      const difference = rightQuality[index]! - leftQuality[index]!;
      if (difference !== 0) return difference;
    }
    return left.id.localeCompare(right.id);
  });
  const selected = candidates[0];
  if (!selected) throw new Error("DUPLICATE_GROUP_EMPTY");
  return selected.id;
}

function quality(item: {
  readonly mediaAssets: readonly Readonly<{
    cacheState: string;
    height: number | null;
    kind: string;
    width: number | null;
  }>[];
  readonly sourcePosts: readonly Readonly<{
    providerScore: number | null;
    source: Readonly<{ priority: number }>;
  }>[];
  readonly status: string;
  readonly title: string | null;
}): readonly number[] {
  const media = item.mediaAssets[0];
  return [
    item.status === "ACTIVE" ? 1 : 0,
    media && media.kind !== "LINK" ? 1 : 0,
    media?.cacheState === "CACHED" ? 1 : 0,
    (media?.width ?? 0) * (media?.height ?? 0),
    item.title?.trim().length ?? 0,
    Math.max(0, ...item.sourcePosts.map((post) => post.source.priority)),
    Math.max(0, ...item.sourcePosts.map((post) => post.providerScore ?? 0)),
  ];
}

export async function refreshDuplicateGroupSearchText(
  transaction: Prisma.TransactionClient,
  groupId: string,
  primaryContentId: string,
): Promise<void> {
  const group = await transaction.duplicateGroup.findUniqueOrThrow({
    select: {
      items: {
        select: {
          authorName: true,
          normalizedTitle: true,
          sourcePosts: {
            select: {
              communityName: true,
              providerAuthor: true,
              source: { select: { displayName: true } },
            },
          },
          summary: true,
          tags: { select: { tag: { select: { label: true, slug: true } } } },
          title: true,
        },
      },
    },
    where: { id: groupId },
  });
  const searchText = group.items
    .flatMap((item) => [
      item.title,
      item.normalizedTitle,
      item.authorName,
      item.summary,
      ...item.sourcePosts.flatMap((post) => [
        post.providerAuthor,
        post.communityName,
        post.source.displayName,
      ]),
      ...item.tags.flatMap(({ tag }) => [tag.label, tag.slug]),
    ])
    .filter((value): value is string => Boolean(value?.trim()))
    .join(" ")
    .normalize("NFKC")
    .slice(0, 20_000);
  await transaction.contentItem.update({
    data: { searchText },
    where: { id: primaryContentId },
  });
}

function hammingDistance(left: string, right: string): number {
  if (!/^[0-9a-f]{16}$/u.test(left) || !/^[0-9a-f]{16}$/u.test(right)) {
    return 65;
  }
  let value = BigInt(`0x${left}`) ^ BigInt(`0x${right}`);
  let count = 0;
  while (value > 0n) {
    count += Number(value & 1n);
    value >>= 1n;
  }
  return count;
}

function withinDimensions(
  left: Readonly<{ height: number; width: number }>,
  right: Readonly<{ height: number; width: number }>,
): boolean {
  const difference = (first: number, second: number) =>
    Math.abs(first - second) / Math.max(first, second);
  return (
    difference(left.width, right.width) <= dimensionTolerance &&
    difference(left.height, right.height) <= dimensionTolerance
  );
}

function reasonWeight(reason: DuplicateReason): number {
  if (reason === "SHA256") return 4;
  if (reason === "MANUAL") return 3;
  if (reason === "CANONICAL_URL") return 2;
  return 1;
}
