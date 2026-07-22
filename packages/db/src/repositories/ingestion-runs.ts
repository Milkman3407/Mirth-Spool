import type { RunStatus, RunTrigger } from "../generated/prisma/client.js";
import type { Clock, RepositoryClient } from "../repository-types.js";
import { systemClock } from "../repository-types.js";

export function startIngestionRun(
  client: RepositoryClient,
  input: { readonly sourceId: string; readonly trigger: RunTrigger },
  clock: Clock = systemClock,
) {
  return client.ingestionRun.create({
    data: {
      sourceId: input.sourceId,
      trigger: input.trigger,
      startedAt: clock.now(),
    },
  });
}

export function finishIngestionRun(
  client: RepositoryClient,
  input: {
    readonly id: string;
    readonly status: Exclude<RunStatus, "RUNNING">;
    readonly pagesFetched?: number;
    readonly providerRequests?: number;
    readonly bytesFetched?: bigint;
    readonly itemsSeen?: number;
    readonly itemsCreated?: number;
    readonly itemsUpdated?: number;
    readonly itemsSkipped?: number;
    readonly retries?: number;
    readonly errorCode?: string;
    readonly errorMessage?: string;
  },
  clock: Clock = systemClock,
) {
  return client.ingestionRun.update({
    where: { id: input.id },
    data: {
      status: input.status,
      finishedAt: clock.now(),
      ...(input.pagesFetched !== undefined
        ? { pagesFetched: input.pagesFetched }
        : {}),
      ...(input.providerRequests !== undefined
        ? { providerRequests: input.providerRequests }
        : {}),
      ...(input.bytesFetched !== undefined
        ? { bytesFetched: input.bytesFetched }
        : {}),
      ...(input.itemsSeen !== undefined ? { itemsSeen: input.itemsSeen } : {}),
      ...(input.itemsCreated !== undefined
        ? { itemsCreated: input.itemsCreated }
        : {}),
      ...(input.itemsUpdated !== undefined
        ? { itemsUpdated: input.itemsUpdated }
        : {}),
      ...(input.itemsSkipped !== undefined
        ? { itemsSkipped: input.itemsSkipped }
        : {}),
      ...(input.retries !== undefined ? { retries: input.retries } : {}),
      ...(input.errorCode !== undefined
        ? { errorCode: input.errorCode.slice(0, 100) }
        : {}),
      ...(input.errorMessage !== undefined
        ? { errorMessage: input.errorMessage.slice(0, 500) }
        : {}),
    },
  });
}
