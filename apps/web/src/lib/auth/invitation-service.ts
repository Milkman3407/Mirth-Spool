import "server-only";

import { createHmac, randomBytes } from "node:crypto";
import { z } from "zod";

import type { DatabaseClient } from "@mirthspool/db";

import { recordAuditEvent } from "./audit";
import { normalizeEmail } from "./password-policy";

const tokenSchema = z
  .string()
  .min(43)
  .max(128)
  .regex(/^[A-Za-z0-9_-]+$/u);
const invitationInputSchema = z
  .object({
    email: z.email().max(320),
    expiresInHours: z
      .number()
      .int()
      .min(1)
      .max(24 * 30),
  })
  .strict();

export class InvitationUnavailableError extends Error {
  constructor() {
    super("INVITATION_UNAVAILABLE");
    this.name = "InvitationUnavailableError";
  }
}

export class InvitationConflictError extends Error {
  constructor() {
    super("INVITATION_CONFLICT");
    this.name = "InvitationConflictError";
  }
}

export function hashInvitationToken(secret: string, token: string): string {
  return createHmac("sha256", secret)
    .update("mirthspool-invitation\0")
    .update(tokenSchema.parse(token))
    .digest("base64url");
}

export async function createInvitation(
  database: DatabaseClient,
  input: unknown,
  context: {
    readonly actorUserId: string;
    readonly now: Date;
    readonly secret: string;
  },
) {
  const parsed = invitationInputSchema.parse(input);
  const email = normalizeEmail(parsed.email);
  const existingUser = await database.user.count({
    take: 1,
    where: { emailNormalized: email },
  });
  if (existingUser !== 0) throw new InvitationConflictError();

  const token = randomBytes(32).toString("base64url");
  const invitation = await database.$transaction(async (transaction) => {
    await transaction.invitation.updateMany({
      data: { revokedAt: context.now },
      where: {
        acceptedAt: null,
        emailNormalized: email,
        expiresAt: { gt: context.now },
        revokedAt: null,
      },
    });
    const created = await transaction.invitation.create({
      data: {
        createdByUserId: context.actorUserId,
        email,
        emailNormalized: email,
        expiresAt: new Date(
          context.now.valueOf() + parsed.expiresInHours * 60 * 60 * 1_000,
        ),
        tokenHash: hashInvitationToken(context.secret, token),
      },
      select: {
        createdAt: true,
        email: true,
        expiresAt: true,
        id: true,
      },
    });
    await recordAuditEvent(transaction, {
      actorUserId: context.actorUserId,
      eventType: "INVITATION_CREATED",
      metadata: { expiresAt: created.expiresAt.toISOString() },
      targetId: created.id,
      targetType: "Invitation",
    });
    return created;
  });
  return Object.freeze({ ...invitation, token });
}

export async function revokeInvitation(
  database: DatabaseClient,
  invitationId: string,
  actorUserId: string,
  now = new Date(),
) {
  const id = z.uuid().parse(invitationId);
  const changed = await database.$transaction(async (transaction) => {
    const result = await transaction.invitation.updateMany({
      data: { revokedAt: now },
      where: { acceptedAt: null, id, revokedAt: null },
    });
    if (result.count !== 0) {
      await recordAuditEvent(transaction, {
        actorUserId,
        eventType: "INVITATION_REVOKED",
        targetId: id,
        targetType: "Invitation",
      });
    }
    return result.count !== 0;
  });
  return changed;
}

export function listInvitations(database: DatabaseClient) {
  return database.invitation.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      acceptedAt: true,
      createdAt: true,
      email: true,
      expiresAt: true,
      id: true,
      revokedAt: true,
    },
    take: 100,
  });
}

export async function acceptInvitation(
  database: DatabaseClient,
  input: {
    readonly email: string;
    readonly hashPassword: (password: string) => Promise<string>;
    readonly name: string;
    readonly now: Date;
    readonly password: string;
    readonly secret: string;
    readonly token: string;
  },
) {
  const tokenHash = hashInvitationToken(input.secret, input.token);
  const email = normalizeEmail(input.email);
  const invitation = await database.invitation.findFirst({
    select: { emailNormalized: true, id: true },
    where: {
      acceptedAt: null,
      expiresAt: { gt: input.now },
      revokedAt: null,
      tokenHash,
    },
  });
  if (!invitation || invitation.emailNormalized !== email) {
    throw new InvitationUnavailableError();
  }
  const passwordHash = await input.hashPassword(input.password);

  try {
    return await database.$transaction(
      async (transaction) => {
        const user = await transaction.user.create({
          data: {
            email,
            emailNormalized: email,
            emailVerified: true,
            name: input.name.trim(),
            preferences: { create: {} },
            role: "MEMBER",
          },
          select: { email: true, id: true, name: true, role: true },
        });
        await transaction.credentialAccount.create({
          data: {
            accountId: user.id,
            passwordHash,
            providerId: "credential",
            userId: user.id,
          },
        });
        const accepted = await transaction.invitation.updateMany({
          data: { acceptedAt: input.now, acceptedUserId: user.id },
          where: {
            acceptedAt: null,
            expiresAt: { gt: input.now },
            id: invitation.id,
            revokedAt: null,
            tokenHash,
          },
        });
        if (accepted.count !== 1) throw new InvitationUnavailableError();
        await recordAuditEvent(transaction, {
          actorUserId: user.id,
          eventType: "INVITATION_ACCEPTED",
          targetId: invitation.id,
          targetType: "Invitation",
        });
        return Object.freeze(user);
      },
      { isolationLevel: "Serializable", timeout: 15_000 },
    );
  } catch (error) {
    if (error instanceof InvitationUnavailableError) throw error;
    const code =
      typeof error === "object" && error !== null && "code" in error
        ? error.code
        : undefined;
    if (code === "P2002" || code === "P2034") {
      throw new InvitationUnavailableError();
    }
    throw error;
  }
}
