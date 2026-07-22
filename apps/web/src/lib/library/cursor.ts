import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

const payloadSchema = z
  .object({
    i: z.uuid(),
    k: z.enum(["favorites", "hidden", "history"]),
    t: z.string().datetime({ offset: true }),
    v: z.literal(1),
  })
  .strict();

export type LibraryCursor = z.infer<typeof payloadSchema>;

export function encodeLibraryCursor(
  payload: LibraryCursor,
  secret: string,
): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${signature(body, secret)}`;
}

export function decodeLibraryCursor(
  value: string,
  secret: string,
): LibraryCursor {
  if (value.length > 2_048) throw new Error("INVALID_CURSOR");
  const [body, supplied, extra] = value.split(".");
  if (!body || !supplied || extra) throw new Error("INVALID_CURSOR");
  const expected = signature(body, secret);
  const left = Buffer.from(supplied);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) {
    throw new Error("INVALID_CURSOR");
  }
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
    .update("mirthspool:library-cursor:v1\0")
    .update(body)
    .digest("base64url");
}
