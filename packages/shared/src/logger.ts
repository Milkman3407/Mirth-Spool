export interface StructuredLogger {
  debug(event: string, fields?: Readonly<Record<string, unknown>>): void;
  error(event: string, fields?: Readonly<Record<string, unknown>>): void;
  info(event: string, fields?: Readonly<Record<string, unknown>>): void;
  warn(event: string, fields?: Readonly<Record<string, unknown>>): void;
}

type LogLevel = "debug" | "error" | "info" | "warn";
type LogSink = (line: string) => void;

const sensitiveKey =
  /(?:authorization|cookie|credential|encryption.?key|password|secret|token)/iu;
const urlLike = /\bhttps?:\/\/[^\s"']+/giu;

export function redactLogValue(value: unknown, key = "", depth = 0): unknown {
  if (sensitiveKey.test(key)) return "[REDACTED]";
  if (depth >= 4) return "[TRUNCATED]";
  if (typeof value === "string") {
    return value.slice(0, 2_048).replace(urlLike, (candidate) => {
      const withoutUserInfo = candidate.replace(
        /^(https?:\/\/)(?:[^/@]+@)?/iu,
        "$1",
      );
      return withoutUserInfo.split(/[?#]/u, 1)[0] ?? "[REDACTED_URL]";
    });
  }
  if (Array.isArray(value)) {
    return value
      .slice(0, 50)
      .map((item) => redactLogValue(item, key, depth + 1));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .slice(0, 50)
        .map(([nestedKey, nestedValue]) => [
          nestedKey,
          redactLogValue(nestedValue, nestedKey, depth + 1),
        ]),
    );
  }
  return value;
}

const priorities: Readonly<Record<LogLevel, number>> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

export function createStructuredLogger(options: {
  readonly environment: string;
  readonly minimumLevel: LogLevel;
  readonly now?: () => Date;
  readonly service: "web" | "worker";
  readonly sink: LogSink;
}): StructuredLogger {
  const now = options.now ?? (() => new Date());

  const write = (
    level: LogLevel,
    event: string,
    fields: Readonly<Record<string, unknown>> = {},
  ): void => {
    if (priorities[level] < priorities[options.minimumLevel]) {
      return;
    }

    options.sink(
      JSON.stringify({
        timestamp: now().toISOString(),
        level,
        service: options.service,
        environment: options.environment,
        event,
        ...(redactLogValue(fields) as Record<string, unknown>),
      }),
    );
  };

  return Object.freeze({
    debug: (event: string, fields?: Readonly<Record<string, unknown>>) =>
      write("debug", event, fields),
    error: (event: string, fields?: Readonly<Record<string, unknown>>) =>
      write("error", event, fields),
    info: (event: string, fields?: Readonly<Record<string, unknown>>) =>
      write("info", event, fields),
    warn: (event: string, fields?: Readonly<Record<string, unknown>>) =>
      write("warn", event, fields),
  });
}
