import type { DatabaseClient } from "@mirthspool/db";

type AuditClient = Pick<DatabaseClient, "auditEvent">;

export async function recordAuditEvent(
  client: AuditClient,
  input: {
    readonly actorUserId?: string;
    readonly eventType: string;
    readonly metadata?: Readonly<Record<string, boolean | number | string>>;
    readonly targetId?: string;
    readonly targetType?: string;
  },
): Promise<void> {
  await client.auditEvent.create({
    data: {
      ...(input.actorUserId
        ? { actor: { connect: { id: input.actorUserId } } }
        : {}),
      eventType: input.eventType.slice(0, 80),
      ...(input.metadata ? { metadataJson: { ...input.metadata } } : {}),
      ...(input.targetId ? { targetId: input.targetId.slice(0, 128) } : {}),
      ...(input.targetType
        ? { targetType: input.targetType.slice(0, 80) }
        : {}),
    },
  });
}
