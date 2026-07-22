import { createHash, randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import { Client } from "pg";
const advisoryLockId = 72_913_817;

export interface MigrationFile {
  checksum: string;
  name: string;
  sql: string;
}

interface AppliedMigration {
  checksum: string;
  finished_at: Date | null;
  migration_name: string;
  rolled_back_at: Date | null;
}

export function validateMigrationHistory(
  migrations: MigrationFile[],
  applied: AppliedMigration[],
): void {
  const knownByName = new Map(
    migrations.map((migration) => [migration.name, migration]),
  );

  for (const record of applied) {
    const migration = knownByName.get(record.migration_name);
    if (!migration) {
      throw new Error(
        `Database contains unknown migration ${record.migration_name}.`,
      );
    }
    if (
      record.checksum !== migration.checksum ||
      record.finished_at === null ||
      record.rolled_back_at !== null
    ) {
      throw new Error(
        `Migration history is unsafe at ${record.migration_name}.`,
      );
    }
  }
}

export async function readMigrations(
  migrationsDirectory: string,
): Promise<MigrationFile[]> {
  const entries = await readdir(migrationsDirectory, { withFileTypes: true });
  const directories = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  const migrations = await Promise.all(
    directories.map(async (name) => {
      const sql = await readFile(
        path.join(migrationsDirectory, name, "migration.sql"),
        "utf8",
      );
      return {
        checksum: createHash("sha256").update(sql).digest("hex"),
        name,
        sql,
      };
    }),
  );

  if (migrations.length === 0) {
    throw new Error("No migration files were found.");
  }
  return migrations;
}

async function deploy(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  const migrationsDirectory = process.argv[2];
  if (!databaseUrl) throw new Error("DATABASE_URL is required.");
  if (!migrationsDirectory) throw new Error("Migration directory is required.");

  const migrations = await readMigrations(migrationsDirectory);
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    await client.query("SELECT pg_advisory_lock($1)", [advisoryLockId]);
    await client.query(`
      CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
        "id" VARCHAR(36) PRIMARY KEY NOT NULL,
        "checksum" VARCHAR(64) NOT NULL,
        "finished_at" TIMESTAMPTZ,
        "migration_name" VARCHAR(255) NOT NULL,
        "logs" TEXT,
        "rolled_back_at" TIMESTAMPTZ,
        "started_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "applied_steps_count" INTEGER NOT NULL DEFAULT 0
      )
    `);

    const applied = await client.query<AppliedMigration>(
      `SELECT "migration_name", "checksum", "finished_at", "rolled_back_at"
       FROM "_prisma_migrations"`,
    );
    validateMigrationHistory(migrations, applied.rows);
    const appliedByName = new Map(
      applied.rows.map((row) => [row.migration_name, row]),
    );

    for (const migration of migrations) {
      const existing = appliedByName.get(migration.name);
      if (existing) {
        continue;
      }

      await client.query("BEGIN");
      try {
        const id = randomUUID();
        await client.query(
          `INSERT INTO "_prisma_migrations"
             ("id", "checksum", "migration_name", "started_at")
           VALUES ($1, $2, $3, now())`,
          [id, migration.checksum, migration.name],
        );
        await client.query(migration.sql);
        await client.query(
          `UPDATE "_prisma_migrations"
           SET "finished_at" = now(), "applied_steps_count" = 1
           WHERE "id" = $1`,
          [id],
        );
        await client.query("COMMIT");
        console.log(`Applied migration ${migration.name}.`);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }

    console.log(`Migration deployment complete (${migrations.length} known).`);
  } finally {
    await client.query("SELECT pg_advisory_unlock($1)", [advisoryLockId]);
    await client.end();
  }
}

if (process.argv[1]?.endsWith("migrate.js")) {
  deploy().catch((error: unknown) => {
    console.error(
      error instanceof Error ? error.message : "Migration deployment failed.",
    );
    process.exitCode = 1;
  });
}
