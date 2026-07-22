import { createDatabaseClient, upsertNormalizedContent } from "../src/index.js";

const databaseUrl = process.env.DATABASE_URL;
if (databaseUrl === undefined) {
  throw new Error("DATABASE_URL is required to seed the database");
}

const client = createDatabaseClient({
  connectionString: databaseUrl,
  maxConnections: 2,
});

try {
  const source = await client.source.upsert({
    where: { id: "00000000-0000-4000-8000-000000000001" },
    create: {
      id: "00000000-0000-4000-8000-000000000001",
      kind: "RSS",
      displayName: "Synthetic example feed",
      configJson: { feedUrl: "https://example.invalid/mirthspool/feed.xml" },
    },
    update: {},
  });

  await upsertNormalizedContent(client, {
    sourceId: source.id,
    externalId: "synthetic-post-001",
    title: "A synthetic MirthSpool item",
    normalizedTitle: "a synthetic mirthspool item",
    summary:
      "Deterministic seed content. It does not describe a real person or post.",
    contentRating: "SAFE",
    publishedAt: new Date("2026-01-01T00:00:00.000Z"),
    canonicalUrl: "https://example.invalid/mirthspool/posts/synthetic-post-001",
    media: [
      {
        ordinal: 0,
        kind: "IMAGE",
        remoteUrl: "https://example.invalid/mirthspool/media/synthetic-001.png",
        mimeType: "image/png",
        width: 640,
        height: 480,
      },
    ],
  });
} finally {
  await client.$disconnect();
}
