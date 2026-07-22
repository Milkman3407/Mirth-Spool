import { spawnSync } from "node:child_process";
import console from "node:console";
import process from "node:process";

const composeArguments = [
  "compose",
  "-f",
  "compose.yaml",
  "-f",
  "compose.integration.yaml",
];
const environment = {
  ...process.env,
  ALLOW_PRIVATE_SOURCE_URLS: "true",
  APP_ENCRYPTION_KEY: "bWlydGhzcG9vbC1pbnRlZ3JhdGlvbi1rZXktMDAwMDE=",
  COMPOSE_PROJECT_NAME: "mirthspool-integration",
  MIRTHSPOOL_DATABASE_PASSWORD: "mirthspool-integration-only-password",
  MIRTHSPOOL_AUTH_SECRET: "integration-only-auth-secret-with-32-characters",
  MIRTHSPOOL_PUBLIC_ORIGIN: "http://localhost:3000",
  MIRTHSPOOL_SOURCE_ALLOWED_PORTS: "58080",
  REDIS_URL: "redis://127.0.0.1:56379",
};
const databaseUrl =
  "postgresql://mirthspool:mirthspool-integration-only-password@127.0.0.1:55432/mirthspool";
const emptyDatabaseUrl =
  "postgresql://mirthspool:mirthspool-integration-only-password@127.0.0.1:55432/mirthspool_empty";

function run(command, arguments_, options = {}) {
  const result = spawnSync(command, arguments_, {
    cwd: process.cwd(),
    env: environment,
    stdio: "inherit",
    ...options,
  });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`${command} exited with status ${String(result.status)}`);
  }
}

try {
  run("pnpm", ["--filter", "@mirthspool/worker...", "build"], {
    env: { ...environment, DATABASE_URL: databaseUrl },
  });
  run("docker", [
    ...composeArguments,
    "up",
    "--detach",
    "--wait",
    "postgres",
    "redis",
  ]);
  run("pnpm", ["--filter", "@mirthspool/db", "prisma:validate"], {
    env: { ...environment, DATABASE_URL: databaseUrl },
  });
  run("pnpm", ["--filter", "@mirthspool/db", "prisma:migrate:deploy"], {
    env: { ...environment, DATABASE_URL: databaseUrl },
  });
  run("docker", [
    ...composeArguments,
    "exec",
    "--no-TTY",
    "postgres",
    "createdb",
    "--username",
    "mirthspool",
    "mirthspool_empty",
  ]);
  run("pnpm", ["--filter", "@mirthspool/db", "prisma:migrate:deploy"], {
    env: { ...environment, DATABASE_URL: emptyDatabaseUrl },
  });
  run("pnpm", ["--filter", "@mirthspool/db", "prisma:seed"], {
    env: { ...environment, DATABASE_URL: emptyDatabaseUrl },
  });
  run("pnpm", ["--filter", "@mirthspool/db", "prisma:seed"], {
    env: { ...environment, DATABASE_URL: emptyDatabaseUrl },
  });
  run(
    "pnpm",
    ["exec", "vitest", "run", "--config", "vitest.integration.config.ts"],
    { env: { ...environment, DATABASE_URL: databaseUrl } },
  );
} finally {
  const cleanup = spawnSync(
    "docker",
    [...composeArguments, "down", "--volumes", "--remove-orphans"],
    {
      cwd: process.cwd(),
      env: environment,
      stdio: "inherit",
    },
  );
  if (cleanup.error) {
    console.error(`Integration cleanup failed: ${cleanup.error.name}`);
  }
}
