"use client";

import { useState } from "react";

import {
  mutateContentAction,
  type ActionState,
  type MutableActionKind,
} from "../lib/actions/client";

export type ExternalActionHandler = (
  kind: MutableActionKind,
  next: boolean,
) => Promise<void>;

export function ContentActions({
  contentId,
  initialState,
  onActionRequest,
}: Readonly<{
  contentId: string;
  initialState: ActionState;
  onActionRequest?: ExternalActionHandler;
}>) {
  const [state, setState] = useState(initialState);
  const [pending, setPending] = useState<MutableActionKind | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function change(kind: MutableActionKind, next: boolean) {
    const previous = state;
    const optimistic = {
      ...state,
      [kind === "favorite" ? "favorite" : "hidden"]: next,
    };
    setState(optimistic);
    setPending(kind);
    setError(null);
    try {
      if (onActionRequest) {
        await onActionRequest(kind, next);
      } else {
        setState(await mutateContentAction(contentId, kind, next));
      }
    } catch {
      setState(previous);
      setError(
        kind === "favorite"
          ? "The favorite change was not saved. Your previous state was restored."
          : "The hidden-state change was not saved. Your previous state was restored.",
      );
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="content-actions">
      <div className="content-action-buttons">
        <button
          aria-pressed={state.favorite}
          className={
            state.favorite ? "action-button action-active" : "action-button"
          }
          disabled={pending !== null}
          onClick={() => void change("favorite", !state.favorite)}
          type="button"
        >
          <span aria-hidden="true">{state.favorite ? "★" : "☆"}</span>
          {state.favorite ? "Remove from favorites" : "Add to favorites"}
        </button>
        <button
          aria-pressed={state.hidden}
          className={
            state.hidden ? "action-button action-active" : "action-button"
          }
          disabled={pending !== null}
          onClick={() => void change("hide", !state.hidden)}
          type="button"
        >
          <span aria-hidden="true">{state.hidden ? "↩" : "⊘"}</span>
          {state.hidden ? "Unhide item" : "Hide item"}
        </button>
      </div>
      {error ? (
        <p className="action-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
