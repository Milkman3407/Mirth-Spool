import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const documentedMinimumHostCpus = 4;
const composePath = new URL("../../../compose.yaml", import.meta.url);

describe("Compose CPU bounds", () => {
  it("keeps every service within the documented four-core host minimum", () => {
    const compose = readFileSync(composePath, "utf8");
    const cpuLimits = [
      ...compose.matchAll(/^\s{4}cpus:\s*([0-9.]+)\s*$/gm),
    ].map(([, value]) => Number(value));

    expect(cpuLimits.length).toBeGreaterThan(0);
    expect(cpuLimits.every((limit) => limit <= documentedMinimumHostCpus)).toBe(
      true,
    );
  });
});
