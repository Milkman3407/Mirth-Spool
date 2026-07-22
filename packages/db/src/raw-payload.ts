import { z } from "zod";

import type { Prisma } from "./generated/prisma/client.js";

export const MAX_RAW_PAYLOAD_BYTES = 32 * 1024;

const forbiddenKey = /authorization|cookie|credential|password|secret|token/i;
export interface RawPayloadPolicy {
  readonly enabled: boolean;
  readonly maxBytes: number;
}

export const DISABLED_RAW_PAYLOAD_POLICY: RawPayloadPolicy = Object.freeze({
  enabled: false,
  maxBytes: MAX_RAW_PAYLOAD_BYTES,
});

export function prepareRawPayload(
  value: unknown,
  policy: RawPayloadPolicy = DISABLED_RAW_PAYLOAD_POLICY,
): { readonly bytes: number; readonly value: Prisma.InputJsonValue } | null {
  if (!policy.enabled || value === undefined || value === null) {
    return null;
  }
  if (!Number.isInteger(policy.maxBytes) || policy.maxBytes < 1) {
    throw new Error("Raw payload byte limit must be a positive integer");
  }

  const parsed = z.json().parse(value) as Prisma.InputJsonValue;
  const scrubbed = scrubSecrets(parsed);
  const bytes = Buffer.byteLength(JSON.stringify(scrubbed), "utf8");
  if (bytes > policy.maxBytes) {
    throw new Error(
      `Raw payload exceeds the ${String(policy.maxBytes)} byte limit`,
    );
  }

  return Object.freeze({ bytes, value: scrubbed });
}

function scrubSecrets(value: Prisma.InputJsonValue): Prisma.InputJsonValue {
  if (Array.isArray(value)) {
    return value.map((entry) => scrubSecrets(entry));
  }
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !forbiddenKey.test(key))
        .map(([key, entry]) => [key, scrubSecrets(entry)]),
    );
  }
  return value;
}
