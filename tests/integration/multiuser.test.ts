import {
  createDatabaseClient,
  queryFeed,
  readUserPreferences,
  setUserAction,
  writeUserPreferences,
  type DatabaseClient,
} from "@mirthspool/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  acceptInvitation,
  createInvitation,
  hashInvitationToken,
  InvitationUnavailableError,
  revokeInvitation,
} from "../../apps/web/src/lib/auth/invitation-service.js";
import {
  deleteMember,
  revokeMemberSessions,
  setMemberDisabled,
} from "../../apps/web/src/lib/auth/member-administration.js";
import { hashPassword } from "../../apps/web/src/lib/auth/password.js";
import { ratingsFor } from "../../apps/web/src/lib/feed/feed-service.js";

const secret = ["m18", "integration", "fixture", "key", "material"].join("-");
const now = new Date("2026-07-23T12:00:00.000Z");

describe.sequential("multi-user invitation lifecycle and isolation", () => {
  let database: DatabaseClient;
  let adminId: string;
  let memberOneId: string;
  let memberTwoId: string;

  beforeAll(async () => {
    database = createDatabaseClient({
      connectionString: process.env.DATABASE_URL!,
    });
    await database.invitation.deleteMany();
    await database.user.deleteMany({
      where: { email: { endsWith: "@m18.example.test" } },
    });
    const admin = await database.user.create({
      data: {
        email: "admin@m18.example.test",
        emailNormalized: "admin@m18.example.test",
        emailVerified: true,
        name: "M18 Admin",
        preferences: { create: {} },
        role: "ADMIN",
      },
    });
    adminId = admin.id;
  });

  afterAll(async () => {
    await database.invitation.deleteMany();
    await database.user.deleteMany({
      where: { email: { endsWith: "@m18.example.test" } },
    });
    await database.$disconnect();
  });

  it("accepts an expiring hashed invitation exactly once", async () => {
    const created = await createInvitation(
      database,
      { email: "one@m18.example.test", expiresInHours: 24 },
      { actorUserId: adminId, now, secret },
    );
    const stored = await database.invitation.findUniqueOrThrow({
      where: { id: created.id },
    });
    expect(stored.tokenHash).toBe(hashInvitationToken(secret, created.token));
    expect(JSON.stringify(stored)).not.toContain(created.token);

    const member = await acceptInvitation(database, {
      email: "one@m18.example.test",
      hashPassword,
      name: "Member One",
      now: new Date(now.valueOf() + 1_000),
      password: "Correct-Horse-Battery-Staple-91!",
      secret,
      token: created.token,
    });
    memberOneId = member.id;
    expect(member.role).toBe("MEMBER");
    expect(await readUserPreferences(database, member.id)).toMatchObject({
      historyEnabled: true,
      maximumContentRating: "SAFE",
    });
    await expect(
      acceptInvitation(database, {
        email: "one@m18.example.test",
        hashPassword,
        name: "Replay",
        now: new Date(now.valueOf() + 2_000),
        password: "Correct-Horse-Battery-Staple-92!",
        secret,
        token: created.token,
      }),
    ).rejects.toBeInstanceOf(InvitationUnavailableError);
  });

  it("rejects expired and revoked invitations", async () => {
    const expired = await createInvitation(
      database,
      { email: "expired@m18.example.test", expiresInHours: 1 },
      { actorUserId: adminId, now, secret },
    );
    await expect(
      acceptInvitation(database, {
        email: "expired@m18.example.test",
        hashPassword,
        name: "Expired",
        now: new Date(now.valueOf() + 2 * 60 * 60 * 1_000),
        password: "Correct-Horse-Battery-Staple-93!",
        secret,
        token: expired.token,
      }),
    ).rejects.toBeInstanceOf(InvitationUnavailableError);

    const revoked = await createInvitation(
      database,
      { email: "revoked@m18.example.test", expiresInHours: 24 },
      { actorUserId: adminId, now, secret },
    );
    expect(await revokeInvitation(database, revoked.id, adminId, now)).toBe(
      true,
    );
    await expect(
      acceptInvitation(database, {
        email: "revoked@m18.example.test",
        hashPassword,
        name: "Revoked",
        now,
        password: "Correct-Horse-Battery-Staple-94!",
        secret,
        token: revoked.token,
      }),
    ).rejects.toBeInstanceOf(InvitationUnavailableError);
  });

  it("keeps conflicting actions and preferences isolated by session user", async () => {
    const created = await createInvitation(
      database,
      { email: "two@m18.example.test", expiresInHours: 24 },
      { actorUserId: adminId, now, secret },
    );
    const member = await acceptInvitation(database, {
      email: "two@m18.example.test",
      hashPassword,
      name: "Member Two",
      now,
      password: "Correct-Horse-Battery-Staple-95!",
      secret,
      token: created.token,
    });
    memberTwoId = member.id;
    const content = await database.contentItem.create({
      data: {
        contentRating: "SENSITIVE",
        publishedAt: now,
        randomKey: 42,
        status: "ACTIVE",
        title: "M18 scoped content",
      },
    });
    await setUserAction(database, {
      contentItemId: content.id,
      kind: "FAVORITE",
      userId: memberOneId,
    });
    await setUserAction(database, {
      contentItemId: content.id,
      kind: "HIDE",
      userId: memberTwoId,
    });
    await writeUserPreferences(database, memberOneId, {
      historyEnabled: false,
      maximumContentRating: "ADULT",
    });
    await writeUserPreferences(database, memberTwoId, {
      historyEnabled: true,
      maximumContentRating: "SAFE",
    });

    const one = await queryFeed(database, {
      allowedRatings: ["SAFE", "SENSITIVE"],
      limit: 10,
      mode: "new",
      userId: memberOneId,
    });
    const two = await queryFeed(database, {
      allowedRatings: ["SAFE", "SENSITIVE"],
      limit: 10,
      mode: "new",
      userId: memberTwoId,
    });
    expect(one.rows[0]?.actions).toEqual([
      expect.objectContaining({ kind: "FAVORITE" }),
    ]);
    expect(two.rows).toHaveLength(0);
    expect(await readUserPreferences(database, memberOneId)).toMatchObject({
      historyEnabled: false,
      maximumContentRating: "ADULT",
    });
    expect(await readUserPreferences(database, memberTwoId)).toMatchObject({
      historyEnabled: true,
      maximumContentRating: "SAFE",
    });
    expect(ratingsFor("SENSITIVE", undefined, "ADULT")).toEqual([
      "SAFE",
      "SENSITIVE",
    ]);
    expect(ratingsFor("ADULT", undefined, "SAFE")).toEqual(["SAFE"]);
  });

  it("revokes, disables, and deletes only member accounts", async () => {
    await database.session.create({
      data: {
        expires: new Date(now.valueOf() + 86_400_000),
        sessionToken: "m18-member-session",
        userId: memberTwoId,
      },
    });
    expect(await revokeMemberSessions(database, adminId, memberTwoId)).toBe(1);
    await setMemberDisabled(database, {
      actorUserId: adminId,
      disabled: true,
      now,
      userId: memberTwoId,
    });
    expect(
      await database.user.findUnique({
        select: { disabledAt: true },
        where: { id: memberTwoId },
      }),
    ).toEqual({ disabledAt: now });
    await expect(
      setMemberDisabled(database, {
        actorUserId: adminId,
        disabled: true,
        now,
        userId: adminId,
      }),
    ).rejects.toThrow("MEMBER_NOT_FOUND");

    await deleteMember(database, adminId, memberTwoId);
    expect(
      await database.user.findUnique({ where: { id: memberTwoId } }),
    ).toBeNull();
    expect(
      await database.auditEvent.findFirst({
        orderBy: { occurredAt: "desc" },
        where: { eventType: "MEMBER_DELETED", targetId: memberTwoId },
      }),
    ).toMatchObject({ actorUserId: adminId });
  });
});
