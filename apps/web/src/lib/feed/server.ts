import "server-only";

import { getAuthServices } from "../auth/server";

export function getFeedServices() {
  const { authConfig, database } = getAuthServices();
  return Object.freeze({ database, secret: authConfig.secret });
}
