import { z } from "zod";

const allowedKeys = new Set(["cursor", "limit"]);

export function parseLibraryQuery(url: string) {
  const parameters = new URL(url).searchParams;
  for (const key of parameters.keys()) {
    if (!allowedKeys.has(key)) throw new Error("VALIDATION_FAILED");
  }
  return Object.freeze({
    cursor: z
      .string()
      .max(2_048)
      .optional()
      .parse(parameters.get("cursor") ?? undefined),
    limit: z.coerce
      .number()
      .int()
      .min(1)
      .max(50)
      .default(40)
      .parse(parameters.get("limit") ?? undefined),
  });
}
