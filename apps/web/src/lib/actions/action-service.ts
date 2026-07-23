import {
  readUserPreferences,
  readUserActionState,
  recordMeaningfulView,
  removeUserAction,
  setUserAction,
  writeUserPreferences,
} from "../../../../../packages/db/dist/index";

export class ActionContentNotFoundError extends Error {
  constructor() {
    super("ACTION_CONTENT_NOT_FOUND");
    this.name = "ActionContentNotFoundError";
  }
}

export type ActionServices = Readonly<{
  database: Parameters<typeof readUserPreferences>[0] &
    Parameters<typeof recordMeaningfulView>[0];
}>;

export async function setContentAction(
  services: ActionServices,
  userId: string,
  contentItemId: string,
  kind: "FAVORITE" | "HIDE",
  enabled: boolean,
) {
  await requireRetainedContent(services, contentItemId);
  if (enabled) {
    await setUserAction(services.database, { contentItemId, kind, userId });
  } else {
    await removeUserAction(services.database, { contentItemId, kind, userId });
  }
  return readContentActionState(services, userId, contentItemId);
}

export async function recordContentView(
  services: ActionServices,
  userId: string,
  contentItemId: string,
) {
  await requireRetainedContent(services, contentItemId);
  const { historyEnabled } = await readUserPreferences(
    services.database,
    userId,
  );
  if (historyEnabled) {
    await recordMeaningfulView(services.database, { contentItemId, userId });
  }
  return readContentActionState(
    services,
    userId,
    contentItemId,
    historyEnabled,
  );
}

export async function readContentActionState(
  services: ActionServices,
  userId: string,
  contentItemId: string,
  knownHistoryEnabled?: boolean,
) {
  const [rows, historyEnabled] = await Promise.all([
    readUserActionState(services.database, { contentItemId, userId }),
    knownHistoryEnabled === undefined
      ? readUserPreferences(services.database, userId).then(
          (preferences) => preferences.historyEnabled,
        )
      : Promise.resolve(knownHistoryEnabled),
  ]);
  const favorite = rows.find((row) => row.kind === "FAVORITE");
  const hidden = rows.find((row) => row.kind === "HIDE");
  const view = historyEnabled
    ? rows.find((row) => row.kind === "VIEW")
    : undefined;
  return Object.freeze({
    favorite: Boolean(favorite),
    hidden: Boolean(hidden),
    viewed: Boolean(view),
    view: view
      ? Object.freeze({
          count: view.occurrenceCount,
          firstViewedAt: view.occurredAt.toISOString(),
          lastViewedAt: view.lastOccurredAt.toISOString(),
        })
      : null,
  });
}

export async function readHistorySetting(
  services: ActionServices,
  userId: string,
) {
  return readUserPreferences(services.database, userId).then(
    (preferences) => preferences.historyEnabled,
  );
}

export async function updateHistorySetting(
  services: ActionServices,
  userId: string,
  enabled: boolean,
) {
  await services.database.$transaction(async (transaction) => {
    await writeUserPreferences(transaction, userId, {
      historyEnabled: enabled,
    });
    if (!enabled) {
      await transaction.userAction.deleteMany({
        where: { kind: "VIEW", userId },
      });
    }
  });
  return enabled;
}

async function requireRetainedContent(
  services: ActionServices,
  contentItemId: string,
) {
  const content = await services.database.contentItem.findFirst({
    select: { id: true },
    where: { id: contentItemId, status: { not: "SUPPRESSED" } },
  });
  if (!content) throw new ActionContentNotFoundError();
}
