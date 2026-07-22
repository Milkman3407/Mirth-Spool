import { describe, expect, it } from "vitest";

import { parseAuthConfig } from "./auth.js";
import { parseClientConfig } from "./client.js";
import {
  CONFIGURATION_ERROR_CODE,
  ConfigurationError,
  parseServerConfig,
} from "./server.js";
import { parseSourceSecurityConfig } from "./source-security.js";

describe("server configuration", () => {
  it("parses required values and applies bounded defaults", () => {
    expect(
      parseServerConfig({
        DATABASE_URL: "postgresql://user:password@postgres:5432/mirthspool",
        MIRTHSPOOL_PUBLIC_ORIGIN: "https://mirthspool.invalid/path",
        REDIS_URL: "redis://redis:6379",
      }),
    ).toEqual({
      client: { publicOrigin: "https://mirthspool.invalid" },
      completedJobRetentionSeconds: 3_600,
      databaseUrl: "postgresql://user:password@postgres:5432/mirthspool",
      failedJobRetentionSeconds: 604_800,
      healthCheckTimeoutMs: 1_000,
      ingestionMaxDurationMs: 60_000,
      ingestionRunRetentionDays: 30,
      logLevel: "info",
      mediaCacheConcurrency: 2,
      mediaStoragePath: "/var/lib/mirthspool/media",
      nodeEnvironment: "development",
      port: 3_000,
      redisUrl: "redis://redis:6379",
      schedulerIntervalMs: 15_000,
      workerHeartbeatIntervalMs: 10_000,
    });
  });

  it("fails clearly when a required variable is missing", () => {
    expect.assertions(4);

    try {
      parseServerConfig({});
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigurationError);
      expect(error).toMatchObject({
        code: CONFIGURATION_ERROR_CODE,
        fields: ["DATABASE_URL", "MIRTHSPOOL_PUBLIC_ORIGIN", "REDIS_URL"],
      });
      expect((error as Error).message).toContain("MIRTHSPOOL_PUBLIC_ORIGIN");
      expect((error as Error).message).not.toContain("undefined");
    }
  });

  it("rejects invalid origins and out-of-range ports without echoing values", () => {
    const unsafeValue = "file:///private/config";

    expect(() =>
      parseServerConfig({
        DATABASE_URL: "http://not-postgres.invalid",
        MIRTHSPOOL_PORT: 70_000,
        MIRTHSPOOL_PUBLIC_ORIGIN: unsafeValue,
        REDIS_URL: "http://not-redis.invalid",
      }),
    ).toThrow(ConfigurationError);

    expect(() =>
      parseServerConfig({
        DATABASE_URL: "http://not-postgres.invalid",
        MIRTHSPOOL_PORT: 70_000,
        MIRTHSPOOL_PUBLIC_ORIGIN: unsafeValue,
        REDIS_URL: "http://not-redis.invalid",
      }),
    ).not.toThrow(unsafeValue);
  });
});

describe("client configuration", () => {
  it("exports only explicitly client-safe values", () => {
    const clientConfig = parseClientConfig({
      MIRTHSPOOL_LOG_LEVEL: "debug",
      MIRTHSPOOL_PORT: "4567",
      MIRTHSPOOL_PUBLIC_ORIGIN: "https://mirthspool.invalid",
      NODE_ENV: "production",
      DATABASE_URL: "postgresql://user:password@postgres:5432/mirthspool",
      REDIS_URL: "redis://redis:6379",
    });

    expect(clientConfig).toEqual({
      publicOrigin: "https://mirthspool.invalid",
    });
    expect(clientConfig).not.toHaveProperty("port");
    expect(clientConfig).not.toHaveProperty("logLevel");
    expect(clientConfig).not.toHaveProperty("nodeEnvironment");
  });
});

describe("authentication configuration", () => {
  it("requires a non-placeholder secret and derives secure cookies from the origin", () => {
    expect(
      parseAuthConfig({
        MIRTHSPOOL_AUTH_SECRET: "0123456789abcdef0123456789abcdef",
        MIRTHSPOOL_PUBLIC_ORIGIN: "https://mirthspool.invalid/path",
      }),
    ).toEqual({
      publicOrigin: "https://mirthspool.invalid",
      secret: "0123456789abcdef0123456789abcdef",
      secureCookies: true,
      trustProxy: false,
    });

    expect(() =>
      parseAuthConfig({
        MIRTHSPOOL_AUTH_SECRET: "replace-me",
        MIRTHSPOOL_PUBLIC_ORIGIN: "https://mirthspool.invalid",
      }),
    ).toThrow(ConfigurationError);
  });

  it("allows explicitly trusted proxy headers without exposing the secret", () => {
    const config = parseAuthConfig({
      MIRTHSPOOL_AUTH_SECRET: "abcdef0123456789abcdef0123456789",
      MIRTHSPOOL_PUBLIC_ORIGIN: "http://127.0.0.1:3000",
      MIRTHSPOOL_TRUST_PROXY: "true",
    });

    expect(config.trustProxy).toBe(true);
    expect(config.secureCookies).toBe(false);
  });
});

describe("source security configuration", () => {
  const encryptionKey = "bWlydGhzcG9vbC1pbnRlZ3JhdGlvbi1rZXktMDAwMDE=";

  it("parses a 256-bit key and keeps private-network access disabled", () => {
    const config = parseSourceSecurityConfig({
      APP_ENCRYPTION_KEY: encryptionKey,
    });
    expect(config).toMatchObject({
      allowPrivateMediaUrls: false,
      allowPrivateSourceUrls: false,
      allowedMediaPorts: [80, 443],
      allowedSourcePorts: [80, 443],
      encryptionKeyVersion: 1,
    });
    expect(config.encryptionKey).toHaveLength(32);
  });

  it("requires explicit private access and validates bounded port overrides", () => {
    expect(
      parseSourceSecurityConfig({
        ALLOW_PRIVATE_SOURCE_URLS: "true",
        APP_ENCRYPTION_KEY: encryptionKey,
        APP_ENCRYPTION_KEY_VERSION: "7",
        MIRTHSPOOL_MEDIA_ALLOWED_PORTS: "443,9443",
        MIRTHSPOOL_SOURCE_ALLOWED_PORTS: "443,8443",
      }),
    ).toMatchObject({
      allowPrivateMediaUrls: false,
      allowPrivateSourceUrls: true,
      allowedMediaPorts: [443, 9443],
      allowedSourcePorts: [443, 8443],
      encryptionKeyVersion: 7,
    });
    expect(() =>
      parseSourceSecurityConfig({
        APP_ENCRYPTION_KEY: encryptionKey,
        MIRTHSPOOL_SOURCE_ALLOWED_PORTS: "0,70000",
      }),
    ).toThrow(ConfigurationError);
  });

  it("rejects malformed or incorrectly sized encryption keys", () => {
    expect(() =>
      parseSourceSecurityConfig({ APP_ENCRYPTION_KEY: "replace-me" }),
    ).toThrow(ConfigurationError);
  });
});
