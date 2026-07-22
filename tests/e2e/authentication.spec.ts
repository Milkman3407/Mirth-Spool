import AxeBuilder from "@axe-core/playwright";
import { createDatabaseClient, writeSetting } from "@mirthspool/db";
import { expect, test, type Page } from "@playwright/test";

import { feedPageSchema } from "../../apps/web/src/lib/feed/client-schema";

const administrator = {
  email: "admin@example.test",
  name: "MirthSpool Administrator",
  password: "Correct-Horse-Battery-Staple-73!",
};

test.describe.serial("private setup, sources, and feed", () => {
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
    await expect(page.getByText("No items match this view")).toBeVisible();

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
    await expect(page.getByRole("status")).toContainText("Refresh queued");
    await source.getByText(/Recent ingestion runs/).click();
    await expect(source.locator(".run-row").first()).toContainText(
      "SUCCEEDED",
      {
        timeout: 20_000,
      },
    );
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
    await page.getByLabel("Display name").first().fill("Failing fixture feed");
    await page
      .getByLabel("Feed URL")
      .first()
      .fill("http://fixture-feed:8080/controlled.xml");
    await page.getByRole("button", { name: "Add source" }).click();
    let failingSource = page
      .locator("article.source-card")
      .filter({ hasText: "Failing fixture feed" });
    await expect(failingSource).toContainText("Failing fixture feed");
    const failControl = await request.post(
      "http://127.0.0.1:55435/control/fail",
    );
    expect(failControl.status()).toBe(204);
    await failingSource.getByRole("button", { name: "Resume" }).click();
    await expect
      .poll(
        async () => {
          await page.reload();
          failingSource = page
            .locator("article.source-card")
            .filter({ hasText: "Failing fixture feed" });
          return failingSource.textContent();
        },
        { timeout: 10_000 },
      )
      .toContain("CONFIG_ERROR");
    await expect(failingSource).not.toContainText("Last errorNone");

    const anonymous = await browser.newContext();
    const anonymousPage = await anonymous.newPage();
    const protectedMedia = await anonymous.request.get(
      "/api/media/00000000-0000-4000-8000-000000000001",
    );
    expect(protectedMedia.status()).toBe(401);
    await anonymousPage.goto("/");
    await expect(anonymousPage).toHaveURL("/login");
    const protectedApi = await anonymous.request.get("/api/feed");
    expect(protectedApi.status()).toBe(401);
    await anonymous.close();
  });

  test("browses an accessible responsive feed with persistent controls", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await page.setViewportSize({ height: 900, width: 1280 });
    await signIn(page);
    const feedResponse = await page.request.get("/api/feed?mode=new&limit=12");
    await expect(feedResponse).toBeOK();
    feedPageSchema.parse(await feedResponse.json());
    await expect(
      page.getByRole("heading", { name: "Fresh from your sources." }),
    ).toBeVisible();
    await expect(page.getByText("Deterministic fixture image")).toBeVisible();
    await expect(
      page.getByText("Sensitive fixture should obey the rating ceiling"),
    ).toHaveCount(0);

    const cards = page.locator("article.feed-card");
    await expect(cards).toHaveCount(12);
    await expect
      .poll(async () => {
        const count = await cards.count();
        if (count === 12) {
          await page
            .getByRole("button", { name: "Load more" })
            .click({ timeout: 1_000 })
            .catch(() => undefined);
        }
        return count;
      })
      .toBe(15);
    await expect(
      page.getByText("You reached the end of this feed."),
    ).toBeVisible();
    const linkOnlyCard = cards.filter({
      hasText: "Fixture post 06",
    });
    await linkOnlyCard.scrollIntoViewIfNeeded();
    await expect(linkOnlyCard.getByText("Link-only post")).toBeVisible();
    await expect(page.locator("img[loading=lazy]").first()).toBeVisible();

    await page.getByRole("link", { name: "Hot" }).click();
    await expect(page).toHaveURL(/mode=hot/);
    await expect(page.locator(".ranking-note").first()).toBeVisible();
    await page.getByRole("link", { name: "Random" }).click();
    await expect(page).toHaveURL(/mode=random/);
    await page.getByRole("link", { name: "Unseen" }).click();
    await expect(page).toHaveURL(/mode=unseen/);
    await page.getByRole("link", { name: "Newest" }).click();

    await page.getByText("Filter this feed").click();
    await page.getByLabel("Media type").selectOption("IMAGE");
    await page.getByRole("button", { name: "Apply filters" }).click();
    await expect(page).toHaveURL(/mediaKind=IMAGE/);
    await expect(page.locator("article.feed-card")).toHaveCount(2);

    await page.getByRole("link", { name: "View details" }).first().click();
    await expect(page).toHaveURL(/\/content\/[0-9a-f-]+/);
    await expect(
      page.getByRole("heading", { name: "Source attribution" }),
    ).toBeVisible();
    const original = page.getByRole("link", { name: /Open original/ }).first();
    await expect(original).toHaveAttribute("rel", /noopener/);
    await expect(original).toHaveAttribute("referrerpolicy", "no-referrer");
    const detailAccessibility = await new AxeBuilder({ page }).analyze();
    expect(detailAccessibility.violations).toEqual([]);
    await page.getByRole("link", { name: /Back to feed/ }).click();

    await page.getByText("Filter this feed").click();
    await page.getByLabel("Tag").fill("fixture");
    await page.getByRole("button", { name: "Apply filters" }).click();
    await expect(page).toHaveURL(/tag=fixture/);
    await expect(
      page.getByRole("heading", { name: "No items match this view" }),
    ).toBeVisible();
    const resetFilters = page.getByRole("link", { name: "Reset filters" });
    if (!(await resetFilters.isVisible())) {
      await page.getByText("Filter this feed").click();
    }
    await resetFilters.click();
    const resetCards = page.locator("article.feed-card");
    await expect
      .poll(async () => {
        const count = await resetCards.count();
        if (count === 12) {
          await page
            .getByRole("button", { name: "Load more" })
            .click({ timeout: 1_000 })
            .catch(() => undefined);
        }
        return count;
      })
      .toBe(15);
    await expect(
      page.getByText(
        "<img src=x><script>window.__mirthspool_xss=true</script>",
      ),
    ).toBeVisible();
    expect(
      await page.evaluate<string>("typeof globalThis.__mirthspool_xss"),
    ).toBe("undefined");

    const accessibility = await new AxeBuilder({ page }).analyze();
    expect(accessibility.violations).toEqual([]);

    await page.keyboard.press("Home");
    await page.keyboard.press("Tab");
    await expect(page.locator(":focus")).toHaveCount(1);
    await page.emulateMedia({ reducedMotion: "reduce" });
    expect(
      await page.evaluate<boolean>(
        'matchMedia("(prefers-reduced-motion: reduce)").matches',
      ),
    ).toBe(true);

    await page.setViewportSize({ height: 844, width: 390 });
    await expect(page.locator("article.feed-card").first()).toBeVisible();
    const bounds = await page
      .locator("article.feed-card")
      .first()
      .boundingBox();
    expect(bounds?.width).toBeLessThanOrEqual(390);
    expect(await page.locator('input[type="file"]').count()).toBe(0);
  });

  test("persists favorites, hidden items, history, and optimistic failures", async ({
    page,
  }) => {
    test.setTimeout(150_000);
    await signIn(page);
    await page.goto("/settings");
    await page.getByLabel("Cache policy").selectOption("FAVORITES_ONLY");
    await page.getByRole("button", { name: "Save cache settings" }).click();
    await expect(page.getByRole("status")).toContainText(
      "Cache settings saved",
    );
    await page.goto("/");
    let target = page
      .locator("article.feed-card")
      .filter({ hasText: "Deterministic fixture image" });
    await expect(target).toBeVisible();

    await target.getByRole("button", { name: "Add to favorites" }).click();
    const removeFavorite = target.getByRole("button", {
      name: "Remove from favorites",
    });
    await expect(removeFavorite).toBeVisible();
    await expect(removeFavorite).toBeEnabled();
    await expect
      .poll(
        async () => {
          const response = await page.request.get(
            "/api/feed?mode=new&limit=50",
          );
          if (!response.ok()) return undefined;
          const feed = feedPageSchema.parse(await response.json());
          return feed.items.find(
            (item) => item.title === "Deterministic fixture image",
          )?.media?.cacheState;
        },
        { intervals: [5_000], timeout: 60_000 },
      )
      .toBe("CACHED");
    await page.reload();
    target = page
      .locator("article.feed-card")
      .filter({ hasText: "Deterministic fixture image" });
    await expect(target.getByText("Cached locally")).toBeVisible();
    target = page
      .locator("article.feed-card")
      .filter({ hasText: "Deterministic fixture image" });
    await expect(
      target.getByRole("button", { name: "Remove from favorites" }),
    ).toBeVisible();

    await page.goto("/library/favorites");
    await expect(
      page.getByRole("heading", { name: "Favorites" }),
    ).toBeVisible();
    await expect(page.getByText("Deterministic fixture image")).toBeVisible();
    await page.reload();
    await page
      .locator("article.feed-card")
      .filter({ hasText: "Deterministic fixture image" })
      .getByRole("button", { name: "Remove from favorites" })
      .click();
    await expect(
      page.getByRole("heading", { name: "Nothing here yet" }),
    ).toBeVisible();

    await page.goto("/");
    target = page
      .locator("article.feed-card")
      .filter({ hasText: "Deterministic fixture image" });
    await page.route("**/api/content/*/favorite", async (route) => {
      if (route.request().method() === "PUT") {
        await route.fulfill({
          body: JSON.stringify({ error: { code: "SYNTHETIC_FAILURE" } }),
          contentType: "application/json",
          status: 503,
        });
      } else {
        await route.continue();
      }
    });
    await target.getByRole("button", { name: "Add to favorites" }).click();
    await expect(target.getByRole("alert")).toContainText("restored");
    await expect(
      target.getByRole("button", { name: "Add to favorites" }),
    ).toHaveAttribute("aria-pressed", "false");
    await page.unroute("**/api/content/*/favorite");

    await target.getByRole("button", { name: "Hide item" }).click();
    await expect(page.getByRole("status")).toContainText("Item hidden");
    await page.getByRole("button", { name: "Undo hide" }).click();
    target = page
      .locator("article.feed-card")
      .filter({ hasText: "Deterministic fixture image" });
    await expect(target).toBeVisible();
    await target.getByRole("button", { name: "Hide item" }).click();
    await expect(target).toHaveCount(0);

    await page.goto("/library/hidden");
    await expect(
      page.getByRole("heading", { name: "Hidden items" }),
    ).toBeVisible();
    await expect(page.getByText("Deterministic fixture image")).toBeVisible();
    await page.reload();
    await page
      .locator("article.feed-card")
      .filter({ hasText: "Deterministic fixture image" })
      .getByRole("button", { name: "Unhide item" })
      .click();
    await expect(
      page.getByRole("heading", { name: "Nothing here yet" }),
    ).toBeVisible();
    await page.goto("/");
    target = page
      .locator("article.feed-card")
      .filter({ hasText: "Deterministic fixture image" });
    await expect(target).toBeVisible();

    await target.getByRole("link", { name: "View details" }).click();
    await expect(page).toHaveURL(/\/content\/[0-9a-f-]+/);
    await page.goto("/library/history");
    await expect(
      page.getByRole("heading", { name: "View history" }),
    ).toBeVisible();
    await expect(page.getByText("Deterministic fixture image")).toBeVisible();

    await page.goto("/settings");
    const history = page.getByRole("checkbox", {
      name: "Keep detailed view history",
    });
    await history.uncheck();
    await expect(page.getByText("History preference saved.")).toBeVisible();
    await page.goto("/library/history");
    await expect(
      page.getByRole("heading", { name: "View history is disabled" }),
    ).toBeVisible();
  });

  test("adds public Lemmy, Mastodon, and Reddit sources with normalized attribution", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await signIn(page);
    await page.goto("/sources");
    await page.getByLabel("Lemmy display name").fill("Fixture Lemmy community");
    await page
      .getByLabel("Instance URL")
      .first()
      .fill("http://fixture-feed:8080");
    await page
      .getByLabel("Community name or numeric identifier")
      .first()
      .fill("memes");
    await page.getByLabel("Enable Lemmy source").check();
    await page.getByRole("button", { name: "Add Lemmy source" }).click();

    const source = page
      .locator("article.source-card")
      .filter({ hasText: "Fixture Lemmy community" });
    await expect(source).toContainText("LEMMY · ACTIVE");
    await source.getByRole("button", { name: "Validate" }).click();
    await expect(page.getByRole("status")).toContainText(
      "Connected to memes@fixture-feed",
    );
    await source.getByRole("button", { name: "Refresh now" }).click();
    await source.getByText(/Recent ingestion runs/).click();
    await expect(source.locator(".run-row").first()).toContainText(
      "SUCCEEDED",
      {
        timeout: 20_000,
      },
    );

    await page.goto("/");
    const card = page
      .locator("article.feed-card")
      .filter({ hasText: "Synthetic image post" });
    await expect(card).toBeVisible();
    await card.getByRole("link", { name: "View details" }).click();
    await expect(page.getByText("memes@fixture-feed")).toBeVisible();
    await expect(
      page.getByRole("link", { name: /Open original/ }).first(),
    ).toHaveAttribute("href", "https://lemmy.example/post/1001");

    await page.goto("/sources");
    await page
      .getByLabel("Mastodon display name")
      .fill("Fixture Mastodon hashtag");
    await page
      .getByLabel("Mastodon instance URL")
      .first()
      .fill("http://fixture-feed:8080");
    await page.getByLabel("Hashtag or account handle").first().fill("Memes");
    await page.getByLabel("Enable Mastodon source").check();
    await page.getByRole("button", { name: "Add Mastodon source" }).click();

    {
      const source = page
        .locator("article.source-card")
        .filter({ hasText: "Fixture Mastodon hashtag" });
      await expect(source).toContainText("MASTODON · ACTIVE");
      await source.getByRole("button", { name: "Validate" }).click();
      await expect(page.getByRole("status")).toContainText(
        "Connected to #Memes on fixture-feed",
      );
      await source.getByRole("button", { name: "Refresh now" }).click();
      await source.getByText(/Recent ingestion runs/).click();
      await expect(source.locator(".run-row").first()).toContainText(
        "SUCCEEDED",
        { timeout: 20_000 },
      );

      const database = createDatabaseClient({
        connectionString: process.env.DATABASE_URL!,
      });
      try {
        await writeSetting(database, "content.maximumRating", "SENSITIVE");
      } finally {
        await database.$disconnect();
      }
      await page.goto("/?rating=sensitive");
      const card = page
        .locator("article.feed-card")
        .filter({ hasText: "Hello world" });
      await expect(card).toBeVisible();
      await expect(
        card.getByRole("group", { name: "Content warning" }),
      ).toContainText("Flashing & synthetic");
      await card.getByRole("button", { name: "Reveal this item" }).click();
      await expect(
        card.getByRole("button", { name: "Hide restricted media" }),
      ).toBeVisible();
      await card.getByRole("link", { name: "View details" }).click();
      await expect(page.getByText("mastodon@fixture-feed")).toBeVisible();
      await expect(page.getByText(/@artist@fixture-feed/).last()).toBeVisible();
      const renderedMain = await page.locator("main").innerHTML();
      expect(renderedMain).not.toMatch(/onerror|alert\(1\)|<script/iu);
    }
    // Keep all connector UI coverage in one authenticated browser session so the
    // suite continues to exercise the production authentication rate limit.
    const sourceId = "11111111-1111-4111-8111-111111111111";
    const contentId = "22222222-2222-4222-8222-222222222222";
    const mediaId = "33333333-3333-4333-8333-333333333333";
    let redditSource: Record<string, unknown> | null = null;
    let credentialPayload: unknown;
    await page.route("**/api/sources", async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({
          json: { items: redditSource ? [redditSource] : [] },
        });
        return;
      }
      const body = route.request().postDataJSON() as Record<string, unknown>;
      expect(JSON.stringify(body.config)).not.toMatch(
        /client|secret|user.?agent/iu,
      );
      redditSource = {
        configJson: body.config,
        consecutiveFailures: 0,
        credentials: [],
        defaultContentRating: body.defaultContentRating,
        displayName: body.displayName,
        enabled: false,
        id: sourceId,
        kind: "REDDIT",
        lastAttemptAt: null,
        lastErrorCode: null,
        lastErrorMessage: null,
        lastSuccessAt: null,
        minimumScore: body.minimumScore,
        pollIntervalSeconds: body.pollIntervalSeconds,
        priority: body.priority,
        status: "PAUSED",
      };
      await route.fulfill({ json: { source: redditSource }, status: 201 });
    });
    await page.route(
      `**/api/sources/${sourceId}/credentials`,
      async (route) => {
        credentialPayload = route.request().postDataJSON();
        (redditSource!.credentials as unknown[]) = [
          {
            id: "credential-summary",
            kind: "OAUTH_CLIENT",
            label: "primary",
            updatedAt: "2026-07-22T18:00:00.000Z",
          },
        ];
        await route.fulfill({
          json: { credential: (redditSource!.credentials as unknown[])[0] },
        });
      },
    );
    await page.route(`**/api/sources/${sourceId}/resume`, async (route) => {
      redditSource!.enabled = true;
      redditSource!.status = "ACTIVE";
      await route.fulfill({ json: { source: redditSource } });
    });
    await page.route(`**/api/sources/${sourceId}/runs?**`, async (route) =>
      route.fulfill({ json: { items: [], nextCursor: null } }),
    );
    await page.route(`**/api/sources/${sourceId}/validate`, async (route) =>
      route.fulfill({
        json: {
          result: {
            details: {
              apiCompatibility: "Reddit Data API (OAuth2, read scope)",
              credentialHealth: "valid",
              sampleItemCount: "1",
              subreddit: "r/MirthFixtures",
              subredditTitle: "Synthetic Mirth Fixtures",
            },
            message: "Connected to r/MirthFixtures.",
            ok: true,
          },
        },
      }),
    );

    await page.goto("/sources");
    await page
      .getByLabel("Reddit display name")
      .fill("Fixture Reddit subreddit");
    await page.getByLabel("Subreddit").first().fill("MirthFixtures");
    await page.getByLabel("OAuth client ID").first().fill("fixture_client_id");
    await page
      .getByLabel("OAuth client secret")
      .first()
      .fill("fixture-client-secret-not-real");
    await page
      .getByLabel("Reddit User-Agent")
      .first()
      .fill("linux:mirthspool:v0.1 (by /u/fixture_admin)");
    await page.getByLabel("Enable after securely storing credentials").check();
    await page.getByRole("button", { name: "Add Reddit source" }).click();
    const redditCard = page
      .locator("article.source-card")
      .filter({ hasText: "Fixture Reddit subreddit" });
    await expect(redditCard).toContainText("REDDIT");
    expect(credentialPayload).toMatchObject({
      kind: "OAUTH_CLIENT",
      label: "primary",
    });
    await redditCard.getByRole("button", { name: "Validate" }).click();
    await expect(page.getByRole("status")).toContainText(
      "OAuth credential health is valid",
    );

    const database = createDatabaseClient({
      connectionString: process.env.DATABASE_URL!,
    });
    try {
      await database.source.create({
        data: {
          configJson: { subreddit: "MirthFixtures" },
          defaultContentRating: "SAFE",
          displayName: "Fixture Reddit subreddit",
          enabled: true,
          id: sourceId,
          kind: "REDDIT",
          status: "ACTIVE",
        },
      });
      await database.contentItem.create({
        data: {
          authorName: "fixture_author",
          contentRating: "SAFE",
          id: contentId,
          publishedAt: new Date("2026-07-22T18:00:00.000Z"),
          title: "Synthetic Reddit image",
        },
      });
      const sourcePost = await database.sourcePost.create({
        data: {
          contentItemId: contentId,
          externalId: "t3_img1",
          providerAuthor: "fixture_author",
          providerPublishedAt: new Date("2026-07-22T18:00:00.000Z"),
          providerUrl:
            "https://www.reddit.com/r/MirthFixtures/comments/img1/direct_image/",
          sourceId,
        },
      });
      await database.contentItem.update({
        data: { primarySourcePostId: sourcePost.id },
        where: { id: contentId },
      });
      await database.mediaAsset.create({
        data: {
          contentItemId: contentId,
          id: mediaId,
          kind: "IMAGE",
          mimeType: "image/png",
          ordinal: 0,
          remoteUrl: "https://i.redd.it/fixture.png",
        },
      });
    } finally {
      await database.$disconnect();
    }

    await page.route("**/api/feed?**", async (route) =>
      route.fulfill({
        json: {
          hasMore: false,
          items: [
            {
              actionState: {
                favorite: false,
                hidden: false,
                view: null,
                viewed: false,
              },
              alternateSourceCount: 0,
              authorName: "fixture_author",
              contentRating: "SAFE",
              contentWarning: null,
              id: contentId,
              media: {
                altText: null,
                byteLength: null,
                cacheState: "REMOTE_ONLY",
                durationMs: null,
                height: null,
                id: mediaId,
                kind: "IMAGE",
                mimeType: "image/png",
                remoteUrl: "https://i.redd.it/fixture.png",
                renderUrl: "https://i.redd.it/fixture.png",
                width: null,
              },
              primarySource: {
                displayName: "Fixture Reddit subreddit",
                kind: "REDDIT",
                providerUrl:
                  "https://www.reddit.com/r/MirthFixtures/comments/img1/direct_image/",
                sourceId,
              },
              publishedAt: "2026-07-22T18:00:00.000Z",
              summary: null,
              title: "Synthetic Reddit image",
            },
          ],
          nextCursor: null,
        },
      }),
    );
    await page.goto("/");
    const feedCard = page
      .locator("article.feed-card")
      .filter({ hasText: "Synthetic Reddit image" });
    await expect(feedCard).toContainText("Fixture Reddit subreddit");
    await expect(
      feedCard.getByRole("link", { name: "Open original" }),
    ).toHaveAttribute(
      "href",
      "https://www.reddit.com/r/MirthFixtures/comments/img1/direct_image/",
    );
  });
});

async function signIn(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email address").fill(administrator.email);
  await page.getByLabel("Password").fill(administrator.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL("/");
}
