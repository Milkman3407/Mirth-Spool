import { createHash } from "node:crypto";

export const HOT_DECAY_HOURS = 72;

export function providerSignal(score: number | null | undefined): number {
  if (!score) return 0;
  return Math.sign(score) * Math.min(4, Math.log1p(Math.abs(score)));
}

export function prioritySignal(priority: number): number {
  return Math.max(-2, Math.min(2, priority / 50));
}

/** Stored coordinate. Subtracting nowEpochHours / 72 yields the displayed hot score. */
export function hotRankingCoordinate(input: {
  readonly providerScore: number | null | undefined;
  readonly publishedAt: Date;
  readonly sourcePriority: number;
}): number {
  return (
    providerSignal(input.providerScore) +
    prioritySignal(input.sourcePriority) +
    input.publishedAt.valueOf() / 3_600_000 / HOT_DECAY_HOURS
  );
}

export function explainHotRanking(coordinate: number, now: Date) {
  const ageOffset = now.valueOf() / 3_600_000 / HOT_DECAY_HOURS;
  return Object.freeze({
    formula: "boundedProviderSignal + boundedSourcePriority - ageHours / 72",
    score: Number((coordinate - ageOffset).toFixed(6)),
    decayHours: HOT_DECAY_HOURS,
  });
}

export function contentRandomKey(id: string): number {
  return createHash("md5").update(id).digest().readUInt32BE(0) & 0x7fffffff;
}

export function randomSeedPivot(seed: string): number {
  return (
    createHash("sha256").update(seed).digest().readUInt32BE(0) & 0x7fffffff
  );
}
