import type { RepositoryClient } from "../repository-types.js";

export interface MaintenanceCutoffs {
  readonly auditBefore: Date;
  readonly contentBefore: Date;
  readonly ingestionBefore: Date;
  readonly sessionBefore: Date;
}

export async function readIngestionOperationalMetrics(
  client: RepositoryClient,
  since: Date,
) {
  const rows = await client.ingestionRun.groupBy({
    _count: { _all: true },
    _sum: {
      itemsCreated: true,
      itemsSkipped: true,
      providerRequests: true,
      retries: true,
    },
    by: ["status"],
    where: { startedAt: { gte: since } },
  });
  return Object.freeze(
    rows.map((run) =>
      Object.freeze({
        count: run._count._all,
        duplicates: run._sum.itemsSkipped ?? 0,
        imported: run._sum.itemsCreated ?? 0,
        providerRequests: run._sum.providerRequests ?? 0,
        retries: run._sum.retries ?? 0,
        status: run.status,
      }),
    ),
  );
}

export async function planRetentionMaintenance(
  client: RepositoryClient,
  cutoffs: MaintenanceCutoffs,
) {
  const [auditEvents, ingestionRuns, sessions, orphanedContent] =
    await Promise.all([
      client.auditEvent.count({
        where: { occurredAt: { lt: cutoffs.auditBefore } },
      }),
      client.ingestionRun.count({
        where: {
          startedAt: { lt: cutoffs.ingestionBefore },
          status: { not: "RUNNING" },
        },
      }),
      client.session.count({
        where: {
          OR: [
            { expires: { lt: cutoffs.sessionBefore } },
            { revokedAt: { lt: cutoffs.sessionBefore } },
          ],
        },
      }),
      client.contentItem.count({
        where: {
          actions: { none: {} },
          lastSeenAt: { lt: cutoffs.contentBefore },
          mediaAssets: { none: {} },
          sourcePosts: { none: {} },
        },
      }),
    ]);
  return Object.freeze({
    auditEvents,
    ingestionRuns,
    orphanedContent,
    sessions,
  });
}

export async function executeRetentionMaintenance(
  client: RepositoryClient,
  cutoffs: MaintenanceCutoffs,
  batchSize = 500,
) {
  const take = Math.min(1_000, Math.max(1, Math.trunc(batchSize)));
  const [audit, runs, sessions, content] = await Promise.all([
    client.auditEvent.findMany({
      orderBy: { occurredAt: "asc" },
      select: { id: true },
      take,
      where: { occurredAt: { lt: cutoffs.auditBefore } },
    }),
    client.ingestionRun.findMany({
      orderBy: { startedAt: "asc" },
      select: { id: true },
      take,
      where: {
        startedAt: { lt: cutoffs.ingestionBefore },
        status: { not: "RUNNING" },
      },
    }),
    client.session.findMany({
      orderBy: { expires: "asc" },
      select: { id: true },
      take,
      where: {
        OR: [
          { expires: { lt: cutoffs.sessionBefore } },
          { revokedAt: { lt: cutoffs.sessionBefore } },
        ],
      },
    }),
    client.contentItem.findMany({
      orderBy: { lastSeenAt: "asc" },
      select: { id: true },
      take,
      where: {
        actions: { none: {} },
        lastSeenAt: { lt: cutoffs.contentBefore },
        mediaAssets: { none: {} },
        sourcePosts: { none: {} },
      },
    }),
  ]);
  const [auditEvents, ingestionRuns, staleSessions, orphanedContent] =
    await Promise.all([
      client.auditEvent.deleteMany({
        where: { id: { in: audit.map((row) => row.id) } },
      }),
      client.ingestionRun.deleteMany({
        where: { id: { in: runs.map((row) => row.id) } },
      }),
      client.session.deleteMany({
        where: { id: { in: sessions.map((row) => row.id) } },
      }),
      client.contentItem.deleteMany({
        where: { id: { in: content.map((row) => row.id) } },
      }),
    ]);
  return Object.freeze({
    auditEvents: auditEvents.count,
    ingestionRuns: ingestionRuns.count,
    orphanedContent: orphanedContent.count,
    sessions: staleSessions.count,
  });
}
