import { createHash, randomUUID } from "node:crypto";
import {
  access,
  mkdir,
  open as openFile,
  opendir,
  rename,
  rm,
  stat as fileStat,
} from "node:fs/promises";
import { constants } from "node:fs";
import { createReadStream } from "node:fs";
import path from "node:path";

import { MediaCacheError } from "./errors.js";
import type {
  PreparedStorageWrite,
  StorageAdapter,
  StoredObjectRead,
  StoredObjectStat,
} from "./types.js";

const storageKeyPattern =
  /^objects\/[0-9a-f]{2}\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const prefixPattern = /^(?:objects(?:\/[0-9a-f]{0,2})?)?$/u;

export function createStorageKey(): string {
  const id = randomUUID();
  return `objects/${id.slice(0, 2)}/${id}`;
}

export function assertStorageKey(key: string): string {
  if (!storageKeyPattern.test(key)) {
    throw new MediaCacheError("MEDIA_STORAGE_KEY_INVALID");
  }
  return key;
}

export class LocalFilesystemStorage implements StorageAdapter {
  readonly #readOnly: boolean;
  readonly #root: string;

  constructor(root: string, options: { readonly readOnly?: boolean } = {}) {
    const resolvedRoot = path.resolve(root);
    if (
      !path.isAbsolute(root) ||
      root.length > 1_024 ||
      resolvedRoot === path.parse(resolvedRoot).root
    ) {
      throw new MediaCacheError("MEDIA_STORAGE_KEY_INVALID");
    }
    this.#root = resolvedRoot;
    this.#readOnly = options.readOnly ?? false;
  }

  async health(): Promise<boolean> {
    try {
      if (!this.#readOnly) {
        await mkdir(path.join(this.#root, ".tmp"), {
          mode: 0o700,
          recursive: true,
        });
        await mkdir(path.join(this.#root, "objects"), {
          mode: 0o700,
          recursive: true,
        });
      }
      await access(
        this.#root,
        this.#readOnly ? constants.R_OK : constants.R_OK | constants.W_OK,
      );
      return true;
    } catch {
      return false;
    }
  }

  async prepareWrite(
    key: string,
    source: AsyncIterable<Uint8Array>,
    maxBytes: number,
  ): Promise<PreparedStorageWrite> {
    if (this.#readOnly) throw new MediaCacheError("MEDIA_STORAGE_FAILED");
    const finalPath = this.#pathFor(assertStorageKey(key));
    const temporaryDirectory = path.join(this.#root, ".tmp");
    await mkdir(temporaryDirectory, { mode: 0o700, recursive: true });
    const temporaryPath = path.join(temporaryDirectory, `${randomUUID()}.part`);
    const handle = await openFile(temporaryPath, "wx", 0o600);
    const hash = createHash("sha256");
    let byteLength = 0;
    try {
      for await (const chunk of source) {
        if (!(chunk instanceof Uint8Array)) {
          throw new MediaCacheError("MEDIA_STORAGE_FAILED");
        }
        byteLength += chunk.byteLength;
        if (byteLength > maxBytes) {
          throw new MediaCacheError("MEDIA_RESPONSE_TOO_LARGE");
        }
        hash.update(chunk);
        let offset = 0;
        while (offset < chunk.byteLength) {
          const result = await handle.write(
            chunk,
            offset,
            chunk.byteLength - offset,
          );
          if (result.bytesWritten < 1) {
            throw new MediaCacheError("MEDIA_STORAGE_FAILED");
          }
          offset += result.bytesWritten;
        }
      }
      await handle.sync();
    } catch (error) {
      await handle.close().catch(() => undefined);
      await rm(temporaryPath, { force: true }).catch(() => undefined);
      throw error instanceof MediaCacheError
        ? error
        : new MediaCacheError("MEDIA_STORAGE_FAILED", false, { cause: error });
    }
    await handle.close();
    const etag = hash.digest("hex");
    let settled = false;
    const abort = async () => {
      if (settled) return;
      settled = true;
      await rm(temporaryPath, { force: true });
    };
    const commit = async (): Promise<StoredObjectStat> => {
      if (settled) throw new MediaCacheError("MEDIA_STORAGE_FAILED");
      settled = true;
      try {
        await mkdir(path.dirname(finalPath), { mode: 0o700, recursive: true });
        await rename(temporaryPath, finalPath);
        return this.#statResult(key, await fileStat(finalPath), etag);
      } catch (error) {
        await rm(temporaryPath, { force: true }).catch(() => undefined);
        throw new MediaCacheError("MEDIA_STORAGE_FAILED", false, {
          cause: error,
        });
      }
    };
    const now = new Date();
    return Object.freeze({
      abort,
      byteLength,
      commit,
      etag,
      key,
      modifiedAt: now,
    });
  }

  async open(
    key: string,
    range?: { readonly end: number; readonly start: number },
  ): Promise<StoredObjectRead | null> {
    const object = await this.stat(key);
    if (!object) return null;
    if (
      range &&
      (range.start < 0 ||
        range.end < range.start ||
        range.end >= object.byteLength)
    ) {
      throw new RangeError("Invalid storage range.");
    }
    const body = createReadStream(
      this.#pathFor(assertStorageKey(key)),
      range ? { end: range.end, start: range.start } : undefined,
    );
    return Object.freeze({ ...object, body, range: range ?? null });
  }

  async stat(key: string): Promise<StoredObjectStat | null> {
    const validated = assertStorageKey(key);
    try {
      const stat = await fileStat(this.#pathFor(validated));
      if (!stat.isFile()) return null;
      return this.#statResult(validated, stat);
    } catch (error) {
      if (isMissing(error)) return null;
      throw new MediaCacheError("MEDIA_STORAGE_FAILED", false, {
        cause: error,
      });
    }
  }

  async delete(key: string): Promise<void> {
    if (this.#readOnly) throw new MediaCacheError("MEDIA_STORAGE_FAILED");
    await rm(this.#pathFor(assertStorageKey(key)), { force: true });
  }

  async listByPrefix(
    prefix: string,
    limit: number,
  ): Promise<readonly StoredObjectStat[]> {
    if (
      !prefixPattern.test(prefix) ||
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 1_000
    ) {
      throw new MediaCacheError("MEDIA_STORAGE_KEY_INVALID");
    }
    const directory =
      prefix === ""
        ? path.join(this.#root, "objects")
        : this.#prefixPath(prefix);
    const files: StoredObjectStat[] = [];
    await this.#walk(directory, files, limit);
    return Object.freeze(
      files.sort((left, right) => left.key.localeCompare(right.key)),
    );
  }

  async #walk(
    directory: string,
    files: StoredObjectStat[],
    limit: number,
  ): Promise<void> {
    let handle;
    try {
      handle = await opendir(directory);
    } catch (error) {
      if (isMissing(error)) return;
      throw error;
    }
    for await (const entry of handle) {
      if (files.length >= limit) return;
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        await this.#walk(fullPath, files, limit);
      } else if (entry.isFile()) {
        const relative = path
          .relative(this.#root, fullPath)
          .split(path.sep)
          .join("/");
        if (!storageKeyPattern.test(relative)) continue;
        const stat = await fileStat(fullPath);
        files.push(this.#statResult(relative, stat));
      }
    }
  }

  #pathFor(key: string): string {
    const resolved = path.resolve(this.#root, ...key.split("/"));
    if (!resolved.startsWith(`${this.#root}${path.sep}`)) {
      throw new MediaCacheError("MEDIA_STORAGE_KEY_INVALID");
    }
    return resolved;
  }

  #prefixPath(prefix: string): string {
    const resolved = path.resolve(this.#root, ...prefix.split("/"));
    if (!resolved.startsWith(`${this.#root}${path.sep}`)) {
      throw new MediaCacheError("MEDIA_STORAGE_KEY_INVALID");
    }
    return resolved;
  }

  #statResult(
    key: string,
    stat: { readonly mtime: Date; readonly size: number },
    knownEtag?: string,
  ): StoredObjectStat {
    return Object.freeze({
      byteLength: stat.size,
      etag:
        knownEtag ??
        createHash("sha256")
          .update(`${key}:${stat.size}:${stat.mtime.valueOf()}`)
          .digest("hex"),
      key,
      modifiedAt: stat.mtime,
    });
  }
}

function isMissing(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  );
}
