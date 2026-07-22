import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

const cursorSchema = z.object({
  f: z.string().length(64),
  i: z.uuid(),
  p: z.iso.datetime({ offset: true }),
  r: z.number().finite().nonnegative(),
  v: z.literal(1),
});

export type SearchCursor = z.infer<typeof cursorSchema>;

export function encodeSearchCursor(cursor: SearchCursor, secret: string) {
  const payload = Buffer.from(JSON.stringify(cursor)).toString("base64url");
  return `${payload}.${signature(payload, secret)}`;
}

export function decodeSearchCursor(
  value: string,
  secret: string,
): SearchCursor {
  const [payload, supplied, extra] = value.split(".");
  if (!payload || !supplied || extra) throw new Error("INVALID_CURSOR");
  const expected = signature(payload, secret);
  const left = Buffer.from(supplied);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) {
    throw new Error("INVALID_CURSOR");
  }
  try {
    return cursorSchema.parse(
      JSON.parse(Buffer.from(payload, "base64url").toString("utf8")),
    );
  } catch {
    throw new Error("INVALID_CURSOR");
  }
}

function signature(payload: string, secret: string) {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}
