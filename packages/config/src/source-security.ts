import process from "node:process";
import { z } from "zod";

import { ConfigurationError } from "./server.js";

const explicitBoolean = z
  .enum(["true", "false"])
  .default("false")
  .transform((value) => value === "true");

const sourceSecurityEnvironmentSchema = z.object({
  ALLOW_PRIVATE_MEDIA_URLS: explicitBoolean,
  ALLOW_PRIVATE_SOURCE_URLS: explicitBoolean,
  APP_ENCRYPTION_KEY: z
    .string()
    .min(40)
    .max(64)
    .refine((value) => {
      try {
        const decoded = Buffer.from(value, "base64");
        return (
          decoded.byteLength === 32 && decoded.toString("base64") === value
        );
      } catch {
        return false;
      }
    }),
  APP_ENCRYPTION_KEY_VERSION: z.coerce
    .number()
    .int()
    .min(1)
    .max(2_147_483_647)
    .default(1),
  MIRTHSPOOL_SOURCE_ALLOWED_PORTS: z.string().default("80,443"),
});

export interface SourceSecurityConfig {
  readonly allowPrivateMediaUrls: boolean;
  readonly allowPrivateSourceUrls: boolean;
  readonly allowedSourcePorts: readonly number[];
  readonly encryptionKey: Uint8Array;
  readonly encryptionKeyVersion: number;
}

function parsePorts(value: string): readonly number[] | null {
  const parts = value.split(",").map((part) => Number(part.trim()));
  if (
    parts.length === 0 ||
    parts.length > 16 ||
    parts.some((port) => !Number.isInteger(port) || port < 1 || port > 65_535)
  ) {
    return null;
  }
  return Object.freeze([...new Set(parts)].sort((left, right) => left - right));
}

export function parseSourceSecurityConfig(
  environment: unknown,
): SourceSecurityConfig {
  const parsed = sourceSecurityEnvironmentSchema.safeParse(environment);
  const ports = parsed.success
    ? parsePorts(parsed.data.MIRTHSPOOL_SOURCE_ALLOWED_PORTS)
    : null;
  if (!parsed.success || !ports) {
    const fields = parsed.success
      ? ["MIRTHSPOOL_SOURCE_ALLOWED_PORTS"]
      : [
          ...new Set(parsed.error.issues.map((issue) => issue.path.join("."))),
        ].sort();
    throw new ConfigurationError(fields);
  }
  return Object.freeze({
    allowPrivateMediaUrls: parsed.data.ALLOW_PRIVATE_MEDIA_URLS,
    allowPrivateSourceUrls: parsed.data.ALLOW_PRIVATE_SOURCE_URLS,
    allowedSourcePorts: ports,
    encryptionKey: Buffer.from(parsed.data.APP_ENCRYPTION_KEY, "base64"),
    encryptionKeyVersion: parsed.data.APP_ENCRYPTION_KEY_VERSION,
  });
}

export function loadSourceSecurityConfig(): SourceSecurityConfig {
  return parseSourceSecurityConfig(process.env);
}
