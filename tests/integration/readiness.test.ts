import { spawn, type ChildProcess } from "node:child_process";
import process from "node:process";

import { PostgresHealthProbe } from "@mirthspool/db";
import { RedisHealthProbe } from "@mirthspool/redis";
import { evaluateReadiness } from "@mirthspool/shared";
import { afterEach, describe, expect, it } from "vitest";

const databaseUrl =
  "postgresql://mirthspool:mirthspool-integration-only-password@127.0.0.1:55432/mirthspool";
const redisUrl = "redis://127.0.0.1:56379";
const children = new Set<ChildProcess>();

afterEach(() => {
  for (const child of children) {
    if (child.exitCode === null) {
      child.kill("SIGKILL");
    }
  }
  children.clear();
});

describe("dependency readiness", () => {
  it("reports ready when PostgreSQL and Redis are healthy", async () => {
    const results = await Promise.all([
      new PostgresHealthProbe({
        connectionString: databaseUrl,
        timeoutMs: 1_000,
      }).check(),
      new RedisHealthProbe({ timeoutMs: 1_000, url: redisUrl }).check(),
    ]);

    expect(results).toEqual([
      { code: null, ready: true },
      { code: null, ready: true },
    ]);
    expect(
      evaluateReadiness(results, "req_integration", new Date(0)).httpStatus,
    ).toBe(200);
  });

  it("returns controlled non-ready state when PostgreSQL and Redis are unavailable", async () => {
    const results = await Promise.all([
      new PostgresHealthProbe({
        connectionString:
          "postgresql://invalid:invalid@127.0.0.1:1/unavailable",
        timeoutMs: 200,
      }).check(),
      new RedisHealthProbe({
        timeoutMs: 200,
        url: "redis://127.0.0.1:1",
      }).check(),
    ]);
    const evaluation = evaluateReadiness(
      results,
      "req_unavailable",
      new Date(0),
    );

    expect(results.every((result) => !result.ready)).toBe(true);
    expect(evaluation.httpStatus).toBe(503);
    expect(evaluation.body.status).toBe("not_ready");
    expect(JSON.stringify(evaluation.body)).not.toContain("127.0.0.1");
  });
});

describe("worker lifecycle", () => {
  it("logs readiness and shuts down cleanly on SIGTERM", async () => {
    const child = spawn(process.execPath, ["apps/worker/dist/index.js"], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        DATABASE_URL: databaseUrl,
        MIRTHSPOOL_HEALTH_CHECK_TIMEOUT_MS: "1000",
        MIRTHSPOOL_LOG_LEVEL: "info",
        MIRTHSPOOL_PUBLIC_ORIGIN: "http://localhost:3000",
        MIRTHSPOOL_WORKER_HEARTBEAT_INTERVAL_MS: "1000",
        NODE_ENV: "test",
        REDIS_URL: redisUrl,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    children.add(child);

    let output = "";
    child.stdout.on("data", (chunk: Buffer) => {
      output += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      output += chunk.toString("utf8");
    });

    await waitFor(() => output.includes('"event":"worker.ready"'), 8_000);
    expect(child.kill("SIGTERM")).toBe(true);
    const exitCode = await waitForExit(child, 5_000);

    expect(exitCode).toBe(0);
    expect(output).toContain('"service":"worker"');
    expect(output).toContain('"environment":"test"');
    expect(output).toContain('"event":"worker.shutdown.complete"');
    children.delete(child);
  });
});

async function waitFor(
  predicate: () => boolean,
  timeoutMs: number,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() >= deadline) {
      throw new Error("Timed out waiting for worker output");
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

async function waitForExit(
  child: ChildProcess,
  timeoutMs: number,
): Promise<number | null> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("Timed out waiting for worker exit")),
      timeoutMs,
    );
    child.once("exit", (code) => {
      clearTimeout(timeout);
      resolve(code);
    });
  });
}
