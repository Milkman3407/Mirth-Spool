import process from "node:process";
import { z } from "zod";

import { ConfigurationError } from "./server.js";

const sourceSecurityEnvironmentSchema = z.object({
  ALLOW_PRIVATE_MEDIA_URLS: z.enum(["false", "true"]).optional(),
  ALLOW_PRIVATE_SOURCE_URLS: z.enum(["false", "true"]).optional(),
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
  MIRTHSPOOL_MEDIA_ALLOWED_PORTS: z.string().default("80,443"),
  MIRTHSPOOL_PRIVATE_SOURCE_ALLOWLIST: z.string().max(8_192).default(""),
  MIRTHSPOOL_PRIVATE_MEDIA_ALLOWLIST: z.string().max(8_192).default(""),
});

export interface SourceSecurityConfig {
  readonly privateMediaAllowlist: readonly string[];
  readonly privateSourceAllowlist: readonly string[];
  readonly allowedSourcePorts: readonly number[];
  readonly allowedMediaPorts: readonly number[];
  readonly encryptionKey: Uint8Array;
  readonly encryptionKeyVersion: number;
}

function parseAllowlist(value: string): readonly string[] | null {
  const entries = value
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
  if (
    entries.length > 128 ||
    entries.some(
      (entry) =>
        entry.length > 255 ||
        /[\s@?#]/u.test(entry) ||
        entry.startsWith(".") ||
        entry.endsWith("."),
    )
  ) {
    return null;
  }
  return Object.freeze([...new Set(entries)]);
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
  const mediaPorts = parsed.success
    ? parsePorts(parsed.data.MIRTHSPOOL_MEDIA_ALLOWED_PORTS)
    : null;
  const sourceAllowlist = parsed.success
    ? parseAllowlist(parsed.data.MIRTHSPOOL_PRIVATE_SOURCE_ALLOWLIST)
    : null;
  const mediaAllowlist = parsed.success
    ? parseAllowlist(parsed.data.MIRTHSPOOL_PRIVATE_MEDIA_ALLOWLIST)
    : null;
  const legacyEnabled =
    parsed.success &&
    (parsed.data.ALLOW_PRIVATE_MEDIA_URLS === "true" ||
      parsed.data.ALLOW_PRIVATE_SOURCE_URLS === "true");
  if (
    !parsed.success ||
    !ports ||
    !mediaPorts ||
    !sourceAllowlist ||
    !mediaAllowlist ||
    legacyEnabled
  ) {
    const fields = parsed.success
      ? [
          ...(parsed.data.ALLOW_PRIVATE_MEDIA_URLS === "true"
            ? ["ALLOW_PRIVATE_MEDIA_URLS"]
            : []),
          ...(parsed.data.ALLOW_PRIVATE_SOURCE_URLS === "true"
            ? ["ALLOW_PRIVATE_SOURCE_URLS"]
            : []),
          ...(mediaAllowlist ? [] : ["MIRTHSPOOL_PRIVATE_MEDIA_ALLOWLIST"]),
          ...(sourceAllowlist ? [] : ["MIRTHSPOOL_PRIVATE_SOURCE_ALLOWLIST"]),
          ...(mediaPorts ? [] : ["MIRTHSPOOL_MEDIA_ALLOWED_PORTS"]),
          ...(ports ? [] : ["MIRTHSPOOL_SOURCE_ALLOWED_PORTS"]),
        ]
      : [
          ...new Set(parsed.error.issues.map((issue) => issue.path.join("."))),
        ].sort();
    throw new ConfigurationError(fields);
  }
  return Object.freeze({
    privateMediaAllowlist: mediaAllowlist!,
    privateSourceAllowlist: sourceAllowlist!,
    allowedMediaPorts: mediaPorts,
    allowedSourcePorts: ports,
    encryptionKey: Buffer.from(parsed.data.APP_ENCRYPTION_KEY, "base64"),
    encryptionKeyVersion: parsed.data.APP_ENCRYPTION_KEY_VERSION,
  });
}

export function loadSourceSecurityConfig(): SourceSecurityConfig {
  return parseSourceSecurityConfig(process.env);
}
