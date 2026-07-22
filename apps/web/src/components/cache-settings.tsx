"use client";

import { useState } from "react";

type Policy = "ALL_WITHIN_QUOTA" | "FAVORITES_ONLY" | "NONE" | "TTL";
type Kind = "ANIMATED_IMAGE" | "IMAGE" | "VIDEO";

export interface CacheAdministration {
  readonly configuration: {
    readonly allowedKinds: readonly Kind[];
    readonly maxObjectBytes: number;
    readonly policy: Policy;
    readonly quotaBytes: number;
    readonly ttlSeconds: number;
  };
  readonly counts: {
    readonly blocked: number;
    readonly cached: number;
    readonly failed: number;
    readonly fetching: number;
    readonly queued: number;
    readonly remoteOnly: number;
  };
  readonly storageHealthy: boolean;
  readonly usedBytes: number;
}

export function CacheSettings({
  initial,
}: Readonly<{ initial: CacheAdministration }>) {
  const [cache, setCache] = useState(initial);
  const [allowedKinds, setAllowedKinds] = useState<Kind[]>([
    ...initial.configuration.allowedKinds,
  ]);
  const [maxObjectMegabytes, setMaxObjectMegabytes] = useState(
    initial.configuration.maxObjectBytes / 1_000_000,
  );
  const [policy, setPolicy] = useState<Policy>(initial.configuration.policy);
  const [quotaMegabytes, setQuotaMegabytes] = useState(
    initial.configuration.quotaBytes / 1_000_000,
  );
  const [ttlDays, setTtlDays] = useState(
    initial.configuration.ttlSeconds / 86_400,
  );
  const [confirmation, setConfirmation] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function saveSettings() {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/admin/cache", {
        body: JSON.stringify({
          allowedKinds,
          maxObjectBytes: Math.round(maxObjectMegabytes * 1_000_000),
          policy,
          quotaBytes: Math.round(quotaMegabytes * 1_000_000),
          ttlSeconds: Math.round(ttlDays * 86_400),
        }),
        headers: { "content-type": "application/json" },
        method: "PATCH",
      });
      const payload = (await response.json()) as {
        cache?: CacheAdministration;
        error?: { message?: string };
      };
      if (!response.ok || !payload.cache) {
        throw new Error(
          payload.error?.message ?? "Cache settings were not saved.",
        );
      }
      setCache(payload.cache);
      setMessage(
        policy === "NONE"
          ? "Remote-only mode is active."
          : "Cache settings saved. Eligible media will be queued by the worker.",
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Cache settings were not saved.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function queueMaintenance(action: "evict" | "purge") {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/admin/cache/${action}`, {
        body: JSON.stringify(action === "purge" ? { confirmation } : {}),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      const payload = (await response.json()) as {
        error?: { message?: string };
      };
      if (!response.ok) {
        throw new Error(
          payload.error?.message ?? "Cache maintenance was not queued.",
        );
      }
      setMessage(
        action === "purge"
          ? "Cache purge queued. Cached bytes will be removed by the worker."
          : "Policy and quota eviction queued.",
      );
      setConfirmation("");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Cache maintenance was not queued.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function refresh() {
    setBusy(true);
    try {
      const response = await fetch("/api/admin/cache", { cache: "no-store" });
      const payload = (await response.json()) as {
        cache?: CacheAdministration;
      };
      if (!response.ok || !payload.cache) throw new Error();
      setCache(payload.cache);
      setMessage("Cache status refreshed.");
    } catch {
      setMessage("Cache status could not be refreshed.");
    } finally {
      setBusy(false);
    }
  }

  function toggleKind(kind: Kind, enabled: boolean) {
    setAllowedKinds((current) =>
      enabled
        ? [...new Set([...current, kind])]
        : current.filter((value) => value !== kind),
    );
  }

  const usedPercent = Math.min(
    100,
    (cache.usedBytes / cache.configuration.quotaBytes) * 100,
  );

  return (
    <section
      className="cache-settings settings-panel"
      aria-labelledby="cache-heading"
    >
      <p className="eyebrow">Media privacy and storage</p>
      <h2 id="cache-heading">Media cache</h2>
      <p>
        Remote-only is the default. Enabling this cache makes the server contact
        media hosts instead of each browser and stores only verified, bounded
        raster images or videos referenced by accepted content.
      </p>

      <dl className="health-grid" aria-label="Cache health">
        <div>
          <dt>Storage</dt>
          <dd>{cache.storageHealthy ? "Available" : "Unavailable"}</dd>
        </div>
        <div>
          <dt>Usage</dt>
          <dd>
            {formatBytes(cache.usedBytes)} /{" "}
            {formatBytes(cache.configuration.quotaBytes)}
          </dd>
        </div>
        <div>
          <dt>Cached</dt>
          <dd>{cache.counts.cached}</dd>
        </div>
        <div>
          <dt>Queued / fetching</dt>
          <dd>
            {cache.counts.queued} / {cache.counts.fetching}
          </dd>
        </div>
        <div>
          <dt>Failed / blocked</dt>
          <dd>
            {cache.counts.failed} / {cache.counts.blocked}
          </dd>
        </div>
      </dl>
      <progress aria-label="Cache quota used" max={100} value={usedPercent} />

      <div className="form-grid">
        <label>
          Cache policy
          <select
            value={policy}
            onChange={(event) => setPolicy(event.target.value as Policy)}
          >
            <option value="NONE">None (remote-only)</option>
            <option value="FAVORITES_ONLY">Favorites only</option>
            <option value="TTL">Time limited</option>
            <option value="ALL_WITHIN_QUOTA">All within quota</option>
          </select>
        </label>
        <label>
          Total quota (MB)
          <input
            min={10}
            max={1_000_000}
            step={1}
            type="number"
            value={quotaMegabytes}
            onChange={(event) => setQuotaMegabytes(Number(event.target.value))}
          />
        </label>
        <label>
          Per-object limit (MB)
          <input
            min={1}
            max={500}
            step={1}
            type="number"
            value={maxObjectMegabytes}
            onChange={(event) =>
              setMaxObjectMegabytes(Number(event.target.value))
            }
          />
        </label>
        <label>
          TTL (days)
          <input
            min={1 / 24}
            max={365}
            step={1}
            type="number"
            value={ttlDays}
            onChange={(event) => setTtlDays(Number(event.target.value))}
          />
        </label>
      </div>

      <fieldset>
        <legend>Allowed cached media kinds</legend>
        {(["IMAGE", "ANIMATED_IMAGE", "VIDEO"] as const).map((kind) => (
          <label className="setting-toggle" key={kind}>
            <input
              checked={allowedKinds.includes(kind)}
              onChange={(event) => toggleKind(kind, event.target.checked)}
              type="checkbox"
            />
            {kind.toLowerCase().replace("_", " ")}
          </label>
        ))}
      </fieldset>

      <div className="source-actions">
        <button
          disabled={busy || allowedKinds.length === 0}
          onClick={() => void saveSettings()}
          type="button"
        >
          Save cache settings
        </button>
        <button
          className="secondary-button"
          disabled={busy}
          onClick={() => void refresh()}
          type="button"
        >
          Refresh status
        </button>
        <button
          className="secondary-button"
          disabled={busy}
          onClick={() => void queueMaintenance("evict")}
          type="button"
        >
          Run eviction
        </button>
      </div>

      <div className="danger-zone">
        <h3>Purge cached bytes</h3>
        <p>
          This removes local copies only; source attribution and remote URLs
          remain.
        </p>
        <label>
          Type PURGE CACHE to confirm
          <input
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
          />
        </label>
        <button
          className="danger"
          disabled={busy || confirmation !== "PURGE CACHE"}
          onClick={() => void queueMaintenance("purge")}
          type="button"
        >
          Purge cache
        </button>
      </div>
      {message ? <p role="status">{message}</p> : null}
    </section>
  );
}

function formatBytes(value: number): string {
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(2)} GB`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)} MB`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)} KB`;
  return `${value} B`;
}
