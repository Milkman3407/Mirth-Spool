import {
  listDuplicateGroups,
  mergeDuplicateItems,
  splitDuplicateItem,
  type DatabaseClient,
} from "../../../../../packages/db/dist/index";

export async function readDuplicateAdministration(
  database: DatabaseClient,
  input: { readonly cursor?: string; readonly limit: number },
) {
  const groups = await listDuplicateGroups(database, input);
  return Object.freeze({
    groups: groups.map((group) => {
      const links = [
        ...new Map(
          group.items
            .flatMap((item) => [
              ...item.duplicateLinksFrom,
              ...item.duplicateLinksTo,
            ])
            .map((link) => [link.id, link]),
        ).values(),
      ];
      return {
        id: group.id,
        primaryContentId: group.primaryContentId,
        items: group.items.map((item) => ({
          id: item.id,
          mediaKind: item.mediaAssets[0]?.kind ?? null,
          primary: item.id === group.primaryContentId,
          sources: item.sourcePosts.map((post) => ({
            displayName: post.source.displayName,
            externalId: post.externalId,
            kind: post.source.kind,
            providerUrl: post.providerUrl,
          })),
          title: item.title,
        })),
        links: links.map((link) => ({
          distance: link.distance,
          fromContentId: link.fromContentId,
          reason: link.reason,
          toContentId: link.toContentId,
        })),
      };
    }),
    nextCursor:
      groups.length === input.limit ? (groups.at(-1)?.id ?? null) : null,
  });
}

export function manuallyMergeDuplicates(
  database: DatabaseClient,
  actorUserId: string,
  input: { readonly leftContentId: string; readonly rightContentId: string },
) {
  return mergeDuplicateItems(database, {
    actorUserId,
    leftContentId: input.leftContentId,
    reason: "MANUAL",
    rightContentId: input.rightContentId,
  });
}

export function manuallySplitDuplicate(
  database: DatabaseClient,
  actorUserId: string,
  contentId: string,
  now: Date,
) {
  return splitDuplicateItem(database, { actorUserId, contentId, now });
}
