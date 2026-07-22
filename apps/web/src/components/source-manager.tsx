"use client";

import { type FormEvent, useCallback, useEffect, useState } from "react";

interface CredentialSummary {
  id: string;
  kind: string;
  label: string;
  updatedAt: string;
}

interface ManagedSource {
  configJson: Record<string, unknown>;
  consecutiveFailures: number;
  credentials: CredentialSummary[];
  defaultContentRating: string;
  displayName: string;
  enabled: boolean;
  id: string;
  kind: "RSS" | "LEMMY" | "MASTODON" | "REDDIT";
  lastAttemptAt: string | null;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  lastSuccessAt: string | null;
  pollIntervalSeconds: number;
  priority: number;
  status: string;
}

interface IngestionRun {
  bytesFetched: string;
  errorCode: string | null;
  errorMessage: string | null;
  finishedAt: string | null;
  id: string;
  itemsCreated: number;
  itemsSeen: number;
  itemsUpdated: number;
  jobId: string | null;
  pagesFetched: number;
  startedAt: string;
  status: "RUNNING" | "SUCCEEDED" | "PARTIAL" | "FAILED" | "CANCELLED";
  trigger: string;
}

interface ApiFailure {
  error?: { message?: string };
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const body = (await response.json().catch(() => ({}))) as T & ApiFailure;
  if (!response.ok)
    throw new Error(body.error?.message ?? "The source operation failed.");
  return body;
}

const jsonMutation = (method: string, body: unknown): RequestInit => ({
  body: JSON.stringify(body),
  headers: { "content-type": "application/json" },
  method,
});

export function SourceManager() {
  const [sources, setSources] = useState<ManagedSource[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const load = useCallback(async () => {
    const body = await api<{ items: ManagedSource[] }>("/api/sources");
    setSources(body.items);
  }, []);

  useEffect(() => {
    load().catch((reason: unknown) =>
      setError(
        reason instanceof Error
          ? reason.message
          : "Sources could not be loaded.",
      ),
    );
  }, [load]);

  async function run(operation: () => Promise<void>) {
    setError(null);
    setNotice(null);
    setPending(true);
    try {
      await operation();
      await load();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "The source operation failed.",
      );
    } finally {
      setPending(false);
    }
  }

  function createSource(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    void run(async () => {
      await api(
        "/api/sources",
        jsonMutation("POST", {
          config: {
            feedUrl: form.get("feedUrl"),
            maxEntries: Number(form.get("maxEntries")),
          },
          defaultContentRating: form.get("defaultContentRating"),
          displayName: form.get("displayName"),
          enabled: form.get("enabled") === "on",
          kind: "RSS",
          pollIntervalSeconds: Number(form.get("pollIntervalSeconds")),
          priority: Number(form.get("priority")),
        }),
      );
      formElement.reset();
      setNotice("RSS / Atom source created.");
    });
  }

  return (
    <div className="source-manager">
      <section className="panel">
        <h2>Add RSS / Atom source</h2>
        <p className="form-hint">
          Validation reads a bounded feed sample without downloading linked
          media.
        </p>
        <form className="source-form" onSubmit={createSource}>
          <label>
            Display name
            <input maxLength={200} name="displayName" required />
          </label>
          <label>
            Feed URL
            <input maxLength={2048} name="feedUrl" required type="url" />
          </label>
          <label>
            Maximum entries per fetch
            <input
              defaultValue="50"
              max="100"
              min="1"
              name="maxEntries"
              required
              type="number"
            />
          </label>
          <label>
            Poll interval (seconds)
            <input
              defaultValue="900"
              max="86400"
              min="60"
              name="pollIntervalSeconds"
              required
              type="number"
            />
          </label>
          <label>
            Priority
            <input
              defaultValue="0"
              max="100"
              min="-100"
              name="priority"
              required
              type="number"
            />
          </label>
          <label>
            Rating policy for unclassified entries
            <select defaultValue="UNKNOWN" name="defaultContentRating">
              <option value="UNKNOWN">Unknown (review required)</option>
              <option value="SAFE">Safe</option>
              <option value="SENSITIVE">Sensitive</option>
              <option value="ADULT">Adult</option>
            </select>
          </label>
          <label>
            <input name="enabled" type="checkbox" /> Enabled
          </label>
          <button disabled={pending} type="submit">
            Add source
          </button>
        </form>
      </section>

      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="form-notice" role="status">
          {notice}
        </p>
      ) : null}

      <section aria-live="polite" className="source-list">
        <h2>Configured sources</h2>
        {sources.length === 0 ? <p>No sources configured.</p> : null}
        {sources.map((source) => (
          <SourceEditor
            disabled={pending}
            key={source.id}
            onNotice={setNotice}
            run={run}
            source={source}
          />
        ))}
      </section>
    </div>
  );
}

function SourceEditor({
  disabled,
  onNotice,
  run,
  source,
}: {
  disabled: boolean;
  onNotice: (value: string | null) => void;
  run: (operation: () => Promise<void>) => Promise<void>;
  source: ManagedSource;
}) {
  const [runs, setRuns] = useState<IngestionRun[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const loadRuns = useCallback(async () => {
    const body = await api<{ items: IngestionRun[] }>(
      `/api/sources/${source.id}/runs?limit=5`,
    );
    setRuns(body.items);
    return body.items;
  }, [source.id]);

  useEffect(() => {
    loadRuns().catch(() => undefined);
  }, [loadRuns]);

  async function refresh() {
    setRefreshing(true);
    try {
      const response = await api<{ job: { id: string } }>(
        `/api/sources/${source.id}/refresh`,
        jsonMutation("POST", {}),
      );
      onNotice("Refresh queued. Provider work is running in the background.");
      for (let attempt = 0; attempt < 30; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 500));
        const recent = await loadRuns();
        const matching = recent.find((run) => run.jobId === response.job.id);
        if (matching && matching.status !== "RUNNING") {
          onNotice(
            matching.status === "SUCCEEDED"
              ? `Refresh succeeded: ${matching.itemsCreated} created, ${matching.itemsUpdated} updated.`
              : `Refresh ${matching.status.toLowerCase()}: ${matching.errorCode ?? "SOURCE_OPERATION_FAILED"}.`,
          );
          return;
        }
      }
      onNotice(
        "Refresh is still running. Recent run history will update automatically.",
      );
    } catch (reason) {
      onNotice(
        reason instanceof Error
          ? reason.message
          : "Refresh could not be queued.",
      );
    } finally {
      setRefreshing(false);
    }
  }

  function update(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void run(async () => {
      await api(
        `/api/sources/${source.id}`,
        jsonMutation("PATCH", {
          ...(source.kind === "RSS"
            ? {
                config: {
                  feedUrl: form.get("feedUrl"),
                  maxEntries: Number(form.get("maxEntries")),
                },
              }
            : {}),
          defaultContentRating: form.get("defaultContentRating"),
          displayName: form.get("displayName"),
          pollIntervalSeconds: Number(form.get("pollIntervalSeconds")),
          priority: Number(form.get("priority")),
        }),
      );
      onNotice("Source settings saved.");
    });
  }

  function rotateCredential(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const secret = String(form.get("secret") ?? "");
    void run(async () => {
      const result = await api<{ credential: CredentialSummary }>(
        `/api/sources/${source.id}/credentials`,
        jsonMutation("POST", {
          kind: form.get("kind"),
          label: form.get("label"),
          payload: { secret },
        }),
      );
      if (JSON.stringify(result).includes(secret)) {
        throw new Error("Credential response contained secret material.");
      }
      formElement.reset();
      onNotice(
        "Credential stored securely. Its value will not be shown again.",
      );
    });
  }

  return (
    <article className="source-card">
      <header>
        <div>
          <h3>{source.displayName}</h3>
          <p>
            {source.kind} · {source.status}
          </p>
        </div>
        <span className={`status-pill status-${source.status.toLowerCase()}`}>
          {source.enabled ? "Enabled" : "Paused"}
        </span>
      </header>
      <dl className="health-grid">
        <div>
          <dt>Last attempt</dt>
          <dd>{source.lastAttemptAt ?? "Never"}</dd>
        </div>
        <div>
          <dt>Last success</dt>
          <dd>{source.lastSuccessAt ?? "Never"}</dd>
        </div>
        <div>
          <dt>Failures</dt>
          <dd>{source.consecutiveFailures}</dd>
        </div>
        <div>
          <dt>Last error</dt>
          <dd>{source.lastErrorCode ?? "None"}</dd>
        </div>
      </dl>
      <form className="source-form compact" onSubmit={update}>
        {source.kind === "RSS" ? (
          <>
            <label>
              Feed URL
              <input
                defaultValue={String(source.configJson.feedUrl ?? "")}
                maxLength={2048}
                name="feedUrl"
                required
                type="url"
              />
            </label>
            <label>
              Maximum entries per fetch
              <input
                defaultValue={Number(source.configJson.maxEntries ?? 50)}
                max="100"
                min="1"
                name="maxEntries"
                required
                type="number"
              />
            </label>
          </>
        ) : null}
        <label>
          Display name
          <input
            defaultValue={source.displayName}
            maxLength={200}
            name="displayName"
            required
          />
        </label>
        <label>
          Poll interval
          <input
            defaultValue={source.pollIntervalSeconds}
            max="86400"
            min="60"
            name="pollIntervalSeconds"
            required
            type="number"
          />
        </label>
        <label>
          Priority
          <input
            defaultValue={source.priority}
            max="100"
            min="-100"
            name="priority"
            required
            type="number"
          />
        </label>
        <label>
          Rating policy for unclassified entries
          <select
            defaultValue={source.defaultContentRating}
            name="defaultContentRating"
          >
            <option value="UNKNOWN">Unknown (review required)</option>
            <option value="SAFE">Safe</option>
            <option value="SENSITIVE">Sensitive</option>
            <option value="ADULT">Adult</option>
          </select>
        </label>
        <button disabled={disabled} type="submit">
          Save changes
        </button>
      </form>
      <div className="source-actions">
        <button
          disabled={disabled || refreshing || !source.enabled}
          onClick={() => void refresh()}
          type="button"
        >
          {refreshing ? "Refreshing…" : "Refresh now"}
        </button>
        <button
          disabled={disabled}
          onClick={() =>
            void run(async () => {
              await api(
                `/api/sources/${source.id}/pause`,
                jsonMutation("POST", {}),
              );
              onNotice("Source paused.");
            })
          }
          type="button"
        >
          Pause
        </button>
        <button
          disabled={disabled || source.enabled}
          onClick={() =>
            void run(async () => {
              await api(
                `/api/sources/${source.id}/resume`,
                jsonMutation("POST", {}),
              );
              onNotice("Source resumed.");
            })
          }
          type="button"
        >
          Resume
        </button>
        <button
          disabled={disabled}
          onClick={() =>
            void run(async () => {
              const body = await api<{
                result: { details?: Record<string, string>; message: string };
              }>(
                `/api/sources/${source.id}/validate`,
                jsonMutation("POST", {}),
              );
              const details = body.result.details;
              onNotice(
                details?.feedTitle
                  ? `${body.result.message} ${details.sampleItemCount ?? "0"} sample entries parsed (${details.feedFormat ?? "feed"}).`
                  : body.result.message,
              );
            })
          }
          type="button"
        >
          Validate
        </button>
        <button
          className="danger"
          disabled={disabled}
          onClick={() =>
            void run(async () => {
              await api(
                `/api/sources/${source.id}`,
                jsonMutation("DELETE", {}),
              );
              onNotice(
                "Source deleted. Historical attribution remains preserved.",
              );
            })
          }
          type="button"
        >
          Delete
        </button>
      </div>
      <details
        onToggle={(event) => {
          if (event.currentTarget.open) void loadRuns();
        }}
      >
        <summary>Recent ingestion runs ({runs.length})</summary>
        {runs.length === 0 ? (
          <p className="form-hint">No ingestion runs yet.</p>
        ) : (
          <div className="run-history">
            {runs.map((ingestionRun) => (
              <article className="run-row" key={ingestionRun.id}>
                <strong>{ingestionRun.status}</strong>
                <span>
                  {ingestionRun.trigger} ·{" "}
                  {new Date(ingestionRun.startedAt).toLocaleString()}
                </span>
                <span>
                  {ingestionRun.pagesFetched} pages · {ingestionRun.itemsSeen}{" "}
                  seen · {ingestionRun.itemsCreated} created ·{" "}
                  {ingestionRun.itemsUpdated} updated
                </span>
                {ingestionRun.errorCode ? (
                  <span>
                    {ingestionRun.errorCode}: {ingestionRun.errorMessage}
                  </span>
                ) : null}
              </article>
            ))}
          </div>
        )}
      </details>
      <details>
        <summary>Credentials ({source.credentials.length})</summary>
        <p className="form-hint">
          Values are encrypted and never returned after submission.
        </p>
        <form className="source-form compact" onSubmit={rotateCredential}>
          <label>
            Credential kind
            <select defaultValue="ACCESS_TOKEN" name="kind">
              <option value="ACCESS_TOKEN">Access token</option>
              <option value="BASIC_AUTH">Basic authentication</option>
              <option value="OAUTH_CLIENT">OAuth client</option>
              <option value="CUSTOM">Custom</option>
            </select>
          </label>
          <label>
            Label
            <input
              defaultValue="primary"
              maxLength={100}
              name="label"
              required
            />
          </label>
          <label>
            Secret value
            <input
              autoComplete="off"
              maxLength={16000}
              name="secret"
              required
              type="password"
            />
          </label>
          <button disabled={disabled} type="submit">
            Store or rotate credential
          </button>
        </form>
      </details>
    </article>
  );
}
