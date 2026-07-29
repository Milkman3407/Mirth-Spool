import { spawnSync } from "node:child_process";
import console from "node:console";
import { randomBytes } from "node:crypto";
import process from "node:process";

const authSecret = randomBytes(32).toString("base64url");
const databasePassword = randomBytes(24).toString("base64url");
const composeArguments = [
  "compose",
  "-f",
  "compose.yaml",
  "-f",
  "compose.integration.yaml",
];
const environment = {
  ...process.env,
  MIRTHSPOOL_PRIVATE_SOURCE_ALLOWLIST: "127.0.0.1,::1",
  APP_ENCRYPTION_KEY: randomBytes(32).toString("base64"),
  COMPOSE_PROJECT_NAME: "mirthspool-integration",
  MIRTHSPOOL_DATABASE_PASSWORD: databasePassword,
  MIRTHSPOOL_AUTH_SECRET: authSecret,
  MIRTHSPOOL_SETUP_TOKEN: randomBytes(32).toString("base64url"),
  MIRTHSPOOL_TRUSTED_PROXY_SECRET: randomBytes(32).toString("base64url"),
  MIRTHSPOOL_PUBLIC_ORIGIN: "http://localhost:3000",
  MIRTHSPOOL_SOURCE_ALLOWED_PORTS: "58080",
  REDIS_URL: "redis://127.0.0.1:56379",
};
const databaseUrl = `postgresql://mirthspool:${databasePassword}@127.0.0.1:55432/mirthspool`;
const emptyDatabaseUrl = `postgresql://mirthspool:${databasePassword}@127.0.0.1:55432/mirthspool_empty`;

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
