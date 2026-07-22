import { z } from "zod";

export const PERCEPTUAL_HASH_DISTANCE_THRESHOLD = 4;
export const PERCEPTUAL_DIMENSION_TOLERANCE = 0.02;

export interface PerceptualHashInput {
  readonly body: AsyncIterable<Uint8Array>;
  readonly maxBytes: number;
  readonly maxPixels: number;
  readonly signal: AbortSignal;
  readonly timeoutMs: number;
}

export interface PerceptualHashResult {
  readonly hash: string;
  readonly height: number;
  readonly width: number;
}

export interface PerceptualHasher {
  hash(input: PerceptualHashInput): Promise<PerceptualHashResult>;
}

export function differenceHash(grayscale: Uint8Array): string {
  if (grayscale.byteLength !== 72) {
    throw new TypeError("Difference hash requires a 9 by 8 grayscale image.");
  }
  let value = 0n;
  for (let row = 0; row < 8; row += 1) {
    for (let column = 0; column < 8; column += 1) {
      value <<= 1n;
      const offset = row * 9 + column;
      if (grayscale[offset]! > grayscale[offset + 1]!) value |= 1n;
    }
  }
  return value.toString(16).padStart(16, "0");
}

export function hammingDistance(left: string, right: string): number {
  const schema = z.string().regex(/^[0-9a-f]{16}$/u);
  let value =
    BigInt(`0x${schema.parse(left)}`) ^ BigInt(`0x${schema.parse(right)}`);
  let count = 0;
  while (value > 0n) {
    count += Number(value & 1n);
    value >>= 1n;
  }
  return count;
}

export function withinDimensionTolerance(
  left: Readonly<{ height: number; width: number }>,
  right: Readonly<{ height: number; width: number }>,
  tolerance = PERCEPTUAL_DIMENSION_TOLERANCE,
): boolean {
  const ratio = (a: number, b: number) => Math.abs(a - b) / Math.max(a, b);
  return (
    ratio(left.width, right.width) <= tolerance &&
    ratio(left.height, right.height) <= tolerance
  );
}
