import { expect, test } from "@playwright/test";

const administrator = {
  email: "admin@example.test",
  name: "MirthSpool Administrator",
  password: "Correct-Horse-Battery-Staple-73!",
};

test("setup closes and login/logout enforce the private boundary", async ({
  browser,
  page,
  request,
}) => {
  await page.goto("/setup");
  await page.getByLabel("Display name").fill(administrator.name);
  await page.getByLabel("Email address").fill(administrator.email);
  await page.getByLabel("Password").fill(administrator.password);
  await page.getByRole("button", { name: "Create administrator" }).click();
  await expect(page).toHaveURL("/");
  await expect(page.getByText("Authenticated application shell")).toBeVisible();

  const status = await request.get("/api/setup/status");
  await expect(status).toBeOK();
  await expect(status.json()).resolves.toMatchObject({ open: false });
  const closed = await request.post("/api/setup", {
    data: administrator,
    headers: { origin: "http://127.0.0.1:53000" },
  });
  expect(closed.status()).toBe(409);

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL("/login");
  await page.getByLabel("Email address").fill(administrator.email);
  await page.getByLabel("Password").fill("Definitely-Wrong-Password-44!");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.locator(".form-error")).toContainText(
    "supplied credentials were not accepted",
  );

  await page.getByLabel("Password").fill(administrator.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL("/");

  await page.goto("/sources");
  await page.getByLabel("Display name").first().fill("Fixture RSS feed");
  await page
    .getByLabel("Feed URL")
    .first()
    .fill("http://fixture-feed:8080/feed.xml");
  await page.getByLabel("Enabled").check();
  await page.getByRole("button", { name: "Add source" }).click();
  const source = page.locator("article.source-card");
  await expect(source).toContainText("Fixture RSS feed");
  await source.getByRole("button", { name: "Refresh now" }).click();
  await expect(page.getByRole("status")).toContainText("Refresh succeeded");
  await source.getByText(/Recent ingestion runs/).click();
  await expect(source.locator(".run-row").first()).toContainText("SUCCEEDED");
  await expect(source.locator(".run-row").first()).toContainText(
    /created|updated/,
  );
  await source.getByLabel("Display name").fill("Edited fixture RSS feed");
  await source.getByRole("button", { name: "Save changes" }).click();
  await expect(source).toContainText("Edited fixture RSS feed");
  await source.getByRole("button", { name: "Pause" }).click();
  await expect(source).toContainText("Paused");
  await source.getByRole("button", { name: "Validate" }).click();
  await expect(page.getByRole("status")).toContainText(
    "Connected to E2E fixture feed",
  );
  await source.getByRole("button", { name: "Delete" }).click();
  await expect(source).toHaveCount(0);

  await page.getByLabel("Display name").first().fill("Failing fixture feed");
  await page
    .getByLabel("Feed URL")
    .first()
    .fill("http://fixture-feed:8080/controlled.xml");
  await page.getByRole("button", { name: "Add source" }).click();
  let failingSource = page.locator("article.source-card");
  await expect(failingSource).toContainText("Failing fixture feed");
  const failControl = await request.post("http://127.0.0.1:55435/control/fail");
  expect(failControl.status()).toBe(204);
  await failingSource.getByRole("button", { name: "Resume" }).click();
  await expect
    .poll(
      async () => {
        await page.reload();
        failingSource = page.locator("article.source-card");
        return failingSource.textContent();
      },
      { timeout: 10_000 },
    )
    .toContain("CONFIG_ERROR");
  await expect(failingSource).not.toContainText("Last errorNone");

  const anonymous = await browser.newContext();
  const anonymousPage = await anonymous.newPage();
  await anonymousPage.goto("/");
  await expect(anonymousPage).toHaveURL("/login");
  const protectedApi = await anonymous.request.get("/api/feed");
  expect(protectedApi.status()).toBe(401);
  await anonymous.close();
});
