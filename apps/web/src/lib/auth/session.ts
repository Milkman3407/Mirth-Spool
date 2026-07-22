import "server-only";

import { getAuthServices } from "./server";

export interface AuthenticatedSession {
  readonly session: {
    readonly createdAt: Date;
    readonly expiresAt: Date;
    readonly id: string;
    readonly userAgent?: string | null;
  };
  readonly user: {
    readonly email: string;
    readonly id: string;
    readonly name: string;
    readonly role: "ADMIN" | "MEMBER";
  };
}

export async function getAuthenticatedSession(
  headers: Headers,
): Promise<AuthenticatedSession | null> {
  const { auth, database } = getAuthServices();
  const result = await auth.api.getSession({ headers });
  if (!result) {
    return null;
  }
  const user = await database.user.findUnique({
    where: { id: result.user.id },
    select: { disabledAt: true, email: true, id: true, name: true, role: true },
  });
  if (!user || user.disabledAt) {
    return null;
  }
  return Object.freeze({
    session: Object.freeze({
      createdAt: result.session.createdAt,
      expiresAt: result.session.expiresAt,
      id: result.session.id,
      userAgent: result.session.userAgent ?? null,
    }),
    user: Object.freeze({
      email: user.email,
      id: user.id,
      name: user.name,
      role: user.role,
    }),
  });
}
