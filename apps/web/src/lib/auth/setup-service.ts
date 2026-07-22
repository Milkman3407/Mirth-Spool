import type { DatabaseClient } from "@mirthspool/db";

import { recordAuditEvent } from "./audit";
import { normalizeEmail } from "./password-policy";

export class SetupClosedError extends Error {
  readonly code = "SETUP_CLOSED" as const;

  constructor() {
    super("First-run setup is closed.");
    this.name = "SetupClosedError";
  }
}

export async function isSetupOpen(database: DatabaseClient): Promise<boolean> {
  return (await database.user.count({ take: 1 })) === 0;
}

export async function createFirstAdministrator(
  database: DatabaseClient,
  input: {
    readonly email: string;
    readonly hashPassword: (password: string) => Promise<string>;
    readonly name: string;
    readonly password: string;
  },
): Promise<{
  readonly email: string;
  readonly id: string;
  readonly name: string;
}> {
  try {
    return await database.$transaction(
      async (transaction) => {
        await transaction.$queryRaw`SELECT pg_advisory_xact_lock(654214703031)::text`;
        if ((await transaction.user.count({ take: 1 })) !== 0) {
          throw new SetupClosedError();
        }

        const email = normalizeEmail(input.email);
        const passwordHash = await input.hashPassword(input.password);
        const user = await transaction.user.create({
          data: {
            email,
            emailNormalized: email,
            emailVerified: true,
            name: input.name.trim(),
            role: "ADMIN",
          },
          select: { email: true, id: true, name: true },
        });
        await transaction.credentialAccount.create({
          data: {
            accountId: user.id,
            passwordHash,
            providerId: "credential",
            userId: user.id,
          },
        });
        await recordAuditEvent(transaction, {
          actorUserId: user.id,
          eventType: "AUTH_SETUP_COMPLETED",
          targetId: user.id,
          targetType: "User",
        });
        return Object.freeze(user);
      },
      { isolationLevel: "Serializable", timeout: 15_000 },
    );
  } catch (error) {
    const transactionConflict =
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "P2034";
    if (transactionConflict && (await database.user.count({ take: 1 })) !== 0) {
      throw new SetupClosedError();
    }
    throw error;
  }
}
