import { Client } from "pg";

import type { DependencyHealth } from "@mirthspool/shared";

export class PostgresHealthProbe {
  readonly #connectionString: string;
  readonly #timeoutMs: number;

  constructor(options: {
    readonly connectionString: string;
    readonly timeoutMs: number;
  }) {
    this.#connectionString = options.connectionString;
    this.#timeoutMs = options.timeoutMs;
  }

  async check(): Promise<DependencyHealth> {
    const client = new Client({
      connectionString: this.#connectionString,
      connectionTimeoutMillis: this.#timeoutMs,
      query_timeout: this.#timeoutMs,
      statement_timeout: this.#timeoutMs,
    });

    try {
      await client.connect();
      await client.query("SELECT 1");
      return Object.freeze({ code: null, ready: true });
    } catch {
      return Object.freeze({ code: "DEPENDENCY_UNAVAILABLE", ready: false });
    } finally {
      await client.end().catch(() => undefined);
    }
  }
}
