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
  minimumScore: number | null;
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

  function createLemmySource(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const minimumScore = Number(form.get("lemmyMinimumScore"));
    void run(async () => {
      await api(
        "/api/sources",
        jsonMutation("POST", {
          config: {
            community: form.get("lemmyCommunity"),
            contentPolicy: form.get("lemmyContentPolicy"),
            instanceUrl: form.get("lemmyInstanceUrl"),
            itemsPerPage: Number(form.get("lemmyItemsPerPage")),
            minimumScore,
            pageLimit: Number(form.get("lemmyPageLimit")),
            sort: form.get("lemmySort"),
          },
          defaultContentRating: form.get("lemmyDefaultContentRating"),
          displayName: form.get("lemmyDisplayName"),
          enabled: form.get("lemmyEnabled") === "on",
          kind: "LEMMY",
          minimumScore,
          pollIntervalSeconds: Number(form.get("lemmyPollIntervalSeconds")),
          priority: Number(form.get("lemmyPriority")),
        }),
      );
      formElement.reset();
      setNotice("Lemmy community source created.");
    });
  }

  function createMastodonSource(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const language = String(form.get("mastodonLanguage") ?? "").trim() || null;
    void run(async () => {
      await api(
        "/api/sources",
        jsonMutation("POST", {
          config: {
            identifier: form.get("mastodonIdentifier"),
            includeReblogs: form.get("mastodonIncludeReblogs") === "on",
            instanceUrl: form.get("mastodonInstanceUrl"),
            itemsPerPage: Number(form.get("mastodonItemsPerPage")),
            language,
            minimumMedia: Number(form.get("mastodonMinimumMedia")),
            mode: form.get("mastodonMode"),
            pageLimit: Number(form.get("mastodonPageLimit")),
          },
          defaultContentRating: form.get("mastodonDefaultContentRating"),
          displayName: form.get("mastodonDisplayName"),
          enabled: form.get("mastodonEnabled") === "on",
          kind: "MASTODON",
          pollIntervalSeconds: Number(form.get("mastodonPollIntervalSeconds")),
          priority: Number(form.get("mastodonPriority")),
        }),
      );
      formElement.reset();
      setNotice("Mastodon-compatible source created.");
    });
  }

  function createRedditSource(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const enableAfterCredential = form.get("redditEnabled") === "on";
    const minimumScore = Number(form.get("redditMinimumScore"));
    void run(async () => {
      const created = await api<{ source: ManagedSource }>(
        "/api/sources",
        jsonMutation("POST", {
          config: {
            contentPolicy: form.get("redditContentPolicy"),
            includeStickied: form.get("redditIncludeStickied") === "on",
            itemsPerPage: Number(form.get("redditItemsPerPage")),
            minimumScore,
            pageLimit: Number(form.get("redditPageLimit")),
            sort: form.get("redditSort"),
            subreddit: form.get("redditSubreddit"),
            timeWindow: form.get("redditTimeWindow"),
          },
          defaultContentRating: form.get("redditDefaultContentRating"),
          displayName: form.get("redditDisplayName"),
          enabled: false,
          kind: "REDDIT",
          minimumScore,
          pollIntervalSeconds: Number(form.get("redditPollIntervalSeconds")),
          priority: Number(form.get("redditPriority")),
        }),
      );
      await api(
        `/api/sources/${created.source.id}/credentials`,
        jsonMutation("POST", {
          kind: "OAUTH_CLIENT",
          label: "primary",
          payload: {
            clientId: form.get("redditClientId"),
            clientSecret: form.get("redditClientSecret"),
            userAgent: form.get("redditUserAgent"),
          },
        }),
      );
      if (enableAfterCredential) {
        await api(
          `/api/sources/${created.source.id}/resume`,
          jsonMutation("POST", {}),
        );
      }
      formElement.reset();
      setNotice("Reddit source and encrypted OAuth credential created.");
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

      <section className="panel">
        <h2>Add Lemmy community</h2>
        <p className="form-hint">
          Uses the public Lemmy API only. Linked destinations are never scraped
          or fetched during validation.
        </p>
        <form className="source-form" onSubmit={createLemmySource}>
          <label>
            Lemmy display name
            <input maxLength={200} name="lemmyDisplayName" required />
          </label>
          <label>
            Instance URL
            <input
              maxLength={2048}
              name="lemmyInstanceUrl"
              placeholder="https://example.instance"
              required
              type="url"
            />
          </label>
          <label>
            Community name or numeric identifier
            <input
              maxLength={100}
              name="lemmyCommunity"
              pattern="[A-Za-z0-9_]+"
              required
            />
          </label>
          <label>
            Lemmy sort
            <select defaultValue="New" name="lemmySort">
              <option value="New">New</option>
              <option value="Hot">Hot</option>
              <option value="Active">Active</option>
              <option value="TopDay">Top day</option>
              <option value="TopWeek">Top week</option>
              <option value="TopMonth">Top month</option>
              <option value="TopYear">Top year</option>
              <option value="TopAll">Top all time</option>
            </select>
          </label>
          <label>
            Lemmy minimum score
            <input
              defaultValue="0"
              max="1000000"
              min="-1000000"
              name="lemmyMinimumScore"
              required
              type="number"
            />
          </label>
          <label>
            Lemmy content policy
            <select defaultValue="EXCLUDE_ADULT" name="lemmyContentPolicy">
              <option value="EXCLUDE_ADULT">Exclude adult posts</option>
              <option value="TREAT_ADULT_AS_SENSITIVE">
                Treat adult posts as sensitive
              </option>
              <option value="INCLUDE_ADULT">Include as adult</option>
            </select>
          </label>
          <label>
            Lemmy items per page
            <input
              defaultValue="20"
              max="50"
              min="1"
              name="lemmyItemsPerPage"
              required
              type="number"
            />
          </label>
          <label>
            Lemmy pages per run
            <input
              defaultValue="3"
              max="10"
              min="1"
              name="lemmyPageLimit"
              required
              type="number"
            />
          </label>
          <label>
            Lemmy poll interval (seconds)
            <input
              defaultValue="900"
              max="86400"
              min="60"
              name="lemmyPollIntervalSeconds"
              required
              type="number"
            />
          </label>
          <label>
            Lemmy priority
            <input
              defaultValue="0"
              max="100"
              min="-100"
              name="lemmyPriority"
              required
              type="number"
            />
          </label>
          <label>
            Lemmy rating policy for unclassified posts
            <select defaultValue="UNKNOWN" name="lemmyDefaultContentRating">
              <option value="UNKNOWN">Unknown (review required)</option>
              <option value="SAFE">Safe</option>
              <option value="SENSITIVE">Sensitive</option>
              <option value="ADULT">Adult</option>
            </select>
          </label>
          <label>
            <input name="lemmyEnabled" type="checkbox" /> Enable Lemmy source
          </label>
          <button disabled={pending} type="submit">
            Add Lemmy source
          </button>
        </form>
      </section>

      <section className="panel">
        <h2>Add Mastodon media timeline</h2>
        <p className="form-hint">
          Uses public Mastodon-compatible JSON APIs only. Status markup is
          reduced to plain text and linked destinations are never fetched.
        </p>
        <form className="source-form" onSubmit={createMastodonSource}>
          <label>
            Mastodon display name
            <input maxLength={200} name="mastodonDisplayName" required />
          </label>
          <label>
            Mastodon instance URL
            <input
              maxLength={2048}
              name="mastodonInstanceUrl"
              placeholder="https://mastodon.example"
              required
              type="url"
            />
          </label>
          <label>
            Timeline mode
            <select defaultValue="HASHTAG" name="mastodonMode">
              <option value="HASHTAG">Public hashtag</option>
              <option value="ACCOUNT">Public account</option>
            </select>
          </label>
          <label>
            Hashtag or account handle
            <input
              maxLength={255}
              name="mastodonIdentifier"
              placeholder="memes or artist@example.social"
              required
            />
          </label>
          <label>
            Language filter (optional BCP 47 code)
            <input maxLength={35} name="mastodonLanguage" placeholder="en" />
          </label>
          <label>
            Minimum supported media attachments
            <input
              defaultValue="1"
              max="4"
              min="1"
              name="mastodonMinimumMedia"
              required
              type="number"
            />
          </label>
          <label>
            Mastodon statuses per page
            <input
              defaultValue="20"
              max="40"
              min="1"
              name="mastodonItemsPerPage"
              required
              type="number"
            />
          </label>
          <label>
            Mastodon pages per run
            <input
              defaultValue="3"
              max="10"
              min="1"
              name="mastodonPageLimit"
              required
              type="number"
            />
          </label>
          <label>
            Mastodon poll interval (seconds)
            <input
              defaultValue="900"
              max="86400"
              min="60"
              name="mastodonPollIntervalSeconds"
              required
              type="number"
            />
          </label>
          <label>
            Mastodon priority
            <input
              defaultValue="0"
              max="100"
              min="-100"
              name="mastodonPriority"
              required
              type="number"
            />
          </label>
          <label>
            Mastodon rating fallback
            <select defaultValue="UNKNOWN" name="mastodonDefaultContentRating">
              <option value="UNKNOWN">Unknown (review required)</option>
              <option value="SAFE">Safe</option>
              <option value="SENSITIVE">Sensitive</option>
              <option value="ADULT">Adult</option>
            </select>
          </label>
          <label>
            <input name="mastodonIncludeReblogs" type="checkbox" /> Include
            boosts, deduplicated under the original status
          </label>
          <label>
            <input name="mastodonEnabled" type="checkbox" /> Enable Mastodon
            source
          </label>
          <button disabled={pending} type="submit">
            Add Mastodon source
          </button>
        </form>
      </section>

      <section className="panel">
        <h2>Add Reddit subreddit</h2>
        <p className="form-hint">
          Uses Reddit's approved Data API with app-only OAuth and read scope.
          Credentials stay server-side; linked destinations are never fetched.
        </p>
        <form className="source-form" onSubmit={createRedditSource}>
          <label>
            Reddit display name
            <input maxLength={200} name="redditDisplayName" required />
          </label>
          <label>
            Subreddit
            <input
              maxLength={21}
              name="redditSubreddit"
              pattern="[A-Za-z0-9_]{3,21}"
              required
            />
          </label>
          <label>
            Sort
            <select defaultValue="new" name="redditSort">
              <option value="new">New</option>
              <option value="hot">Hot</option>
              <option value="top">Top</option>
              <option value="rising">Rising</option>
            </select>
          </label>
          <label>
            Top time window
            <select defaultValue="day" name="redditTimeWindow">
              {["hour", "day", "week", "month", "year", "all"].map((window) => (
                <option key={window} value={window}>
                  {window}
                </option>
              ))}
            </select>
          </label>
          <label>
            Minimum score
            <input
              defaultValue="0"
              max="1000000"
              min="-1000000"
              name="redditMinimumScore"
              required
              type="number"
            />
          </label>
          <label>
            Content policy
            <select defaultValue="EXCLUDE_ADULT" name="redditContentPolicy">
              <option value="EXCLUDE_ADULT">Exclude adult posts</option>
              <option value="TREAT_ADULT_AS_SENSITIVE">
                Treat adult posts as sensitive
              </option>
              <option value="INCLUDE_ADULT">Include as adult</option>
            </select>
          </label>
          <label>
            <input name="redditIncludeStickied" type="checkbox" /> Include
            stickied posts
          </label>
          <label>
            Posts per page
            <input
              defaultValue="25"
              max="100"
              min="1"
              name="redditItemsPerPage"
              required
              type="number"
            />
          </label>
          <label>
            Pages per run
            <input
              defaultValue="3"
              max="10"
              min="1"
              name="redditPageLimit"
              required
              type="number"
            />
          </label>
          <label>
            OAuth client ID
            <input
              autoComplete="off"
              maxLength={100}
              name="redditClientId"
              required
            />
          </label>
          <label>
            OAuth client secret
            <input
              autoComplete="off"
              maxLength={500}
              name="redditClientSecret"
              required
              type="password"
            />
          </label>
          <label>
            Reddit User-Agent
            <input
              maxLength={500}
              name="redditUserAgent"
              placeholder="linux:mirthspool:v0.1 (by /u/yourname)"
              required
            />
          </label>
          <label>
            Poll interval (seconds)
            <input
              defaultValue="900"
              max="86400"
              min="60"
              name="redditPollIntervalSeconds"
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
              name="redditPriority"
              required
              type="number"
            />
          </label>
          <label>
            Fallback rating
            <select defaultValue="UNKNOWN" name="redditDefaultContentRating">
              <option value="UNKNOWN">Unknown (review required)</option>
              <option value="SAFE">Safe</option>
              <option value="SENSITIVE">Sensitive</option>
              <option value="ADULT">Adult</option>
            </select>
          </label>
          <label>
            <input name="redditEnabled" type="checkbox" /> Enable after securely
            storing credentials
          </label>
          <button disabled={pending} type="submit">
            Add Reddit source
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
          ...(source.kind === "LEMMY"
            ? {
                config: {
                  community: form.get("lemmyCommunity"),
                  contentPolicy: form.get("lemmyContentPolicy"),
                  instanceUrl: form.get("lemmyInstanceUrl"),
                  itemsPerPage: Number(form.get("lemmyItemsPerPage")),
                  minimumScore: Number(form.get("lemmyMinimumScore")),
                  pageLimit: Number(form.get("lemmyPageLimit")),
                  sort: form.get("lemmySort"),
                },
                minimumScore: Number(form.get("lemmyMinimumScore")),
              }
            : {}),
          ...(source.kind === "MASTODON"
            ? {
                config: {
                  identifier: form.get("mastodonIdentifier"),
                  includeReblogs: form.get("mastodonIncludeReblogs") === "on",
                  instanceUrl: form.get("mastodonInstanceUrl"),
                  itemsPerPage: Number(form.get("mastodonItemsPerPage")),
                  language:
                    String(form.get("mastodonLanguage") ?? "").trim() || null,
                  minimumMedia: Number(form.get("mastodonMinimumMedia")),
                  mode: form.get("mastodonMode"),
                  pageLimit: Number(form.get("mastodonPageLimit")),
                },
              }
            : {}),
          ...(source.kind === "REDDIT"
            ? {
                config: {
                  contentPolicy: form.get("redditContentPolicy"),
                  includeStickied: form.get("redditIncludeStickied") === "on",
                  itemsPerPage: Number(form.get("redditItemsPerPage")),
                  minimumScore: Number(form.get("redditMinimumScore")),
                  pageLimit: Number(form.get("redditPageLimit")),
                  sort: form.get("redditSort"),
                  subreddit: form.get("redditSubreddit"),
                  timeWindow: form.get("redditTimeWindow"),
                },
                minimumScore: Number(form.get("redditMinimumScore")),
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
    const payload =
      source.kind === "REDDIT"
        ? {
            clientId: form.get("redditClientId"),
            clientSecret: form.get("redditClientSecret"),
            userAgent: form.get("redditUserAgent"),
          }
        : { secret };
    void run(async () => {
      const result = await api<{ credential: CredentialSummary }>(
        `/api/sources/${source.id}/credentials`,
        jsonMutation("POST", {
          kind: source.kind === "REDDIT" ? "OAUTH_CLIENT" : form.get("kind"),
          label: source.kind === "REDDIT" ? "primary" : form.get("label"),
          payload,
        }),
      );
      if (secret && JSON.stringify(result).includes(secret)) {
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
        {source.kind === "LEMMY" ? (
          <>
            <label>
              Instance URL
              <input
                defaultValue={String(source.configJson.instanceUrl ?? "")}
                maxLength={2048}
                name="lemmyInstanceUrl"
                required
                type="url"
              />
            </label>
            <label>
              Community name or numeric identifier
              <input
                defaultValue={String(source.configJson.community ?? "")}
                maxLength={100}
                name="lemmyCommunity"
                required
              />
            </label>
            <label>
              Lemmy sort
              <select
                defaultValue={String(source.configJson.sort ?? "New")}
                name="lemmySort"
              >
                {[
                  "New",
                  "Hot",
                  "Active",
                  "TopDay",
                  "TopWeek",
                  "TopMonth",
                  "TopYear",
                  "TopAll",
                ].map((sort) => (
                  <option key={sort} value={sort}>
                    {sort}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Lemmy minimum score
              <input
                defaultValue={Number(source.configJson.minimumScore ?? 0)}
                max="1000000"
                min="-1000000"
                name="lemmyMinimumScore"
                required
                type="number"
              />
            </label>
            <label>
              Lemmy content policy
              <select
                defaultValue={String(
                  source.configJson.contentPolicy ?? "EXCLUDE_ADULT",
                )}
                name="lemmyContentPolicy"
              >
                <option value="EXCLUDE_ADULT">Exclude adult posts</option>
                <option value="TREAT_ADULT_AS_SENSITIVE">
                  Treat adult posts as sensitive
                </option>
                <option value="INCLUDE_ADULT">Include as adult</option>
              </select>
            </label>
            <label>
              Lemmy items per page
              <input
                defaultValue={Number(source.configJson.itemsPerPage ?? 20)}
                max="50"
                min="1"
                name="lemmyItemsPerPage"
                required
                type="number"
              />
            </label>
            <label>
              Lemmy pages per run
              <input
                defaultValue={Number(source.configJson.pageLimit ?? 3)}
                max="10"
                min="1"
                name="lemmyPageLimit"
                required
                type="number"
              />
            </label>
          </>
        ) : null}
        {source.kind === "MASTODON" ? (
          <>
            <label>
              Mastodon instance URL
              <input
                defaultValue={String(source.configJson.instanceUrl ?? "")}
                maxLength={2048}
                name="mastodonInstanceUrl"
                required
                type="url"
              />
            </label>
            <label>
              Timeline mode
              <select
                defaultValue={String(source.configJson.mode ?? "HASHTAG")}
                name="mastodonMode"
              >
                <option value="HASHTAG">Public hashtag</option>
                <option value="ACCOUNT">Public account</option>
              </select>
            </label>
            <label>
              Hashtag or account handle
              <input
                defaultValue={String(source.configJson.identifier ?? "")}
                maxLength={255}
                name="mastodonIdentifier"
                required
              />
            </label>
            <label>
              Language filter
              <input
                defaultValue={String(source.configJson.language ?? "")}
                maxLength={35}
                name="mastodonLanguage"
              />
            </label>
            <label>
              Minimum supported media attachments
              <input
                defaultValue={Number(source.configJson.minimumMedia ?? 1)}
                max="4"
                min="1"
                name="mastodonMinimumMedia"
                required
                type="number"
              />
            </label>
            <label>
              Mastodon statuses per page
              <input
                defaultValue={Number(source.configJson.itemsPerPage ?? 20)}
                max="40"
                min="1"
                name="mastodonItemsPerPage"
                required
                type="number"
              />
            </label>
            <label>
              Mastodon pages per run
              <input
                defaultValue={Number(source.configJson.pageLimit ?? 3)}
                max="10"
                min="1"
                name="mastodonPageLimit"
                required
                type="number"
              />
            </label>
            <label>
              <input
                defaultChecked={source.configJson.includeReblogs === true}
                name="mastodonIncludeReblogs"
                type="checkbox"
              />{" "}
              Include boosts, deduplicated under the original status
            </label>
          </>
        ) : null}
        {source.kind === "REDDIT" ? (
          <>
            <label>
              Subreddit
              <input
                defaultValue={String(source.configJson.subreddit ?? "")}
                maxLength={21}
                name="redditSubreddit"
                pattern="[A-Za-z0-9_]{3,21}"
                required
              />
            </label>
            <label>
              Sort
              <select
                defaultValue={String(source.configJson.sort ?? "new")}
                name="redditSort"
              >
                <option value="new">New</option>
                <option value="hot">Hot</option>
                <option value="top">Top</option>
                <option value="rising">Rising</option>
              </select>
            </label>
            <label>
              Top time window
              <select
                defaultValue={String(source.configJson.timeWindow ?? "day")}
                name="redditTimeWindow"
              >
                {["hour", "day", "week", "month", "year", "all"].map(
                  (window) => (
                    <option key={window} value={window}>
                      {window}
                    </option>
                  ),
                )}
              </select>
            </label>
            <label>
              Minimum score
              <input
                defaultValue={Number(source.configJson.minimumScore ?? 0)}
                max="1000000"
                min="-1000000"
                name="redditMinimumScore"
                required
                type="number"
              />
            </label>
            <label>
              Content policy
              <select
                defaultValue={String(
                  source.configJson.contentPolicy ?? "EXCLUDE_ADULT",
                )}
                name="redditContentPolicy"
              >
                <option value="EXCLUDE_ADULT">Exclude adult posts</option>
                <option value="TREAT_ADULT_AS_SENSITIVE">
                  Treat adult posts as sensitive
                </option>
                <option value="INCLUDE_ADULT">Include as adult</option>
              </select>
            </label>
            <label>
              <input
                defaultChecked={source.configJson.includeStickied === true}
                name="redditIncludeStickied"
                type="checkbox"
              />{" "}
              Include stickied posts
            </label>
            <label>
              Posts per page
              <input
                defaultValue={Number(source.configJson.itemsPerPage ?? 25)}
                max="100"
                min="1"
                name="redditItemsPerPage"
                required
                type="number"
              />
            </label>
            <label>
              Pages per run
              <input
                defaultValue={Number(source.configJson.pageLimit ?? 3)}
                max="10"
                min="1"
                name="redditPageLimit"
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
                  : details?.communityName
                    ? `${body.result.message} Resolved ${details.communityTitle ?? details.communityName} via ${details.apiCompatibility ?? "Lemmy API"}.`
                    : details?.resolvedTarget
                      ? `${body.result.message} ${details.instanceTitle ?? details.instanceHost} reports ${details.instanceVersion ?? "an unknown version"} (${details.apiCompatibility ?? "Mastodon API"}).`
                      : details?.subreddit
                        ? `${body.result.message} ${details.subredditTitle ?? details.subreddit} returned ${details.sampleItemCount ?? "0"} sample posts; OAuth credential health is ${details.credentialHealth ?? "unknown"}.`
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
          {source.kind === "REDDIT" ? (
            <>
              <p className="form-hint">
                OAuth client primary ·{" "}
                {source.credentials.some(
                  (item) =>
                    item.kind === "OAUTH_CLIENT" && item.label === "primary",
                )
                  ? "stored"
                  : "missing"}
                . Validation checks credential health without revealing values.
              </p>
              <label>
                OAuth client ID
                <input
                  autoComplete="off"
                  maxLength={100}
                  name="redditClientId"
                  required
                />
              </label>
              <label>
                OAuth client secret
                <input
                  autoComplete="off"
                  maxLength={500}
                  name="redditClientSecret"
                  required
                  type="password"
                />
              </label>
              <label>
                Reddit User-Agent
                <input
                  maxLength={500}
                  name="redditUserAgent"
                  placeholder="linux:mirthspool:v0.1 (by /u/yourname)"
                  required
                />
              </label>
            </>
          ) : (
            <>
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
            </>
          )}
          <button disabled={disabled} type="submit">
            Store or rotate credential
          </button>
        </form>
      </details>
    </article>
  );
}
