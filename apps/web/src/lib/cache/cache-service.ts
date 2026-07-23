import {
  getCacheSummary,
  getMediaForDelivery,
  readSetting,
  readUserPreferences,
  touchMediaAccess,
  type DatabaseClient,
  writeSetting,
} from "../../../../../packages/db/dist/index";
import type { CacheMaintenanceJobData } from "@mirthspool/redis";
import type { StorageAdapter } from "@mirthspool/storage";

import { recordAuditEvent } from "../auth/audit";
import { ratingsFor } from "../feed/feed-service";
import type { z } from "zod";
import type { cacheSettingsSchema } from "./schemas";

type CacheSettingsInput = z.output<typeof cacheSettingsSchema>;

export async function readCacheAdministration(services: {
  readonly database: Parameters<typeof getCacheSummary>[0];
  readonly storage: StorageAdapter;
}) {
  const [summary, storageHealthy] = await Promise.all([
    getCacheSummary(services.database),
    services.storage.health(),
  ]);
  return Object.freeze({ ...summary, storageHealthy });
}

export async function updateCacheSettings(
  database: DatabaseClient,
  actorUserId: string,
  input: CacheSettingsInput,
) {
  await database.$transaction(async (transaction) => {
    await Promise.all([
      writeSetting(transaction, "cache.allowedKinds", input.allowedKinds),
      writeSetting(transaction, "cache.maxObjectBytes", input.maxObjectBytes),
      writeSetting(transaction, "cache.policy", input.policy),
      writeSetting(transaction, "cache.quotaBytes", input.quotaBytes),
      writeSetting(transaction, "cache.ttlSeconds", input.ttlSeconds),
    ]);
    await recordAuditEvent(transaction, {
      actorUserId,
      eventType: "CACHE_SETTINGS_UPDATED",
      metadata: {
        maxObjectBytes: input.maxObjectBytes,
        policy: input.policy,
        quotaBytes: input.quotaBytes,
        ttlSeconds: input.ttlSeconds,
      },
      targetType: "Cache",
    });
  });
  return input;
}

export async function enqueueCacheMaintenance(
  services: {
    readonly database: Parameters<typeof getCacheSummary>[0];
    readonly maintenanceQueue: {
      add(
        name: string,
        data: CacheMaintenanceJobData,
        options: { readonly jobId: string },
      ): Promise<{ readonly id?: string }>;
    };
  },
  actorUserId: string,
  action: "EVICT" | "PURGE",
  now: Date,
) {
  const requestedAt = now.toISOString();
  const bucket = Math.floor(now.valueOf() / 30_000);
  const name = action === "PURGE" ? "cache-purge" : "cache-evict";
  const job = await services.maintenanceQueue.add(
    name,
    { action, requestedAt },
    { jobId: `${name}-${bucket}` },
  );
  await recordAuditEvent(services.database, {
    actorUserId,
    eventType:
      action === "PURGE" ? "CACHE_PURGE_QUEUED" : "CACHE_EVICTION_QUEUED",
    ...(job.id ? { targetId: job.id } : {}),
    targetType: "Cache",
  });
  return Object.freeze({ id: job.id ?? `${name}-${bucket}`, requestedAt });
}

export async function openCachedMedia(
  services: {
    readonly database: Parameters<typeof getMediaForDelivery>[0];
    readonly storage: StorageAdapter;
  },
  input: {
    readonly ifNoneMatch: string | null;
    readonly mediaId: string;
    readonly method: "GET" | "HEAD";
    readonly now: Date;
    readonly range: string | null;
    readonly userId: string;
  },
): Promise<Response | null> {
  const [ceiling, preferences] = await Promise.all([
    readSetting(services.database, "content.maximumRating"),
    readUserPreferences(services.database, input.userId),
  ]);
  const media = await getMediaForDelivery(services.database, {
    allowedRatings: [
      ...ratingsFor(ceiling, undefined, preferences.maximumContentRating),
    ],
    mediaId: input.mediaId,
  });
  if (!media?.storageKey || !media.mimeType || !media.sha256) return null;
  const stat = await services.storage.stat(media.storageKey);
  if (!stat) {
    await services.database.mediaAsset.updateMany({
      data: {
        cacheErrorCode: "MEDIA_STORAGE_MISSING",
        cacheState: "FAILED",
        storageKey: null,
      },
      where: { cacheState: "CACHED", id: media.id },
    });
    throw new Error("MEDIA_STORAGE_MISSING");
  }
  const etag = `"${media.sha256}"`;
  const headers = mediaHeaders(media.mimeType, etag);
  if (
    input.ifNoneMatch
      ?.split(",")
      .map((value) => value.trim())
      .includes(etag)
  ) {
    return new Response(null, { headers, status: 304 });
  }
  const range =
    media.kind === "VIDEO" && input.range
      ? parseByteRange(input.range, stat.byteLength)
      : null;
  if (input.range && media.kind === "VIDEO" && !range) {
    headers.set("Content-Range", `bytes */${stat.byteLength}`);
    return new Response(null, { headers, status: 416 });
  }
  const object =
    input.method === "HEAD"
      ? null
      : await services.storage.open(media.storageKey, range ?? undefined);
  if (input.method === "GET" && !object)
    throw new Error("MEDIA_STORAGE_MISSING");
  const length = range ? range.end - range.start + 1 : stat.byteLength;
  headers.set("Content-Length", String(length));
  if (range) {
    headers.set(
      "Content-Range",
      `bytes ${range.start}-${range.end}/${stat.byteLength}`,
    );
  }
  await touchMediaAccess(services.database, media.id, input.now);
  const body =
    input.method === "HEAD" || !object
      ? null
      : asyncIterableToReadableStream(object.body);
  return new Response(body, {
    headers,
    status: range ? 206 : 200,
  });
}

function asyncIterableToReadableStream(
  source: AsyncIterable<Uint8Array>,
): ReadableStream<Uint8Array> {
  const iterator = source[Symbol.asyncIterator]();
  return new ReadableStream<Uint8Array>({
    async cancel() {
      await iterator.return?.();
    },
    async pull(controller) {
      const next = await iterator.next();
      if (next.done) controller.close();
      else controller.enqueue(next.value);
    },
  });
}

export function parseByteRange(
  value: string,
  byteLength: number,
): { readonly end: number; readonly start: number } | null {
  const match = /^bytes=(\d*)-(\d*)$/u.exec(value.trim());
  if (!match || byteLength < 1) return null;
  const [, rawStart = "", rawEnd = ""] = match;
  if (rawStart === "" && rawEnd === "") return null;
  if (rawStart === "") {
    const suffix = Number(rawEnd);
    if (!Number.isSafeInteger(suffix) || suffix < 1) return null;
    return Object.freeze({
      end: byteLength - 1,
      start: Math.max(0, byteLength - suffix),
    });
  }
  const start = Number(rawStart);
  const requestedEnd = rawEnd === "" ? byteLength - 1 : Number(rawEnd);
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(requestedEnd) ||
    start < 0 ||
    start >= byteLength ||
    requestedEnd < start
  ) {
    return null;
  }
  return Object.freeze({ end: Math.min(requestedEnd, byteLength - 1), start });
}

function mediaHeaders(mimeType: string, etag: string): Headers {
  return new Headers({
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, max-age=3600, must-revalidate",
    "Content-Disposition": "inline; filename=media",
    "Content-Security-Policy": "default-src 'none'; sandbox",
    "Content-Type": mimeType,
    ETag: etag,
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
  });
}
