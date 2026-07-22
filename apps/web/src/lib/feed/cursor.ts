import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

const payloadSchema = z
  .object({
    f: z.string().length(64),
    i: z.uuid(),
    m: z.enum(["new", "hot", "random", "unseen"]),
    p: z.string().datetime().optional(),
    r: z.number().int().min(0).max(0x7fffffff).optional(),
    s: z.number().finite().optional(),
    seed: z.string().min(1).max(128).optional(),
    v: z.literal(1),
    w: z.boolean().optional(),
  })
  .strict();

export type FeedCursor = z.infer<typeof payloadSchema>;

export function encodeFeedCursor(payload: FeedCursor, secret: string): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${signature(body, secret)}`;
}

export function decodeFeedCursor(value: string, secret: string): FeedCursor {
  if (value.length > 2_048) throw new Error("INVALID_CURSOR");
  const [body, supplied, extra] = value.split(".");
  if (!body || !supplied || extra) throw new Error("INVALID_CURSOR");
  const expected = signature(body, secret);
  const left = Buffer.from(supplied);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right))
    throw new Error("INVALID_CURSOR");
  try {
    return payloadSchema.parse(
      JSON.parse(Buffer.from(body, "base64url").toString("utf8")),
    );
  } catch {
    throw new Error("INVALID_CURSOR");
  }
}

function signature(body: string, secret: string): string {
  return createHmac("sha256", secret)
    .update("mirthspool:feed-cursor:v1\0")
    .update(body)
    .digest("base64url");
}
