import { requireAdminApiSession } from "../../../../lib/auth/api-session";
import { webMetrics } from "../../../../lib/operational-metrics";
import { readOperationalSnapshot } from "../../../../lib/operations/server";

export async function GET(request: Request): Promise<Response> {
  const authentication = await requireAdminApiSession(request);
  if ("response" in authentication) return authentication.response;
  const snapshot = await readOperationalSnapshot();
  const lines = [webMetrics().toPrometheus().trimEnd()];
  for (const run of snapshot.ingestion) {
    const status = run.status.toLowerCase();
    lines.push(
      `mirthspool_ingestion_runs_total{status="${status}"} ${run.count}`,
    );
    lines.push(
      `mirthspool_ingestion_provider_requests_total{status="${status}"} ${run.providerRequests}`,
    );
    lines.push(
      `mirthspool_ingestion_imported_total{status="${status}"} ${run.imported}`,
    );
    lines.push(
      `mirthspool_ingestion_duplicates_total{status="${status}"} ${run.duplicates}`,
    );
    lines.push(
      `mirthspool_ingestion_retries_total{status="${status}"} ${run.retries}`,
    );
  }
  for (const queue of snapshot.queues) {
    for (const [state, value] of Object.entries(queue.counts)) {
      lines.push(
        `mirthspool_queue_jobs{queue="${queue.name}",state="${state}"} ${value}`,
      );
    }
  }
  lines.push(`mirthspool_source_failures ${snapshot.sources.failures}`);
  lines.push(`mirthspool_cache_bytes ${snapshot.cache.usedBytes}`);
  lines.push(`mirthspool_database_ready ${snapshot.database.ready ? 1 : 0}`);
  lines.push(`mirthspool_storage_ready ${snapshot.storage.ready ? 1 : 0}`);
  return new Response(`${lines.join("\n")}\n`, {
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "text/plain; version=0.0.4; charset=utf-8",
      "X-Request-Id": authentication.requestId,
    },
  });
}
