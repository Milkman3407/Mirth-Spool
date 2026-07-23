import { createHash } from "node:crypto";
import { z } from "zod";

const modes = ["new", "hot", "random", "unseen", "for-you"] as const;
const mediaKinds = ["IMAGE", "ANIMATED_IMAGE", "VIDEO", "LINK"] as const;
const allowedKeys = new Set([
  "mode",
  "cursor",
  "limit",
  "seed",
  "sourceId",
  "mediaKind",
  "rating",
  "from",
  "to",
  "tag",
  "includeSeen",
]);

export function parseFeedQuery(url: string) {
  const parameters = new URL(url).searchParams;
  for (const key of parameters.keys())
    if (!allowedKeys.has(key)) throw new Error("VALIDATION_FAILED");
  const mode = z
    .enum(modes)
    .default("new")
    .parse(parameters.get("mode") ?? undefined);
  const limit = z.coerce
    .number()
    .int()
    .min(1)
    .max(50)
    .default(40)
    .parse(parameters.get("limit") ?? undefined);
  const cursor = z
    .string()
    .max(2_048)
    .optional()
    .parse(parameters.get("cursor") ?? undefined);
  const sourceIds = z
    .array(z.uuid())
    .max(20)
    .parse(parameters.getAll("sourceId"));
  const kinds = z
    .array(z.enum(mediaKinds))
    .max(10)
    .parse(parameters.getAll("mediaKind").map((v) => v.toUpperCase()));
  const tags = z
    .array(
      z
        .string()
        .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u)
        .max(80),
    )
    .max(20)
    .parse(parameters.getAll("tag"));
  const rating = z
    .enum(["safe", "sensitive", "adult"])
    .optional()
    .parse(parameters.get("rating") ?? undefined);
  const from = optionalDate(parameters.get("from"));
  const to = optionalDate(parameters.get("to"));
  if (from && to && from > to) throw new Error("VALIDATION_FAILED");
  const includeSeen = z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true")
    .parse(parameters.get("includeSeen") ?? undefined);
  const seed = z
    .string()
    .min(1)
    .max(128)
    .regex(/^[A-Za-z0-9_-]+$/u)
    .optional()
    .parse(parameters.get("seed") ?? undefined);
  if (mode !== "random" && seed) throw new Error("VALIDATION_FAILED");
  const state = {
    from: from?.toISOString(),
    includeSeen,
    kinds,
    mode,
    rating,
    sourceIds,
    tags,
    to: to?.toISOString(),
  };
  const fingerprint = createHash("sha256")
    .update(JSON.stringify(state))
    .digest("hex");
  return Object.freeze({
    cursor,
    fingerprint,
    from,
    includeSeen,
    kinds,
    limit,
    mode,
    rating,
    seed,
    sourceIds,
    tags,
    to,
  });
}

function optionalDate(value: string | null): Date | undefined {
  if (!value) return undefined;
  const parsed = z
    .string()
    .datetime({ offset: true })
    .transform((v) => new Date(v))
    .safeParse(value);
  if (!parsed.success) throw new Error("VALIDATION_FAILED");
  return parsed.data;
}
