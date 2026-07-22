"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

type DuplicateGroup = Readonly<{
  id: string;
  items: readonly Readonly<{
    id: string;
    mediaKind: string | null;
    primary: boolean;
    sources: readonly Readonly<{
      displayName: string;
      externalId: string;
      kind: string;
      providerUrl: string | null;
    }>[];
    title: string | null;
  }>[];
  links: readonly Readonly<{
    distance: number | null;
    fromContentId: string;
    reason: string;
    toContentId: string;
  }>[];
  primaryContentId: string | null;
}>;

export function DuplicateManager({
  groups,
}: Readonly<{ groups: readonly DuplicateGroup[] }>) {
  const router = useRouter();
  const [status, setStatus] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function merge(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await mutate("/api/admin/duplicates/merge", {
      leftContentId: form.get("leftContentId"),
      rightContentId: form.get("rightContentId"),
    });
    event.currentTarget.reset();
  }

  async function split(contentId: string) {
    await mutate("/api/admin/duplicates/split", { contentId });
  }

  async function mutate(path: string, body: unknown) {
    setPending(true);
    setStatus(null);
    try {
      const response = await fetch(path, {
        body: JSON.stringify(body),
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      if (!response.ok) throw new Error("DUPLICATE_MUTATION_FAILED");
      setStatus("Duplicate grouping updated and recorded in the audit log.");
      router.refresh();
    } catch {
      setStatus("The duplicate grouping could not be updated.");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <section className="panel">
        <h2>Manual merge</h2>
        <p className="form-hint">
          Enter two internal content IDs. The source occurrences remain intact.
        </p>
        <form className="source-form compact" onSubmit={merge}>
          <label>
            First content ID
            <input name="leftContentId" required type="text" />
          </label>
          <label>
            Second content ID
            <input name="rightContentId" required type="text" />
          </label>
          <button disabled={pending} type="submit">
            Merge as duplicates
          </button>
        </form>
        {status ? (
          <p role={status.includes("could not") ? "alert" : "status"}>
            {status}
          </p>
        ) : null}
      </section>

      {groups.length === 0 ? (
        <section className="panel">
          <h2>No duplicate groups</h2>
          <p>Automatic analysis has not grouped any content yet.</p>
        </section>
      ) : (
        <div className="duplicate-group-list">
          {groups.map((group) => (
            <section className="panel duplicate-group" key={group.id}>
              <p className="eyebrow">Duplicate group</p>
              <h2>{group.id}</h2>
              <ul className="duplicate-item-list">
                {group.items.map((item) => (
                  <li key={item.id}>
                    <div>
                      <strong>
                        {item.title ?? "Untitled post"}
                        {item.primary ? " · feed primary" : ""}
                      </strong>
                      <code>{item.id}</code>
                      <span>
                        {item.mediaKind ?? "No media"} · {item.sources.length}{" "}
                        preserved source occurrence
                        {item.sources.length === 1 ? "" : "s"}
                      </span>
                      <span>
                        {item.sources
                          .map((source) => source.displayName)
                          .join(", ")}
                      </span>
                    </div>
                    <button
                      className="secondary-button"
                      disabled={pending}
                      onClick={() => void split(item.id)}
                      type="button"
                    >
                      Split from group
                    </button>
                  </li>
                ))}
              </ul>
              <h3>Why these items were grouped</h3>
              <ul className="duplicate-reason-list">
                {group.links.map((link) => (
                  <li
                    key={`${link.fromContentId}:${link.toContentId}:${link.reason}`}
                  >
                    <strong>{reasonLabel(link.reason)}</strong>
                    {link.distance === null
                      ? " · exact comparison"
                      : ` · Hamming distance ${link.distance}`}
                    <span>
                      {shortId(link.fromContentId)} ↔{" "}
                      {shortId(link.toContentId)}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </>
  );
}

function reasonLabel(reason: string) {
  if (reason === "SHA256") return "Identical cached bytes";
  if (reason === "PERCEPTUAL_HASH") return "Near-identical safe raster";
  if (reason === "CANONICAL_URL") return "Normalized canonical URL";
  return "Administrator override";
}

function shortId(value: string) {
  return value.slice(0, 8);
}
