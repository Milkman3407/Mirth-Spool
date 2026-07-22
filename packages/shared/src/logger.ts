export interface StructuredLogger {
  debug(event: string, fields?: Readonly<Record<string, unknown>>): void;
  error(event: string, fields?: Readonly<Record<string, unknown>>): void;
  info(event: string, fields?: Readonly<Record<string, unknown>>): void;
  warn(event: string, fields?: Readonly<Record<string, unknown>>): void;
}

type LogLevel = "debug" | "error" | "info" | "warn";
type LogSink = (line: string) => void;

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
        ...fields,
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
