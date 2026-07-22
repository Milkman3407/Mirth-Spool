import { describe, expect, it } from "vitest";

import { updateSourceSchema } from "./schemas";

describe("source request schemas", () => {
  it("does not inject create defaults into a partial source update", () => {
    expect(updateSourceSchema.parse({ displayName: "Updated feed" })).toEqual({
      displayName: "Updated feed",
    });
  });
});
