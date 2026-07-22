import { expect, test } from "@playwright/test";

test("serves a self-contained installable shell without an upload target", async ({
  page,
  request,
}) => {
  const manifestResponse = await request.get("/manifest.webmanifest");
  await expect(manifestResponse).toBeOK();
  const manifest = await manifestResponse.json();
  expect(manifest).toMatchObject({ display: "standalone", start_url: "/" });
  expect(manifest).not.toHaveProperty("share_target");

  for (const icon of manifest.icons) {
    const response = await request.get(icon.src);
    await expect(response).toBeOK();
    expect(response.headers()["content-type"]).toBe("image/png");
  }

  const serviceWorkerResponse = await request.get("/sw.js");
  await expect(serviceWorkerResponse).toBeOK();
  expect(serviceWorkerResponse.headers()["cache-control"]).toContain(
    "no-cache",
  );
  const serviceWorker = await serviceWorkerResponse.text();
  expect(serviceWorker).toContain('type === "SKIP_WAITING"');
  expect(serviceWorker).toContain('type === "WARM_SAFE_SHELL"');
  expect(serviceWorker).toContain('url.pathname.startsWith("/api/")');

  await page.goto("/offline.html");
  await expect(
    page.getByRole("heading", { name: "MirthSpool is offline" }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Try again" })).toHaveAttribute(
    "href",
    "/",
  );
  expect(await page.locator('input[type="file"]').count()).toBe(0);
});
