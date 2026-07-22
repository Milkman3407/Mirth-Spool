import process from "node:process";
import { isIP } from "node:net";
import { z } from "zod";

import { parseClientConfig } from "./client.js";
import { ConfigurationError } from "./server.js";

const rejectedSecrets = new Set([
  "change-me",
  "changeme",
  "default",
  "replace-me",
  "replace-with-a-random-secret",
]);

const authEnvironmentSchema = z.object({
  MIRTHSPOOL_AUTH_SECRET: z
    .string()
    .min(32, "must be at least 32 characters")
    .max(512, "must be at most 512 characters")
    .refine(
      (value) => !rejectedSecrets.has(value.toLowerCase()),
      "must not be a known placeholder",
    ),
  MIRTHSPOOL_PUBLIC_ORIGIN: z.string(),
  MIRTHSPOOL_TRUSTED_PROXY_IPS: z.string().max(1_024).default(""),
});

export interface AuthConfig {
  readonly publicOrigin: string;
  readonly secret: string;
  readonly secureCookies: boolean;
  readonly trustedProxyAddresses: readonly string[];
}

export function parseAuthConfig(environment: unknown): AuthConfig {
  const parsed = authEnvironmentSchema.safeParse(environment);
  if (!parsed.success) {
    const fields = [
      ...new Set(parsed.error.issues.map((issue) => issue.path.join("."))),
    ].sort();
    throw new ConfigurationError(fields);
  }

  try {
    const publicOrigin = parseClientConfig(parsed.data).publicOrigin;
    const trustedProxyAddresses =
      parsed.data.MIRTHSPOOL_TRUSTED_PROXY_IPS.split(",")
        .map((value) => value.trim())
        .filter(Boolean);
    if (trustedProxyAddresses.some((value) => isIP(value) === 0)) {
      throw new ConfigurationError(["MIRTHSPOOL_TRUSTED_PROXY_IPS"]);
    }
    return Object.freeze({
      publicOrigin,
      secret: parsed.data.MIRTHSPOOL_AUTH_SECRET,
      secureCookies: new URL(publicOrigin).protocol === "https:",
      trustedProxyAddresses: Object.freeze(trustedProxyAddresses),
    });
  } catch (error) {
    if (error instanceof ConfigurationError) {
      throw error;
    }
    throw new ConfigurationError(["MIRTHSPOOL_PUBLIC_ORIGIN"]);
  }
}

export function loadAuthConfig(): AuthConfig {
  return parseAuthConfig(process.env);
}
