import type { DatabaseClient } from "@mirthspool/db";
import { listDueSources } from "@mirthspool/db";
import { enqueueSourcePoll, type SourcePollEnqueuer } from "@mirthspool/redis";

export async function scheduleDueSources(
  database: DatabaseClient,
  queue: SourcePollEnqueuer,
  now: Date,
): Promise<number> {
  const sources = await listDueSources(database, now, 100);
  await Promise.all(
    sources.map((source) =>
      enqueueSourcePoll(queue, {
        requestedAt: (source.nextPollAt ?? now).toISOString(),
        sourceId: source.id,
        trigger: "SCHEDULED",
      }),
    ),
  );
  return sources.length;
}
