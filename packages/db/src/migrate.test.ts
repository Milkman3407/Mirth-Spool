import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { readMigrations, validateMigrationHistory } from "./migrate.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("release migration discovery", () => {
  it("sorts migrations and returns deterministic SHA-256 checksums", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "mirthspool-migrations-"));
    temporaryDirectories.push(root);
    await mkdir(path.join(root, "002_second"));
    await mkdir(path.join(root, "001_first"));
    await writeFile(
      path.join(root, "002_second", "migration.sql"),
      "SELECT 2;\n",
    );
    await writeFile(
      path.join(root, "001_first", "migration.sql"),
      "SELECT 1;\n",
    );

    const migrations = await readMigrations(root);

    expect(migrations.map((migration) => migration.name)).toEqual([
      "001_first",
      "002_second",
    ]);
    expect(migrations[0]?.checksum).toMatch(/^[a-f0-9]{64}$/);
    expect(migrations[0]?.checksum).not.toBe(migrations[1]?.checksum);
  });

  it("fails closed when no migrations are present", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "mirthspool-migrations-"));
    temporaryDirectories.push(root);
    await expect(readMigrations(root)).rejects.toThrow("No migration files");
  });

  it("rejects unknown or unsafe applied migrations", () => {
    const migrations = [
      { checksum: "expected", name: "001_initial", sql: "SELECT 1" },
    ];
    const complete = {
      checksum: "expected",
      finished_at: new Date(),
      migration_name: "001_initial",
      rolled_back_at: null,
    };

    expect(() =>
      validateMigrationHistory(migrations, [complete]),
    ).not.toThrow();
    expect(() =>
      validateMigrationHistory(migrations, [
        { ...complete, migration_name: "002_from_a_newer_release" },
      ]),
    ).toThrow("unknown migration");
    expect(() =>
      validateMigrationHistory(migrations, [
        { ...complete, checksum: "changed" },
      ]),
    ).toThrow("unsafe");
  });
});
