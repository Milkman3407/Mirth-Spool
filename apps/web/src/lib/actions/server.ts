import "server-only";

import { getAuthServices } from "../auth/server";

export function getActionServices() {
  const { database } = getAuthServices();
  return Object.freeze({ database });
}
