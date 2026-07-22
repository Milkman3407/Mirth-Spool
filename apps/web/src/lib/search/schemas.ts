import { createHash } from "node:crypto";
import { z } from "zod";

const allowedKeys = new Set([
  "q",
  "cursor",
  "limit",
  "sourceId",
  "mediaKind",
  "rating",
  "tag",
  "favorite",
  "hidden",
  "seen",
  "from",
  "to",
]);
const mediaKinds = ["IMAGE", "ANIMATED_IMAGE", "VIDEO", "LINK"] as const;
const ratings = ["SAFE", "SENSITIVE", "ADULT", "UNKNOWN"] as const;
const tagSchema = z
  .string()
  .max(80)
  .regex(/^[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)*$/u);

export function parseSearchQuery(url: string) {
  const parameters = new URL(url).searchParams;
  for (const key of parameters.keys()) {
    if (!allowedKeys.has(key)) throw new Error("VALIDATION_FAILED");
  }
  const q = scalar(parameters, "q", z.string().max(200).default(""));
  const tokens = q.match(/[\p{L}\p{N}]+/gu) ?? [];
  if (tokens.length > 20) throw new Error("VALIDATION_FAILED");
  const queryText = tokens.length > 0 ? q.trim().normalize("NFKC") : undefined;
  const limit = scalar(
    parameters,
    "limit",
    z.coerce.number().int().min(1).max(50).default(20),
  );
  const cursor = scalar(parameters, "cursor", z.string().max(2_048).optional());
  const sourceIds = z
    .array(z.uuid())
    .max(20)
    .parse(parameters.getAll("sourceId"));
  const kinds = z
    .array(z.enum(mediaKinds))
    .max(4)
    .parse(parameters.getAll("mediaKind").map((value) => value.toUpperCase()));
  const requestedRatings = z
    .array(z.enum(ratings))
    .max(4)
    .parse(parameters.getAll("rating").map((value) => value.toUpperCase()));
  const tags = z.array(tagSchema).max(20).parse(parameters.getAll("tag"));
  const favorite = optionalBoolean(parameters, "favorite");
  const hidden = optionalBoolean(parameters, "hidden");
  const seen = optionalBoolean(parameters, "seen");
  const from = optionalDate(parameters, "from");
  const to = optionalDate(parameters, "to");
  if (from && to && from > to) throw new Error("VALIDATION_FAILED");
  const state = {
    favorite,
    from: from?.toISOString(),
    hidden,
    kinds,
    queryText,
    requestedRatings,
    seen,
    sourceIds,
    tags,
    to: to?.toISOString(),
  };
  return Object.freeze({
    cursor,
    favorite,
    fingerprint: createHash("sha256")
      .update(JSON.stringify(state))
      .digest("hex"),
    from,
    hidden,
    kinds,
    limit,
    q,
    queryText,
    requestedRatings,
    seen,
    sourceIds,
    tags,
    to,
  });
}

function scalar<T extends z.ZodType>(
  parameters: URLSearchParams,
  name: string,
  schema: T,
): z.output<T> {
  const values = parameters.getAll(name);
  if (values.length > 1) throw new Error("VALIDATION_FAILED");
  return schema.parse(values[0] ?? undefined);
}

function optionalBoolean(parameters: URLSearchParams, name: string) {
  return scalar(
    parameters,
    name,
    z
      .enum(["true", "false"])
      .transform((value) => value === "true")
      .optional(),
  );
}

function optionalDate(parameters: URLSearchParams, name: string) {
  return scalar(
    parameters,
    name,
    z
      .string()
      .datetime({ offset: true })
      .transform((value) => new Date(value))
      .optional(),
  );
}
