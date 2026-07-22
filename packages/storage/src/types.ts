export interface StoredObjectStat {
  readonly byteLength: number;
  readonly etag: string;
  readonly key: string;
  readonly modifiedAt: Date;
}

export interface StoredObjectRead extends StoredObjectStat {
  readonly body: AsyncIterable<Uint8Array>;
  readonly range: {
    readonly end: number;
    readonly start: number;
  } | null;
}

export interface PreparedStorageWrite extends StoredObjectStat {
  abort(): Promise<void>;
  commit(): Promise<StoredObjectStat>;
}

export interface StorageAdapter {
  delete(key: string): Promise<void>;
  health(): Promise<boolean>;
  listByPrefix(
    prefix: string,
    limit: number,
  ): Promise<readonly StoredObjectStat[]>;
  open(
    key: string,
    range?: { readonly end: number; readonly start: number },
  ): Promise<StoredObjectRead | null>;
  prepareWrite(
    key: string,
    source: AsyncIterable<Uint8Array>,
    maxBytes: number,
  ): Promise<PreparedStorageWrite>;
  stat(key: string): Promise<StoredObjectStat | null>;
}
