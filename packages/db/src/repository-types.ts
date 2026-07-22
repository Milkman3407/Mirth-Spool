import type { Prisma } from "./generated/prisma/client.js";

export type RepositoryClient = Prisma.TransactionClient;

export interface Clock {
  now(): Date;
}

export const systemClock: Clock = Object.freeze({
  now: () => new Date(),
});
