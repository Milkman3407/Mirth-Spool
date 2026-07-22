import type { ActionKind, Prisma } from "../generated/prisma/client.js";
import type { Clock, RepositoryClient } from "../repository-types.js";
import { systemClock } from "../repository-types.js";

export function recordUserAction(
  client: RepositoryClient,
  input: {
    readonly userId: string;
    readonly contentItemId: string;
    readonly kind: ActionKind;
    readonly metadata?: Prisma.InputJsonValue;
  },
  clock: Clock = systemClock,
) {
  const key = {
    userId_contentItemId_kind: {
      userId: input.userId,
      contentItemId: input.contentItemId,
      kind: input.kind,
    },
  };
  return client.userAction.upsert({
    where: key,
    create: {
      ...key.userId_contentItemId_kind,
      ...(input.metadata !== undefined ? { metadataJson: input.metadata } : {}),
      occurredAt: clock.now(),
    },
    update: {
      ...(input.metadata !== undefined ? { metadataJson: input.metadata } : {}),
      occurredAt: clock.now(),
    },
  });
}

export function removeUserAction(
  client: RepositoryClient,
  input: {
    readonly userId: string;
    readonly contentItemId: string;
    readonly kind: ActionKind;
  },
) {
  return client.userAction.deleteMany({ where: input });
}
