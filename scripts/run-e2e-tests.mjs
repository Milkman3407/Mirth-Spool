import { spawnSync } from "node:child_process";
import console from "node:console";
import process from "node:process";

const composeArguments = [
  "compose",
  "-f",
  "compose.yaml",
  "-f",
  "compose.e2e.yaml",
];
const environment = {
  ...process.env,
  APP_ENCRYPTION_KEY: "bWlydGhzcG9vbC1pbnRlZ3JhdGlvbi1rZXktMDAwMDE=",
  COMPOSE_PROJECT_NAME: "mirthspool-e2e",
  MIRTHSPOOL_AUTH_SECRET: "e2e-only-auth-secret-with-at-least-32-characters",
  MIRTHSPOOL_DATABASE_PASSWORD: "mirthspool-e2e-only-database-password",
  MIRTHSPOOL_HTTP_PORT: "53000",
  MIRTHSPOOL_LOG_LEVEL: "debug",
  MIRTHSPOOL_PUBLIC_ORIGIN: "http://127.0.0.1:53000",
};
const databaseUrl =
  "postgresql://mirthspool:mirthspool-e2e-only-database-password@127.0.0.1:55434/mirthspool";

function run(command, arguments_, options = {}) {
  const result = spawnSync(command, arguments_, {
    cwd: process.cwd(),
    env: environment,
    stdio: "inherit",
    ...options,
  });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(`${command} exited with status ${String(result.status)}`);
}

let testFailed = false;

try {
  run("docker", [
    ...composeArguments,
    "up",
    "--detach",
    "--wait",
    "postgres",
    "redis",
  ]);
  run("pnpm", ["--filter", "@mirthspool/db", "prisma:migrate:deploy"], {
    env: { ...environment, DATABASE_URL: databaseUrl },
  });
  run("docker", [
    ...composeArguments,
    "up",
    "--build",
    "--detach",
    "--wait",
    "web",
    "worker",
  ]);
  run("pnpm", [
    "exec",
    "playwright",
    "test",
    "--config",
    "playwright.config.ts",
  ]);
} catch (error) {
  testFailed = true;
  throw error;
} finally {
  if (testFailed) {
    spawnSync(
      "docker",
      [...composeArguments, "logs", "--no-color", "web", "worker"],
      {
        cwd: process.cwd(),
        env: environment,
        stdio: "inherit",
      },
    );
  }

  const cleanup = spawnSync(
    "docker",
    [...composeArguments, "down", "--volumes", "--remove-orphans"],
    { cwd: process.cwd(), env: environment, stdio: "inherit" },
  );
  if (cleanup.error || cleanup.status !== 0)
    console.error("E2E cleanup failed.");
}
