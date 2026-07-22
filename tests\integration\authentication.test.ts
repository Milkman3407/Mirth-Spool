import { createDatabaseClient, type DatabaseClient } from "@mirthspool/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createMirthSpoolAuth } from "../../apps/web/src/lib/auth/factory.js";
import {
  hashPassword,
  verifyPassword,
} from "../../apps/web/src/lib/auth/password.js";
import {
  createFirstAdministrator,
  SetupClosedError,
} from "../../apps/web/src/lib/auth/setup-service.js";

const origin = "http://localhost:3000";
const secret = "integration-only-auth-secret-with-32-characters";
const credentials = {
  email: "admin@example.test",
  name: "Test Administrator",
  password: "Correct-Horse-Battery-Staple-73!",
};

function cookieHeader(headers: Headers): string {
  return headers
    .getSetCookie()
    .map((value) => value.split(";", 1)[0])
    .join("; ");
}

describe.sequential("authentication persistence", () => {
  let database: DatabaseClient;
  let auth: ReturnType<typeof createMirthSpoolAuth>;

  beforeAll(async () => {
    database = createDatabaseClient({
      connectionString: process.env.DATABASE_URL!,
    });
    await database.auditEvent.deleteMany();
    await database.user.deleteMany();
    auth = createMirthSpoolAuth({
      database,
      publicOrigin: origin,
      secret,
      secureCookies: false,
    });
  });

  afterAll(async () => database.$disconnect());

  it("serializes setup so exactly one administrator is created", async () => {
    const attempts = await Promise.allSettled([
      createFirstAdministrator(database, { ...credentials, hashPassword }),
      createFirstAdministrator(database, { ...credentials, hashPassword }),
    ]);
    if (attempts.every((attempt) => attempt.status === "rejected")) {
      throw new AggregateError(
        attempts.map((attempt) =>
          attempt.status === "rejected"
            ? attempt.reason
            : new Error("unexpected result"),
        ),
        "Every concurrent setup attempt failed",
      );
    }
    expect(
      attempts.filter((attempt) => attempt.status === "fulfilled"),
    ).toHaveLength(1);
    const rejected = attempts.find((attempt) => attempt.status === "rejected");
    expect(rejected).toMatchObject({ reason: expect.any(SetupClosedError) });
    expect(await database.user.count()).toBe(1);
    expect(await database.user.findFirst({ select: { role: true } })).toEqual({
      role: "ADMIN",
    });
    const account = await database.credentialAccount.findFirstOrThrow();
    expect(account.passwordHash).toMatch(/^\$argon2id\$/);
    expect(
      await verifyPassword({
        hash: account.passwordHash,
        password: credentials.password,
      }),
    ).toBe(true);
  });

  it("creates, expires, revokes, and logs out database sessions", async () => {
    const signIn = await auth.api.signInEmail({
      body: { email: credentials.email, password: credentials.password },
      headers: new Headers({ origin }),
      returnHeaders: true,
    });
    let cookie = cookieHeader(signIn.headers);
    expect(cookie).toContain("mirthspool.session_token=");
    let session = await auth.api.getSession({
      headers: new Headers({ cookie }),
    });
    expect(session?.user.email).toBe(credentials.email);

    await database.session.update({
      data: { expires: new Date(0) },
      where: { id: session!.session.id },
    });
    expect(
      await auth.api.getSession({ headers: new Headers({ cookie }) }),
    ).toBeNull();

    const second = await auth.api.signInEmail({
      body: { email: credentials.email, password: credentials.password },
      headers: new Headers({ origin }),
      returnHeaders: true,
    });
    cookie = cookieHeader(second.headers);
    session = await auth.api.getSession({ headers: new Headers({ cookie }) });
    await database.session.delete({ where: { id: session!.session.id } });
    expect(
      await auth.api.getSession({ headers: new Headers({ cookie }) }),
    ).toBeNull();

    const third = await auth.api.signInEmail({
      body: { email: credentials.email, password: credentials.password },
      headers: new Headers({ origin }),
      returnHeaders: true,
    });
    cookie = cookieHeader(third.headers);
    expect(
      await auth.api.getSession({ headers: new Headers({ cookie }) }),
    ).not.toBeNull();
    await auth.api.signOut({ headers: new Headers({ cookie, origin }) });
    expect(
      await auth.api.getSession({ headers: new Headers({ cookie }) }),
    ).toBeNull();
  });
});
