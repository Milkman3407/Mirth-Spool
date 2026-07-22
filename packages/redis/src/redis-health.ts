import { createClient } from "redis";

import type { DependencyHealth } from "@mirthspool/shared";

export class RedisHealthProbe {
  readonly #timeoutMs: number;
  readonly #url: string;

  constructor(options: { readonly timeoutMs: number; readonly url: string }) {
    this.#timeoutMs = options.timeoutMs;
    this.#url = options.url;
  }

  async check(): Promise<DependencyHealth> {
    const client = createClient({
      url: this.#url,
      socket: {
        connectTimeout: this.#timeoutMs,
        reconnectStrategy: false,
      },
    });
    client.on("error", () => undefined);

    try {
      await client.connect();
      await client.ping();
      return Object.freeze({ code: null, ready: true });
    } catch {
      return Object.freeze({ code: "DEPENDENCY_UNAVAILABLE", ready: false });
    } finally {
      try {
        client.destroy();
      } catch {
        // A failed connection may already have closed the client.
      }
    }
  }
}
