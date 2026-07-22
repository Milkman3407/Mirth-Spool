import { createDatabaseClient, type DatabaseClient } from "@mirthspool/db";
import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  GET as listSources,
  POST as createSource,
} from "../../apps/web/src/app/api/sources/route.js";
import {
  DELETE as deleteSource,
  GET as readSource,
  PATCH as updateSource,
} from "../../apps/web/src/app/api/sources/[sourceId]/route.js";
import { POST as storeCredential } from "../../apps/web/src/app/api/sources/[sourceId]/credentials/route.js";
import { POST as pauseSource } from "../../apps/web/src/app/api/sources/[sourceId]/pause/route.js";
import { POST as refreshSource } from "../../apps/web/src/app/api/sources/[sourceId]/refresh/route.js";
import { POST as resumeSource } from "../../apps/web/src/app/api/sources/[sourceId]/resume/route.js";
import { GET as listSourceRuns } from "../../apps/web/src/app/api/sources/[sourceId]/runs/route.js";
import { POST as validateSource } from "../../apps/web/src/app/api/sources/[sourceId]/validate/route.js";
import { createMirthSpoolAuth } from "../../apps/web/src/lib/auth/factory.js";
import { hashPassword } from "../../apps/web/src/lib/auth/password.js";

const origin = "http://localhost:3000";
const authSecret = "integration-only-auth-secret-with-32-characters";
const password = "Correct-Horse-Battery-Staple-73!";

function request(
  path: string,
  options: {
    readonly body?: unknown;
    readonly cookie?: string;
    readonly method?: string;
  } = {},
): Request {
  return new Request(`${origin}${path}`, {
    ...(options.body === undefined
      ? {}
      : { body: JSON.stringify(options.body) }),
    headers: {
      ...(options.cookie === undefined ? {} : { cookie: options.cookie }),
      ...(options.body === undefined
        ? {}
        : { "content-type": "application/json", origin }),
    },
    method: options.method ?? "GET",
  });
}

function context(sourceId: string) {
  return { params: Promise.resolve({ sourceId }) };
}

function cookieHeader(headers: Headers): string {
  return headers
    .getSetCookie()
    .map((value) => value.split(";", 1)[0])
    .join("; ");
}

describe.sequential("administrative source management", () => {
  let database: DatabaseClient;
  let adminCookie: string;
  let memberCookie: string;
  let fixtureServer: Server;

  beforeAll(async () => {
    fixtureServer = createServer((request_, response) => {
      if (request_.url !== "/feed.xml") {
        response.writeHead(404).end();
        return;
      }
      response.writeHead(200, {
        "content-type": "application/rss+xml; charset=utf-8",
        etag: '"fixture-v1"',
      });
      response.end(
        '<?xml version="1.0"?><rss version="2.0"><channel><title>Controlled fixture feed</title><item><guid>fixture-1</guid><title>Fixture meme</title><link>https://example.test/memes/fixture-1</link><enclosure url="https://cdn.example.test/fixture.png" type="image/png"/></item></channel></rss>',
      );
    });
    await new Promise<void>((resolve, reject) => {
      fixtureServer.once("error", reject);
      fixtureServer.listen(58_080, "127.0.0.1", resolve);
    });
    database = createDatabaseClient({
      connectionString: process.env.DATABASE_URL!,
    });
    await database.auditEvent.deleteMany();
    await database.sourceCredential.deleteMany();
    await database.source.deleteMany();
    await database.user.deleteMany();
    const passwordHash = await hashPassword(password);
    const [administrator, member] = await database.$transaction([
      database.user.create({
        data: {
          email: "source-admin@example.test",
          emailNormalized: "source-admin@example.test",
          name: "Source Administrator",
          role: "ADMIN",
        },
      }),
      database.user.create({
        data: {
          email: "source-member@example.test",
          emailNormalized: "source-member@example.test",
          name: "Source Member",
          role: "MEMBER",
        },
      }),
    ]);
    await database.credentialAccount.createMany({
      data: [administrator, member].map((user) => ({
        accountId: user.emailNormalized,
        passwordHash,
        providerId: "credential",
        userId: user.id,
      })),
    });
    const auth = createMirthSpoolAuth({
      database,
      publicOrigin: origin,
      secret: authSecret,
      secureCookies: false,
    });
    adminCookie = cookieHeader(
      (
        await auth.api.signInEmail({
          body: { email: administrator.email, password },
          headers: new Headers({ origin }),
          returnHeaders: true,
        })
      ).headers,
    );
    memberCookie = cookieHeader(
      (
        await auth.api.signInEmail({
          body: { email: member.email, password },
          headers: new Headers({ origin }),
          returnHeaders: true,
        })
      ).headers,
    );
  });

  afterAll(async () => {
    await database.$disconnect();
    await new Promise<void>((resolve, reject) =>
      fixtureServer.close((error) => (error ? reject(error) : resolve())),
    );
  });

  it("requires an administrator for source APIs", async () => {
    expect((await listSources(request("/api/sources"))).status).toBe(401);
    expect(
      (await listSources(request("/api/sources", { cookie: memberCookie })))
        .status,
    ).toBe(403);
  });

  it("creates, validates, updates, pauses, and soft-deletes a source with audit events", async () => {
    const createdResponse = await createSource(
      request("/api/sources", {
        body: {
          config: {
            feedUrl: "http://127.0.0.1:58080/feed.xml",
            maxEntries: 25,
          },
          displayName: "Controlled RSS fixture",
          enabled: false,
          kind: "RSS",
          pollIntervalSeconds: 900,
          priority: 1,
        },
        cookie: adminCookie,
        method: "POST",
      }),
    );
    expect(createdResponse.status).toBe(201);
    const created = (await createdResponse.json()) as {
      source: { id: string; kind: string };
    };
    const sourceId = created.source.id;

    const changedKind = await updateSource(
      request(`/api/sources/${sourceId}`, {
        body: { kind: "LEMMY" },
        cookie: adminCookie,
        method: "PATCH",
      }),
      context(sourceId),
    );
    expect(changedKind.status).toBe(400);

    const updated = await updateSource(
      request(`/api/sources/${sourceId}`, {
        body: { displayName: "Edited RSS source", pollIntervalSeconds: 1_800 },
        cookie: adminCookie,
        method: "PATCH",
      }),
      context(sourceId),
    );
    expect(updated.status).toBe(200);
    expect(await updated.json()).toMatchObject({
      source: {
        displayName: "Edited RSS source",
        kind: "RSS",
        pollIntervalSeconds: 1_800,
      },
    });

    expect(
      (
        await pauseSource(
          request(`/api/sources/${sourceId}/pause`, {
            body: {},
            cookie: adminCookie,
            method: "POST",
          }),
          context(sourceId),
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await resumeSource(
          request(`/api/sources/${sourceId}/resume`, {
            body: {},
            cookie: adminCookie,
            method: "POST",
          }),
          context(sourceId),
        )
      ).status,
    ).toBe(200);
    const refresh = await refreshSource(
      request(`/api/sources/${sourceId}/refresh`, {
        body: {},
        cookie: adminCookie,
        method: "POST",
      }),
      context(sourceId),
    );
    expect(refresh.status).toBe(202);
    expect(await refresh.json()).toMatchObject({
      job: { id: expect.any(String) },
    });
    const runs = await listSourceRuns(
      request(`/api/sources/${sourceId}/runs?limit=5`, { cookie: adminCookie }),
      context(sourceId),
    );
    expect(runs.status).toBe(200);
    expect(await runs.json()).toMatchObject({ items: [], nextCursor: null });
    const validation = await validateSource(
      request(`/api/sources/${sourceId}/validate`, {
        body: {},
        cookie: adminCookie,
        method: "POST",
      }),
      context(sourceId),
    );
    expect(await validation.json()).toMatchObject({
      result: {
        details: {
          feedFormat: "RSS",
          feedTitle: "Controlled fixture feed",
          sampleItemCount: "1",
        },
        ok: true,
      },
    });

    const read = await readSource(
      request(`/api/sources/${sourceId}`, { cookie: adminCookie }),
      context(sourceId),
    );
    expect(await read.json()).toMatchObject({
      source: { id: sourceId, status: "ACTIVE" },
    });

    expect(
      (
        await deleteSource(
          request(`/api/sources/${sourceId}`, {
            body: {},
            cookie: adminCookie,
            method: "DELETE",
          }),
          context(sourceId),
        )
      ).status,
    ).toBe(200);
    expect(
      await database.source.findUniqueOrThrow({ where: { id: sourceId } }),
    ).toMatchObject({
      deletedAt: expect.any(Date),
      enabled: false,
      status: "PAUSED",
    });
    expect(
      await database.auditEvent.findMany({
        select: { eventType: true },
        where: { targetId: sourceId },
      }),
    ).toEqual(
      expect.arrayContaining([
        { eventType: "SOURCE_CREATED" },
        { eventType: "SOURCE_UPDATED" },
        { eventType: "SOURCE_PAUSED" },
        { eventType: "SOURCE_DELETED" },
      ]),
    );
  });

  it("encrypts credential rotation and never returns secret or envelope details", async () => {
    const source = await database.source.create({
      data: {
        configJson: {},
        displayName: "Credential placeholder",
        enabled: false,
        kind: "RSS",
        status: "PAUSED",
      },
    });
    const plaintext = "integration-provider-secret";
    const response = await storeCredential(
      request(`/api/sources/${source.id}/credentials`, {
        body: {
          kind: "ACCESS_TOKEN",
          label: "primary",
          payload: { token: plaintext },
        },
        cookie: adminCookie,
        method: "POST",
      }),
      context(source.id),
    );
    expect(response.status).toBe(201);
    const body = JSON.stringify(await response.json());
    expect(body).not.toContain(plaintext);
    expect(body).not.toMatch(/cipher|encrypt|keyVersion|payload/i);
    const stored = await database.sourceCredential.findFirstOrThrow({
      where: { sourceId: source.id },
    });
    expect(Buffer.from(stored.encryptedPayload).toString("utf8")).not.toContain(
      plaintext,
    );
    expect(stored.keyVersion).toBe(1);
    expect(
      await database.auditEvent.count({
        where: { eventType: "SOURCE_CREDENTIAL_ROTATED", targetId: source.id },
      }),
    ).toBe(1);
  });
});
