import type { RegisteredConnector } from "./types.js";
import type { SourceKind } from "./schemas.js";

export class ConnectorRegistry {
  readonly #connectors = new Map<SourceKind, RegisteredConnector>();

  constructor(connectors: readonly RegisteredConnector[] = []) {
    for (const connector of connectors) this.register(connector);
  }

  register(connector: RegisteredConnector): void {
    if (this.#connectors.has(connector.kind)) {
      throw new Error(`Connector already registered for ${connector.kind}`);
    }
    this.#connectors.set(connector.kind, connector);
  }

  get(kind: SourceKind): RegisteredConnector | undefined {
    return this.#connectors.get(kind);
  }

  require(kind: SourceKind): RegisteredConnector {
    const connector = this.get(kind);
    if (!connector) throw new Error(`No connector registered for ${kind}`);
    return connector;
  }

  kinds(): readonly SourceKind[] {
    return Object.freeze([...this.#connectors.keys()].sort());
  }
}
