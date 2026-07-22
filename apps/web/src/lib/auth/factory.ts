import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";

import type { DatabaseClient } from "@mirthspool/db";

import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from "./password-policy";
import { hashPassword, verifyPassword } from "./password";

export function createMirthSpoolAuth(options: {
  readonly database: DatabaseClient;
  readonly publicOrigin: string;
  readonly secret: string;
  readonly secureCookies: boolean;
}) {
  return betterAuth({
    account: {
      fields: { password: "passwordHash" },
      modelName: "CredentialAccount",
    },
    advanced: {
      cookiePrefix: "mirthspool",
      database: { defaultFindManyLimit: 50, generateId: "uuid" },
      defaultCookieAttributes: {
        httpOnly: true,
        path: "/",
        sameSite: "lax",
        secure: options.secureCookies,
      },
      disableCSRFCheck: false,
      disableOriginCheck: false,
      useSecureCookies: options.secureCookies,
    },
    basePath: "/api/auth",
    baseURL: options.publicOrigin,
    database: prismaAdapter(options.database, { provider: "postgresql" }),
    emailAndPassword: {
      disableSignUp: true,
      enabled: true,
      maxPasswordLength: MAX_PASSWORD_LENGTH,
      minPasswordLength: MIN_PASSWORD_LENGTH,
      password: { hash: hashPassword, verify: verifyPassword },
    },
    logger: { disabled: true },
    secret: options.secret,
    rateLimit: { enabled: false },
    session: {
      cookieCache: { enabled: false },
      expiresIn: 60 * 60 * 24 * 7,
      fields: { expiresAt: "expires", token: "sessionToken" },
      freshAge: 60 * 60,
      modelName: "Session",
      updateAge: 60 * 60 * 24,
    },
    trustedOrigins: [options.publicOrigin],
    user: {
      additionalFields: {
        disabledAt: {
          input: false,
          required: false,
          returned: false,
          type: "date",
        },
        role: {
          defaultValue: "MEMBER",
          input: false,
          required: true,
          returned: true,
          type: ["ADMIN", "MEMBER"],
        },
      },
      modelName: "User",
    },
  });
}

export type MirthSpoolAuth = ReturnType<typeof createMirthSpoolAuth>;
