export type ConnectorErrorKind =
  | "TRANSIENT"
  | "RATE_LIMITED"
  | "AUTHENTICATION"
  | "CONFIGURATION"
  | "NOT_FOUND"
  | "MALFORMED_RESPONSE"
  | "PERMANENT";

const safeMessages: Readonly<Record<ConnectorErrorKind, string>> =
  Object.freeze({
    AUTHENTICATION: "The source credentials were rejected.",
    CONFIGURATION: "The source configuration is invalid.",
    MALFORMED_RESPONSE: "The source returned an unsupported response.",
    NOT_FOUND: "The requested source resource was not found.",
    PERMANENT: "The source request cannot be completed.",
    RATE_LIMITED: "The source rate limit was reached.",
    TRANSIENT: "The source is temporarily unavailable.",
  });

export class ConnectorError extends Error {
  readonly code: string;
  readonly kind: ConnectorErrorKind;
  readonly retryAfterSeconds?: number;

  constructor(
    kind: ConnectorErrorKind,
    options: {
      readonly code?: string;
      readonly cause?: unknown;
      readonly retryAfterSeconds?: number;
    } = {},
  ) {
    super(safeMessages[kind], { cause: options.cause });
    this.name = "ConnectorError";
    this.kind = kind;
    this.code = options.code ?? `SOURCE_${kind}`;
    if (options.retryAfterSeconds !== undefined) {
      this.retryAfterSeconds = Math.max(
        1,
        Math.min(86_400, Math.trunc(options.retryAfterSeconds)),
      );
    }
  }
}

export function classifyHttpStatus(
  status: number,
  retryAfterSeconds?: number,
): ConnectorError {
  if (status === 401 || status === 403) {
    return new ConnectorError("AUTHENTICATION", { code: "SOURCE_AUTH_FAILED" });
  }
  if (status === 404 || status === 410) {
    return new ConnectorError("NOT_FOUND", { code: "SOURCE_NOT_FOUND" });
  }
  if (status === 408 || status === 425 || status >= 500) {
    return new ConnectorError("TRANSIENT", {
      code: "SOURCE_UPSTREAM_UNAVAILABLE",
    });
  }
  if (status === 429) {
    return new ConnectorError("RATE_LIMITED", {
      code: "SOURCE_RATE_LIMITED",
      ...(retryAfterSeconds === undefined ? {} : { retryAfterSeconds }),
    });
  }
  return new ConnectorError("PERMANENT", { code: "SOURCE_UPSTREAM_REJECTED" });
}

export function safeConnectorFailure(error: unknown): Readonly<{
  code: string;
  kind: ConnectorErrorKind;
  message: string;
  retryAfterSeconds?: number;
}> {
  const connectorError =
    error instanceof ConnectorError
      ? error
      : new ConnectorError("TRANSIENT", {
          cause: error,
          code: "SOURCE_REQUEST_FAILED",
        });
  return Object.freeze({
    code: connectorError.code,
    kind: connectorError.kind,
    message: connectorError.message,
    ...(connectorError.retryAfterSeconds === undefined
      ? {}
      : { retryAfterSeconds: connectorError.retryAfterSeconds }),
  });
}
