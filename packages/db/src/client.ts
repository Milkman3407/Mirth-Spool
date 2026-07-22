import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "./generated/prisma/client.js";

const DEFAULT_CONNECTION_TIMEOUT_MS = 5_000;
const DEFAULT_IDLE_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_CONNECTIONS = 10;

export interface DatabaseClientOptions {
  readonly connectionString: string;
  readonly connectionTimeoutMs?: number;
  readonly idleTimeoutMs?: number;
  readonly maxConnections?: number;
}

export function createDatabaseClient(
  options: DatabaseClientOptions,
): PrismaClient {
  const adapter = new PrismaPg({
    connectionString: options.connectionString,
    connectionTimeoutMillis:
      options.connectionTimeoutMs ?? DEFAULT_CONNECTION_TIMEOUT_MS,
    idleTimeoutMillis: options.idleTimeoutMs ?? DEFAULT_IDLE_TIMEOUT_MS,
    max: options.maxConnections ?? DEFAULT_MAX_CONNECTIONS,
  });

  return new PrismaClient({ adapter });
}

const developmentGlobal = globalThis as typeof globalThis & {
  mirthSpoolPrisma?: PrismaClient;
};

export function getDatabaseClient(
  options: DatabaseClientOptions,
): PrismaClient {
  if (process.env.NODE_ENV === "production") {
    return createDatabaseClient(options);
  }

  developmentGlobal.mirthSpoolPrisma ??= createDatabaseClient(options);
  return developmentGlobal.mirthSpoolPrisma;
}

export type DatabaseClient = PrismaClient;
