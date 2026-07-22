import { z } from "zod";

import type { Prisma } from "./generated/prisma/client.js";

const providerTagSchema = z.array(z.string().trim().min(1).max(200)).max(50);

export function normalizeTag(value: string): string | null {
  const slug = value
    .normalize("NFKC")
    .trim()
    .replace(/^#+/u, "")
    .toLocaleLowerCase("und")
    .replace(/[\s_]+/gu, "-")
    .replace(/[^\p{L}\p{N}-]+/gu, "")
    .replace(/-+/gu, "-")
    .replace(/^-|-$/gu, "")
    .slice(0, 80);
  return slug && /^[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)*$/u.test(slug) ? slug : null;
}

export async function replaceProviderTags(
  transaction: Prisma.TransactionClient,
  contentItemId: string,
  values: readonly string[],
): Promise<void> {
  const requested = providerTagSchema.parse(values);
  const tags = [
    ...new Set(requested.map(normalizeTag).filter((tag) => tag !== null)),
  ].slice(0, 50);
  await transaction.contentTag.deleteMany({
    where: { contentItemId, source: "PROVIDER" },
  });
  for (const slug of tags) {
    const tag = await transaction.tag.upsert({
      create: { label: slug, slug },
      update: {},
      where: { slug },
    });
    await transaction.contentTag.create({
      data: { contentItemId, source: "PROVIDER", tagId: tag.id },
    });
  }
}

export async function refreshContentSearchText(
  transaction: Prisma.TransactionClient,
  contentItemId: string,
): Promise<void> {
  const content = await transaction.contentItem.findUniqueOrThrow({
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
    where: { id: contentItemId },
  });
  const searchText = [
    content.title,
    content.normalizedTitle,
    content.authorName,
    content.summary,
    ...content.sourcePosts.flatMap((post) => [
      post.providerAuthor,
      post.communityName,
      post.source.displayName,
    ]),
    ...content.tags.flatMap(({ tag }) => [tag.label, tag.slug]),
  ]
    .filter((value): value is string => Boolean(value?.trim()))
    .join(" ")
    .normalize("NFKC")
    .slice(0, 20_000);
  await transaction.contentItem.update({
    data: { searchText },
    where: { id: contentItemId },
  });
}
