import { z } from "zod";

import type { Prisma, PrismaClient } from "../generated/prisma/client.js";
import { refreshDuplicateGroupSearchText } from "./duplicates.js";
import { normalizeTag, refreshContentSearchText } from "../tags.js";

const uuid = z.uuid();
const label = z.string().trim().min(1).max(64);

export async function addAdminTag(
  client: PrismaClient,
  input: {
    readonly actorUserId: string;
    readonly contentId: string;
    readonly label: string;
  },
): Promise<void> {
  const actorUserId = uuid.parse(input.actorUserId);
  const contentId = uuid.parse(input.contentId);
  const requestedLabel = label.parse(input.label).normalize("NFKC");
  const slug = normalizeTag(requestedLabel);
  if (!slug) throw new Error("INVALID_TAG");
  await client.$transaction(async (transaction) => {
    const content = await transaction.contentItem.findUniqueOrThrow({
      select: { duplicateGroupId: true },
      where: { id: contentId },
    });
    const tag = await transaction.tag.upsert({
      create: { label: requestedLabel, slug },
      update: { label: requestedLabel },
      where: { slug },
    });
    await transaction.contentTag.upsert({
      create: { contentItemId: contentId, source: "ADMIN", tagId: tag.id },
      update: { source: "ADMIN" },
      where: {
        contentItemId_tagId_source: {
          contentItemId: contentId,
          source: "ADMIN",
          tagId: tag.id,
        },
      },
    });
    await refreshSearch(transaction, contentId, content.duplicateGroupId);
    await audit(transaction, actorUserId, "CONTENT_TAG_ADDED", contentId, {
      label: requestedLabel,
      slug,
    });
  });
}

export async function removeAdminTag(
  client: PrismaClient,
  input: {
    readonly actorUserId: string;
    readonly contentId: string;
    readonly tagId: string;
  },
): Promise<void> {
  const actorUserId = uuid.parse(input.actorUserId);
  const contentId = uuid.parse(input.contentId);
  const tagId = uuid.parse(input.tagId);
  await client.$transaction(async (transaction) => {
    const content = await transaction.contentItem.findUniqueOrThrow({
      select: { duplicateGroupId: true },
      where: { id: contentId },
    });
    const removed = await transaction.contentTag.deleteMany({
      where: { contentItemId: contentId, source: "ADMIN", tagId },
    });
    if (removed.count === 0) throw new Error("ADMIN_TAG_NOT_FOUND");
    await refreshSearch(transaction, contentId, content.duplicateGroupId);
    await audit(transaction, actorUserId, "CONTENT_TAG_REMOVED", contentId, {
      tagId,
    });
  });
}

async function refreshSearch(
  transaction: Prisma.TransactionClient,
  contentId: string,
  groupId: string | null,
): Promise<void> {
  if (!groupId) return refreshContentSearchText(transaction, contentId);
  const group = await transaction.duplicateGroup.findUniqueOrThrow({
    select: { primaryContentId: true },
    where: { id: groupId },
  });
  if (group.primaryContentId) {
    await refreshDuplicateGroupSearchText(
      transaction,
      groupId,
      group.primaryContentId,
    );
  }
}

function audit(
  transaction: Prisma.TransactionClient,
  actorUserId: string,
  action: string,
  targetId: string,
  metadata: Prisma.InputJsonValue,
) {
  return transaction.auditEvent.create({
    data: {
      actorUserId,
      eventType: action,
      metadataJson: metadata,
      targetId,
      targetType: "CONTENT_ITEM",
    },
  });
}
