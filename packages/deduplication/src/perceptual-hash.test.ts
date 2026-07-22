import { describe, expect, it } from "vitest";

import {
  differenceHash,
  hammingDistance,
  withinDimensionTolerance,
} from "./perceptual-hash";

describe("bounded difference hashing", () => {
  it("uses a stable 64-bit hash and reviewed distance threshold", () => {
    const gradient = Uint8Array.from({ length: 72 }, (_, index) => index);
    const changed = gradient.slice();
    changed[0] = 255;
    expect(differenceHash(gradient)).toBe("0000000000000000");
    expect(
      hammingDistance(differenceHash(gradient), differenceHash(changed)),
    ).toBe(1);
  });

  it("narrows candidates by conservative dimensions", () => {
    expect(
      withinDimensionTolerance(
        { height: 1_000, width: 1_000 },
        { height: 1_010, width: 990 },
      ),
    ).toBe(true);
    expect(
      withinDimensionTolerance(
        { height: 1_000, width: 1_000 },
        { height: 900, width: 1_000 },
      ),
    ).toBe(false);
  });
});
