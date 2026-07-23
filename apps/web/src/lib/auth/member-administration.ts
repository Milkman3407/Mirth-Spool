import "server-only";

import { z } from "zod";

import type { DatabaseClient } from "@mirthspool/db";

import { recordAuditEvent } from "./audit";

export function listMembers(database: DatabaseClient) {
  return database.user.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      createdAt: true,
      disabledAt: true,
      email: true,
      id: true,
      lastLoginAt: true,
      name: true,
      role: true,
    },
    take: 100,
  });
}

export async function setMemberDisabled(
  database: DatabaseClient,
  input: {
    readonly actorUserId: string;
    readonly disabled: boolean;
    readonly now: Date;
    readonly userId: string;
  },
) {
  const userId = z.uuid().parse(input.userId);
  const target = await requireMember(database, userId);
  await database.$transaction(async (transaction) => {
    await transaction.user.update({
      data: { disabledAt: input.disabled ? input.now : null },
      where: { id: target.id },
    });
    if (input.disabled) {
      await transaction.session.deleteMany({ where: { userId: target.id } });
    }
    await recordAuditEvent(transaction, {
      actorUserId: input.actorUserId,
      eventType: input.disabled ? "MEMBER_DISABLED" : "MEMBER_ENABLED",
      targetId: target.id,
      targetType: "User",
    });
  });
}

export async function revokeMemberSessions(
  database: DatabaseClient,
  actorUserId: string,
  rawUserId: string,
) {
  const target = await requireMember(database, z.uuid().parse(rawUserId));
  const count = await database.$transaction(async (transaction) => {
    const deleted = await transaction.session.deleteMany({
      where: { userId: target.id },
    });
    await recordAuditEvent(transaction, {
      actorUserId,
      eventType: "MEMBER_SESSIONS_REVOKED",
      metadata: { count: deleted.count },
      targetId: target.id,
      targetType: "User",
    });
    return deleted.count;
  });
  return count;
}

export async function deleteMember(
  database: DatabaseClient,
  actorUserId: string,
  rawUserId: string,
) {
  const target = await requireMember(database, z.uuid().parse(rawUserId));
  await database.$transaction(async (transaction) => {
    await recordAuditEvent(transaction, {
      actorUserId,
      eventType: "MEMBER_DELETED",
      metadata: {
        retainedAuditReferences: true,
        userActionsDeleted: true,
      },
      targetId: target.id,
      targetType: "User",
    });
    await transaction.user.delete({ where: { id: target.id } });
  });
}

async function requireMember(database: DatabaseClient, userId: string) {
  const target = await database.user.findUnique({
    select: { id: true, role: true },
    where: { id: userId },
  });
  if (!target || target.role !== "MEMBER") throw new Error("MEMBER_NOT_FOUND");
  return target;
}
