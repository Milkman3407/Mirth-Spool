import { describe, expect, it } from "vitest";
import path from "node:path";

import { parseAuthConfig } from "./auth.js";
import { parseClientConfig } from "./client.js";
import {
  CONFIGURATION_ERROR_CODE,
  ConfigurationError,
  parseServerConfig,
} from "./server.js";
import { parseSourceSecurityConfig } from "./source-security.js";

const testAuthSecret = [
  "auth",
  "fixture",
  "value",
  "for",
  "tests",
  "only",
].join("-");
const alternateAuthSecret = ["alternate", testAuthSecret].join("-");
const setupToken = [
  "setup",
  "token",
  "fixture",
  "value",
  "for",
  "tests",
  "never",
  "production",
].join("-");
const trustedProxySecret = [
  "proxy",
  "secret",
  "fixture",
  "value",
  "for",
  "tests",
].join("-");

describe("server configuration", () => {
  it("parses required values and applies bounded defaults", () => {
    expect(
      parseServerConfig({
        DATABASE_URL:
          "postgresql://user:strong-database-password-0001@postgres:5432/mirthspool",
        MIRTHSPOOL_PUBLIC_ORIGIN: "https://mirthspool.invalid/path",
        REDIS_URL: "redis://redis:6379",
      }),
    ).toEqual({
      auditRetentionDays: 365,
      client: { publicOrigin: "https://mirthspool.invalid" },
      completedJobRetentionSeconds: 3_600,
      databaseUrl:
        "postgresql://user:strong-database-password-0001@postgres:5432/mirthspool",
      duplicateAnalysisConcurrency: 1,
      duplicateHashMaxBytes: 20_000_000,
      duplicateHashMaxPixels: 16_777_216,
      duplicateHashTimeoutMs: 5_000,
      duplicateMaxCandidates: 100,
      failedJobRetentionSeconds: 604_800,
      healthCheckTimeoutMs: 1_000,
      ingestionMaxDurationMs: 60_000,
      ingestionRunRetentionDays: 30,
      logLevel: "info",
      mediaCacheConcurrency: 2,
      mediaStoragePath: path.resolve("/var/lib/mirthspool/media"),
      nodeEnvironment: "development",
      orphanRetentionDays: 30,
      port: 3_000,
      redisUrl: "redis://redis:6379",
      schedulerIntervalMs: 15_000,
      sessionRetentionDays: 30,
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

  it("rejects unbounded duplicate-analysis settings", () => {
    expect(() =>
      parseServerConfig({
        DATABASE_URL:
          "postgresql://user:strong-database-password-0001@postgres:5432/mirthspool",
        MIRTHSPOOL_DUPLICATE_ANALYSIS_CONCURRENCY: 100,
        MIRTHSPOOL_DUPLICATE_HASH_MAX_BYTES: 500_000_000,
        MIRTHSPOOL_DUPLICATE_MAX_CANDIDATES: 10_000,
        MIRTHSPOOL_PUBLIC_ORIGIN: "https://mirthspool.invalid",
        REDIS_URL: "redis://redis:6379",
      }),
    ).toThrow(ConfigurationError);
  });

  it("rejects weak database credentials and non-HTTPS production origins", () => {
    expect(() =>
      parseServerConfig({
        DATABASE_URL: "postgresql://user:password@postgres:5432/mirthspool",
        MIRTHSPOOL_PUBLIC_ORIGIN: "https://mirthspool.invalid",
        REDIS_URL: "redis://redis:6379",
      }),
    ).toThrow(ConfigurationError);
    expect(() =>
      parseServerConfig({
        DATABASE_URL:
          "postgresql://user:strong-database-password-0001@postgres:5432/mirthspool",
        MIRTHSPOOL_PUBLIC_ORIGIN: "http://mirthspool.example",
        NODE_ENV: "production",
        REDIS_URL: "redis://redis:6379",
      }),
    ).toThrow(ConfigurationError);
  });

  it("allows the explicit insecure test escape hatch only for loopback", () => {
    const base = {
      DATABASE_URL:
        "postgresql://user:strong-database-password-0001@postgres:5432/mirthspool",
      MIRTHSPOOL_ALLOW_INSECURE_TEST_ORIGIN: "true",
      NODE_ENV: "production",
      REDIS_URL: "redis://redis:6379",
    } as const;

    expect(
      parseServerConfig({
        ...base,
        MIRTHSPOOL_PUBLIC_ORIGIN: "http://127.0.0.1:53000",
      }).client.publicOrigin,
    ).toBe("http://127.0.0.1:53000");
    expect(() =>
      parseServerConfig({
        ...base,
        MIRTHSPOOL_PUBLIC_ORIGIN: "http://192.168.1.10:53000",
      }),
    ).toThrow(ConfigurationError);
    expect(() =>
      parseServerConfig({
        ...base,
        MIRTHSPOOL_PUBLIC_ORIGIN: "http://mirthspool.example",
      }),
    ).toThrow(ConfigurationError);
  });
});

describe("client configuration", () => {
  it("exports only explicitly client-safe values", () => {
    const clientConfig = parseClientConfig({
      MIRTHSPOOL_LOG_LEVEL: "debug",
      MIRTHSPOOL_PORT: "4567",
      MIRTHSPOOL_PUBLIC_ORIGIN: "https://mirthspool.invalid",
      NODE_ENV: "production",
      DATABASE_URL:
        "postgresql://user:strong-database-password-0001@postgres:5432/mirthspool",
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
        MIRTHSPOOL_AUTH_SECRET: testAuthSecret,
        MIRTHSPOOL_PUBLIC_ORIGIN: "https://mirthspool.invalid/path",
        MIRTHSPOOL_SETUP_TOKEN: setupToken,
        MIRTHSPOOL_TRUSTED_PROXY_SECRET: trustedProxySecret,
      }),
    ).toEqual({
      publicOrigin: "https://mirthspool.invalid",
      secret: testAuthSecret,
      secureCookies: true,
      setupToken,
      trustedProxyAddresses: [],
      trustedProxySecret,
    });

    expect(() =>
      parseAuthConfig({
        MIRTHSPOOL_AUTH_SECRET: "replace-me",
        MIRTHSPOOL_PUBLIC_ORIGIN: "https://mirthspool.invalid",
        MIRTHSPOOL_SETUP_TOKEN: setupToken,
        MIRTHSPOOL_TRUSTED_PROXY_SECRET: trustedProxySecret,
      }),
    ).toThrow(ConfigurationError);
  });

  it("allows explicitly trusted proxy headers without exposing the secret", () => {
    const config = parseAuthConfig({
      MIRTHSPOOL_AUTH_SECRET: alternateAuthSecret,
      MIRTHSPOOL_PUBLIC_ORIGIN: "http://127.0.0.1:3000",
      MIRTHSPOOL_SETUP_TOKEN: setupToken,
      MIRTHSPOOL_TRUSTED_PROXY_IPS: "192.0.2.10,2001:db8::10",
      MIRTHSPOOL_TRUSTED_PROXY_SECRET: trustedProxySecret,
    });

    expect(config.trustedProxyAddresses).toEqual([
      "192.0.2.10",
      "2001:db8::10",
    ]);
    expect(config.secureCookies).toBe(false);
  });
});

describe("source security configuration", () => {
  const encryptionKey = Buffer.alloc(32, 7).toString("base64");

  it("parses a 256-bit key and keeps private-network access disabled", () => {
    const config = parseSourceSecurityConfig({
      APP_ENCRYPTION_KEY: encryptionKey,
    });
    expect(config).toMatchObject({
      privateMediaAllowlist: [],
      privateSourceAllowlist: [],
      allowedMediaPorts: [80, 443],
      allowedSourcePorts: [80, 443],
      encryptionKeyVersion: 1,
    });
    expect(config.encryptionKey).toHaveLength(32);
  });

  it("requires explicit private allowlists and validates bounded port overrides", () => {
    expect(
      parseSourceSecurityConfig({
        APP_ENCRYPTION_KEY: encryptionKey,
        APP_ENCRYPTION_KEY_VERSION: "7",
        MIRTHSPOOL_MEDIA_ALLOWED_PORTS: "443,9443",
        MIRTHSPOOL_SOURCE_ALLOWED_PORTS: "443,8443",
        MIRTHSPOOL_PRIVATE_SOURCE_ALLOWLIST:
          "feeds.internal,10.20.0.0/16,fd00::/8",
      }),
    ).toMatchObject({
      privateMediaAllowlist: [],
      privateSourceAllowlist: ["feeds.internal", "10.20.0.0/16", "fd00::/8"],
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
    expect(() =>
      parseSourceSecurityConfig({
        ALLOW_PRIVATE_SOURCE_URLS: "true",
        APP_ENCRYPTION_KEY: encryptionKey,
      }),
    ).toThrow(ConfigurationError);
  });

  it("rejects malformed or incorrectly sized encryption keys", () => {
    expect(() =>
      parseSourceSecurityConfig({ APP_ENCRYPTION_KEY: "replace-me" }),
    ).toThrow(ConfigurationError);
  });
});
