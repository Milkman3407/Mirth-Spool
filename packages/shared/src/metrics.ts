const metricNamePattern = /^[a-z][a-z0-9_]{0,79}$/u;
const labelValuePattern = /^[A-Za-z0-9_.:-]{1,64}$/u;

export interface MetricPoint {
  readonly labels: Readonly<Record<string, string>>;
  readonly name: string;
  readonly value: number;
}

export class BoundedMetrics {
  readonly #maximumSeries: number;
  readonly #series = new Map<string, MetricPoint>();

  constructor(maximumSeries = 500) {
    if (
      !Number.isInteger(maximumSeries) ||
      maximumSeries < 1 ||
      maximumSeries > 5_000
    ) {
      throw new RangeError("maximumSeries must be between 1 and 5000.");
    }
    this.#maximumSeries = maximumSeries;
  }

  increment(
    name: string,
    labels: Readonly<Record<string, string>> = {},
    amount = 1,
  ): void {
    if (
      !metricNamePattern.test(name) ||
      !Number.isFinite(amount) ||
      amount < 0
    ) {
      throw new TypeError("Invalid metric.");
    }
    const normalized = Object.fromEntries(
      Object.entries(labels)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, value]) => {
          if (!metricNamePattern.test(key) || !labelValuePattern.test(value)) {
            throw new TypeError("Invalid metric label.");
          }
          return [key, value];
        }),
    );
    const seriesKey = `${name}:${JSON.stringify(normalized)}`;
    const existing = this.#series.get(seriesKey);
    if (!existing && this.#series.size >= this.#maximumSeries) return;
    this.#series.set(seriesKey, {
      labels: normalized,
      name,
      value: (existing?.value ?? 0) + amount,
    });
  }

  snapshot(): readonly MetricPoint[] {
    return Object.freeze(
      [...this.#series.values()].map((point) => Object.freeze(point)),
    );
  }

  toPrometheus(prefix = "mirthspool"): string {
    return `${this.snapshot()
      .map((point) => {
        const labels = Object.entries(point.labels)
          .map(([key, value]) => `${key}="${value}"`)
          .join(",");
        return `${prefix}_${point.name}${labels ? `{${labels}}` : ""} ${point.value}`;
      })
      .join("\n")}\n`;
  }
}
