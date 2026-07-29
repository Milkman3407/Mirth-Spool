import { spawnSync } from "node:child_process";
import console from "node:console";
import { randomBytes } from "node:crypto";
import process from "node:process";

const authSecret = randomBytes(32).toString("base64url");
const databasePassword = randomBytes(24).toString("base64url");
const setupToken = [
  "e2e",
  "setup",
  "token",
  "fixture",
  "value",
  "only",
  "never",
  "production",
].join("-");
const useReleaseImages = process.env.MIRTHSPOOL_E2E_RELEASE_IMAGES === "true";
const composeArguments = [
  "compose",
  "-f",
  "compose.yaml",
  "-f",
  "compose.e2e.yaml",
  ...(useReleaseImages ? ["-f", "compose.release.yaml"] : []),
];
const environment = {
  ...process.env,
  APP_ENCRYPTION_KEY: randomBytes(32).toString("base64"),
  COMPOSE_PROJECT_NAME: "mirthspool-e2e",
  MIRTHSPOOL_AUTH_SECRET: authSecret,
  MIRTHSPOOL_SETUP_TOKEN: setupToken,
  MIRTHSPOOL_TRUSTED_PROXY_SECRET: randomBytes(32).toString("base64url"),
  MIRTHSPOOL_DATABASE_PASSWORD: databasePassword,
  MIRTHSPOOL_HTTP_PORT: "53000",
  MIRTHSPOOL_LOG_LEVEL: "debug",
  MIRTHSPOOL_PUBLIC_ORIGIN: "http://127.0.0.1:53000",
};
const databaseUrl = `postgresql://mirthspool:${databasePassword}@127.0.0.1:55434/mirthspool`;

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
    ...(useReleaseImages ? [] : ["--build"]),
    "--detach",
    "--wait",
    "web",
    "worker",
  ]);
  run(
    "pnpm",
    ["exec", "playwright", "test", "--config", "playwright.config.ts"],
    { env: { ...environment, DATABASE_URL: databaseUrl } },
  );
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
