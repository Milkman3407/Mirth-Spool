import {
  contentRandomKey,
  createDatabaseClient,
  readUserActionState,
  recordMeaningfulView,
  removeUserAction,
  setUserAction,
  writeSetting,
} from "@mirthspool/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PUT as favoriteRoute } from "../../apps/web/src/app/api/content/[contentId]/favorite/route.js";
import { createMirthSpoolAuth } from "../../apps/web/src/lib/auth/factory.js";
import { hashPassword } from "../../apps/web/src/lib/auth/password.js";
import { createFirstAdministrator } from "../../apps/web/src/lib/auth/setup-service.js";
import {
  recordContentView,
  updateHistorySetting,
} from "../../apps/web/src/lib/actions/action-service.js";
import { readFeed } from "../../apps/web/src/lib/feed/feed-service.js";
import {
  HistoryDisabledError,
  readLibrary,
} from "../../apps/web/src/lib/library/library-service.js";

const origin = "http://localhost:3000";
const secret = "integration-only-auth-secret-with-32-characters";
const database = createDatabaseClient({
  connectionString: process.env.DATABASE_URL!,
  maxConnections: 8,
});
const services = { database, secret };
const contentIds = [
  "10000000-0000-4000-8000-000000000001",
  "10000000-0000-4000-8000-000000000002",
  "10000000-0000-4000-8000-000000000003",
  "10000000-0000-4000-8000-000000000004",
] as const;
let userId: string;
let otherUserId: string;
let cookie: string;

function cookieHeader(headers: Headers): string {
  return headers
    .getSetCookie()
    .map((value) => value.split(";", 1)[0])
    .join("; ");
}

beforeAll(async () => {
  await database.userAction.deleteMany();
  await database.auditEvent.deleteMany();
  await database.mediaAsset.deleteMany();
  await database.sourcePost.deleteMany();
  await database.contentItem.deleteMany();
  await database.source.deleteMany();
  await database.user.deleteMany();
  await database.appSetting.deleteMany();

  const administrator = await createFirstAdministrator(database, {
    email: "actions@example.test",
    hashPassword,
    name: "Action Administrator",
    password: "Correct-Horse-Battery-Staple-73!",
  });
  userId = administrator.id;
  otherUserId = (
    await database.user.create({
      data: {
        email: "other-actions@example.test",
        emailNormalized: "other-actions@example.test",
        name: "Other Action User",
      },
    })
  ).id;
  await Promise.all(
    contentIds.map((id, index) =>
      database.contentItem.create({
        data: {
          contentRating: "SAFE",
          id,
          publishedAt: new Date(
            `2026-07-${String(20 + index).padStart(2, "0")}T12:00:00.000Z`,
          ),
          randomKey: contentRandomKey(id),
          rankingScore: 100 - index,
          title: `Action item ${index + 1}`,
        },
      }),
    ),
  );
  await writeSetting(database, "content.maximumRating", "SAFE");
  await writeSetting(database, "history.enabled", true);

  const auth = createMirthSpoolAuth({
    database,
    publicOrigin: origin,
    secret,
    secureCookies: false,
  });
  const signIn = await auth.api.signInEmail({
    body: {
      email: "actions@example.test",
      password: "Correct-Horse-Battery-Staple-73!",
    },
    headers: new Headers({ origin }),
    returnHeaders: true,
  });
  cookie = cookieHeader(signIn.headers);
});

afterAll(async () => {
  await database.userAction.deleteMany();
  await database.auditEvent.deleteMany();
  await database.session.deleteMany();
  await database.credentialAccount.deleteMany();
  await database.contentItem.deleteMany({
    where: { id: { in: [...contentIds] } },
  });
  await database.user.deleteMany({
    where: { id: { in: [userId, otherUserId] } },
  });
  await database.appSetting.deleteMany();
  await database.$disconnect();
});

describe.sequential("user actions and library persistence", () => {
  it("makes favorite, hide, and unhide idempotent under repeated requests", async () => {
    await Promise.all(
      Array.from({ length: 5 }, () =>
        setUserAction(database, {
          contentItemId: contentIds[0],
          kind: "FAVORITE",
          userId,
        }),
      ),
    );
    expect(
      await database.userAction.count({
        where: { contentItemId: contentIds[0], kind: "FAVORITE", userId },
      }),
    ).toBe(1);
    await Promise.all(
      Array.from({ length: 3 }, () =>
        removeUserAction(database, {
          contentItemId: contentIds[0],
          kind: "FAVORITE",
          userId,
        }),
      ),
    );
    expect(
      await database.userAction.count({
        where: { contentItemId: contentIds[0], kind: "FAVORITE", userId },
      }),
    ).toBe(0);

    await Promise.all(
      Array.from({ length: 4 }, () =>
        setUserAction(database, {
          contentItemId: contentIds[0],
          kind: "HIDE",
          userId,
        }),
      ),
    );
    expect(
      (
        await readFeed(services, userId, `${origin}/api/feed?mode=new`)
      ).items.map((item) => item.id),
    ).not.toContain(contentIds[0]);
    await Promise.all(
      Array.from({ length: 3 }, () =>
        removeUserAction(database, {
          contentItemId: contentIds[0],
          kind: "HIDE",
          userId,
        }),
      ),
    );
    expect(
      (
        await readFeed(services, userId, `${origin}/api/feed?mode=new`)
      ).items.map((item) => item.id),
    ).toContain(contentIds[0]);
  });

  it("paginates persisted libraries without leaking another user's actions", async () => {
    for (const [index, contentItemId] of contentIds.slice(0, 3).entries()) {
      await setUserAction(
        database,
        { contentItemId, kind: "FAVORITE", userId },
        { now: () => new Date(1_800_000_000_000 + index * 1_000) },
      );
    }
    await setUserAction(database, {
      contentItemId: contentIds[3],
      kind: "FAVORITE",
      userId: otherUserId,
    });
    const first = await readLibrary(
      services,
      userId,
      "favorites",
      `${origin}/api/library/favorites?limit=2`,
    );
    const second = await readLibrary(
      services,
      userId,
      "favorites",
      `${origin}/api/library/favorites?limit=2&cursor=${encodeURIComponent(first.nextCursor!)}`,
    );
    expect(first.hasMore).toBe(true);
    expect(first.items.map((item) => item.id)).toEqual([
      contentIds[2],
      contentIds[1],
    ]);
    expect(second.items.map((item) => item.id)).toEqual([contentIds[0]]);
    expect(
      [...first.items, ...second.items].map((item) => item.id),
    ).not.toContain(contentIds[3]);
  });

  it("coalesces repeated views and makes unseen honor the history setting", async () => {
    const firstView = new Date("2026-07-22T10:00:00.000Z");
    await recordMeaningfulView(
      database,
      { contentItemId: contentIds[0], userId },
      { now: () => firstView },
    );
    await Promise.all(
      Array.from({ length: 3 }, () =>
        recordMeaningfulView(
          database,
          { contentItemId: contentIds[0], userId },
          { now: () => new Date(firstView.valueOf() + 5 * 60_000) },
        ),
      ),
    );
    await recordMeaningfulView(
      database,
      { contentItemId: contentIds[0], userId },
      { now: () => new Date(firstView.valueOf() + 16 * 60_000) },
    );
    expect(
      await readUserActionState(database, {
        contentItemId: contentIds[0],
        userId,
      }),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "VIEW", occurrenceCount: 2 }),
      ]),
    );
    expect(
      (
        await readFeed(services, userId, `${origin}/api/feed?mode=unseen`)
      ).items.map((item) => item.id),
    ).not.toContain(contentIds[0]);
    expect(
      (
        await readLibrary(
          services,
          userId,
          "history",
          `${origin}/api/library/history`,
        )
      ).items.map((item) => item.id),
    ).toContain(contentIds[0]);

    await updateHistorySetting(services, userId, false);
    expect(
      await database.userAction.count({ where: { kind: "VIEW", userId } }),
    ).toBe(0);
    await recordContentView(services, userId, contentIds[0]);
    expect(
      await database.userAction.count({ where: { kind: "VIEW", userId } }),
    ).toBe(0);
    expect(
      (
        await readFeed(services, userId, `${origin}/api/feed?mode=unseen`)
      ).items.map((item) => item.id),
    ).toContain(contentIds[0]);
    await expect(
      readLibrary(services, userId, "history", `${origin}/api/library/history`),
    ).rejects.toBeInstanceOf(HistoryDisabledError);
    await updateHistorySetting(services, userId, true);
  });

  it("derives action identity from the session and rejects client identity fields", async () => {
    await removeUserAction(database, {
      contentItemId: contentIds[3],
      kind: "FAVORITE",
      userId: otherUserId,
    });
    const context = { params: Promise.resolve({ contentId: contentIds[3] }) };
    const injected = await favoriteRoute(
      new Request(`${origin}/api/content/${contentIds[3]}/favorite`, {
        body: JSON.stringify({ userId: otherUserId }),
        headers: {
          "content-type": "application/json",
          cookie,
          origin,
        },
        method: "PUT",
      }),
      context,
    );
    expect(injected.status).toBe(400);
    const oversized = await favoriteRoute(
      new Request(`${origin}/api/content/${contentIds[3]}/favorite`, {
        body: JSON.stringify({ padding: "x".repeat(256) }),
        headers: {
          "content-type": "application/json",
          cookie,
          origin,
        },
        method: "PUT",
      }),
      context,
    );
    expect(oversized.status).toBe(413);
    const accepted = await favoriteRoute(
      new Request(`${origin}/api/content/${contentIds[3]}/favorite`, {
        body: "{}",
        headers: {
          "content-type": "application/json",
          cookie,
          origin,
        },
        method: "PUT",
      }),
      context,
    );
    expect(accepted.status).toBe(200);
    expect(
      await database.userAction.count({
        where: { contentItemId: contentIds[3], kind: "FAVORITE", userId },
      }),
    ).toBe(1);
    expect(
      await database.userAction.count({
        where: {
          contentItemId: contentIds[3],
          kind: "FAVORITE",
          userId: otherUserId,
        },
      }),
    ).toBe(0);
  });
});
