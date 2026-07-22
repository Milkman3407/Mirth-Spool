import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { MediaCacheError } from "./errors.js";
import {
  createStorageKey,
  LocalFilesystemStorage,
} from "./local-filesystem.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { force: true, recursive: true })),
  );
});

async function storage() {
  const root = await mkdtemp(path.join(tmpdir(), "mirthspool-storage-"));
  roots.push(root);
  return { adapter: new LocalFilesystemStorage(root), root };
}

async function collect(source: AsyncIterable<Uint8Array>) {
  const chunks: Uint8Array[] = [];
  for await (const chunk of source) chunks.push(chunk);
  return Buffer.concat(chunks);
}

describe("local filesystem storage", () => {
  it("keeps writes invisible until atomic commit and supports bounded ranges", async () => {
    const { adapter } = await storage();
    const key = createStorageKey();
    const prepared = await adapter.prepareWrite(
      key,
      (async function* () {
        yield Buffer.from("abcdef");
      })(),
      6,
    );
    expect(await adapter.stat(key)).toBeNull();
    await prepared.commit();
    const opened = await adapter.open(key, { start: 1, end: 3 });
    expect(opened?.range).toEqual({ start: 1, end: 3 });
    expect(await collect(opened!.body)).toEqual(Buffer.from("bcd"));
  });

  it("removes partial files when a bounded write fails", async () => {
    const { adapter, root } = await storage();
    await expect(
      adapter.prepareWrite(
        createStorageKey(),
        (async function* () {
          yield Buffer.alloc(8);
        })(),
        4,
      ),
    ).rejects.toMatchObject({ code: "MEDIA_RESPONSE_TOO_LARGE" });
    expect(await readdir(path.join(root, ".tmp"))).toEqual([]);
    expect(await adapter.listByPrefix("objects", 10)).toEqual([]);
  });

  it("rejects traversal and malformed keys before touching disk", async () => {
    const { adapter } = await storage();
    await expect(adapter.stat("../secret")).rejects.toBeInstanceOf(
      MediaCacheError,
    );
    await expect(
      adapter.delete("objects/aa/../../secret"),
    ).rejects.toMatchObject({
      code: "MEDIA_STORAGE_KEY_INVALID",
    });
    expect(
      () => new LocalFilesystemStorage(path.parse(process.cwd()).root),
    ).toThrow(MediaCacheError);
  });
});
