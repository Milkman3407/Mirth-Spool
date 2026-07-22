import type { z } from "zod";

import type {
  ConnectorPage,
  ConnectivityResult,
  SourceKind,
} from "./schemas.js";

export interface ConnectorLogger {
  debug(message: string, fields?: Readonly<Record<string, unknown>>): void;
  info(message: string, fields?: Readonly<Record<string, unknown>>): void;
  warn(message: string, fields?: Readonly<Record<string, unknown>>): void;
  error(message: string, fields?: Readonly<Record<string, unknown>>): void;
}

export interface ConnectorClock {
  now(): Date;
}

export interface HardenedHttpRequest {
  readonly acceptedStatuses?: readonly number[];
  readonly body?: Uint8Array;
  readonly expectedContentTypes?: readonly string[];
  readonly headers?: Readonly<Record<string, string>>;
  readonly method?: "GET" | "HEAD" | "POST";
  readonly signal?: AbortSignal;
  readonly url: string;
}

export interface HardenedHttpResponse {
  readonly body: Uint8Array;
  readonly headers: Readonly<Record<string, string>>;
  readonly status: number;
  readonly url: string;
  json<T>(schema: z.ZodType<T>): T;
  text(): string;
}

export interface ConnectorHttpClient {
  request(input: HardenedHttpRequest): Promise<HardenedHttpResponse>;
}

export interface ConnectorContext {
  readonly abortSignal: AbortSignal;
  readonly clock: ConnectorClock;
  readonly credentials: Readonly<Record<string, unknown>>;
  readonly http: ConnectorHttpClient;
  readonly limits: Readonly<{
    maxBytes: number;
    maxItems: number;
    maxPages: number;
    maxRequests: number;
  }>;
  readonly logger: ConnectorLogger;
}

export interface MemeConnector<TConfig, TCheckpoint> {
  readonly kind: SourceKind;
  validateCheckpoint(input: unknown): TCheckpoint;
  validateConfig(input: unknown): TConfig;
  validateConnectivity(
    context: ConnectorContext,
    config: TConfig,
  ): Promise<ConnectivityResult>;
  fetchPage(
    context: ConnectorContext,
    config: TConfig,
    checkpoint: TCheckpoint | null,
  ): Promise<ConnectorPage>;
}

export interface RegisteredConnector {
  readonly kind: SourceKind;
  fetchPage(
    context: ConnectorContext,
    config: unknown,
    checkpoint: unknown | null,
  ): Promise<ConnectorPage>;
  validateConfig(input: unknown): unknown;
  validateConnectivity(
    context: ConnectorContext,
    config: unknown,
  ): Promise<ConnectivityResult>;
}

export function defineConnector<TConfig, TCheckpoint>(
  connector: MemeConnector<TConfig, TCheckpoint>,
): RegisteredConnector {
  return Object.freeze({
    fetchPage: async (
      context: ConnectorContext,
      config: unknown,
      checkpoint: unknown | null,
    ) =>
      connector.fetchPage(
        context,
        connector.validateConfig(config),
        checkpoint === null ? null : connector.validateCheckpoint(checkpoint),
      ),
    kind: connector.kind,
    validateConfig: (input: unknown) => connector.validateConfig(input),
    validateConnectivity: (context: ConnectorContext, config: unknown) =>
      connector.validateConnectivity(context, connector.validateConfig(config)),
  });
}
