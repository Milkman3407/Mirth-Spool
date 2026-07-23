import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const releaseWorkflowPath = new URL(
  "../../../.github/workflows/release.yml",
  import.meta.url,
);
const e2eComposePath = new URL("../../../compose.e2e.yaml", import.meta.url);
const e2eAuthenticationPath = new URL(
  "../../../tests/e2e/authentication.spec.ts",
  import.meta.url,
);

describe("release workflow browser-test prerequisites", () => {
  const workflow = readFileSync(releaseWorkflowPath, "utf8");

  it("installs Playwright from the root workspace", () => {
    expect(workflow).toContain(
      "run: pnpm exec playwright install --with-deps chromium",
    );
    expect(workflow).not.toContain("--filter @mirthspool/e2e");
  });

  it("builds host workspace packages before release-mode browser tests", () => {
    const buildIndex = workflow.indexOf("- name: Build host test dependencies");
    const browserTestIndex = workflow.indexOf(
      "- name: Run browser tests against release images",
    );

    expect(buildIndex).toBeGreaterThan(-1);
    expect(browserTestIndex).toBeGreaterThan(buildIndex);
  });

  it("isolates the intentional feed failure circuit from later connectors", () => {
    const compose = readFileSync(e2eComposePath, "utf8");
    const authentication = readFileSync(e2eAuthenticationPath, "utf8");

    expect(compose).toContain("- fixture-failure");
    expect(authentication).toContain(
      "http://fixture-failure:8080/controlled.xml",
    );
  });

  it("normalizes mixed-case GitHub owners before Docker image inspection", () => {
    expect(workflow).toContain("OWNER: ${{ github.repository_owner }}");
    expect(workflow).toContain("${OWNER,,}");
    expect(workflow).toContain("IMAGE: ${{ steps.image.outputs.repository }}");
    expect(workflow).not.toContain(
      "${{ github.repository_owner }}/mirth-spool-${{ matrix.service }}",
    );
  });
});
