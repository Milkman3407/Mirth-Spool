import { z } from "zod";

import type { ContentRating, Prisma } from "./generated/prisma/client.js";

const preferenceUpdateSchema = z
  .object({
    defaultFeedMode: z
      .enum(["new", "hot", "random", "unseen", "for-you"])
      .optional(),
    historyEnabled: z.boolean().optional(),
    maximumContentRating: z
      .enum(["SAFE", "SENSITIVE", "ADULT", "UNKNOWN"])
      .optional(),
    recommendationsEnabled: z.boolean().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0);

export type UserPreferenceUpdate = z.output<typeof preferenceUpdateSchema>;

export async function readUserPreferences(
  client: Prisma.TransactionClient,
  userId: string,
) {
  z.uuid().parse(userId);
  const stored = await client.userPreference.findUnique({ where: { userId } });
  return Object.freeze({
    defaultFeedMode: stored?.defaultFeedMode ?? "new",
    historyEnabled: stored?.historyEnabled ?? true,
    maximumContentRating: (stored?.maximumContentRating ??
      "SAFE") as ContentRating,
    recommendationsEnabled: stored?.recommendationsEnabled ?? true,
    recommendationResetAt: stored?.recommendationResetAt ?? null,
  });
}

export async function writeUserPreferences(
  client: Prisma.TransactionClient,
  userId: string,
  update: unknown,
) {
  z.uuid().parse(userId);
  const parsed = preferenceUpdateSchema.parse(update);
  const create: Prisma.UserPreferenceUncheckedCreateInput = { userId };
  const data: Prisma.UserPreferenceUncheckedUpdateInput = {};
  if (parsed.defaultFeedMode !== undefined) {
    create.defaultFeedMode = parsed.defaultFeedMode;
    data.defaultFeedMode = parsed.defaultFeedMode;
  }
  if (parsed.historyEnabled !== undefined) {
    create.historyEnabled = parsed.historyEnabled;
    data.historyEnabled = parsed.historyEnabled;
  }
  if (parsed.maximumContentRating !== undefined) {
    create.maximumContentRating = parsed.maximumContentRating;
    data.maximumContentRating = parsed.maximumContentRating;
  }
  if (parsed.recommendationsEnabled !== undefined) {
    create.recommendationsEnabled = parsed.recommendationsEnabled;
    data.recommendationsEnabled = parsed.recommendationsEnabled;
    if (!parsed.recommendationsEnabled) {
      data.defaultFeedMode = "new";
    }
  }
  const stored = await client.userPreference.upsert({
    create,
    update: data,
    where: { userId },
  });
  return Object.freeze({
    defaultFeedMode: stored.defaultFeedMode,
    historyEnabled: stored.historyEnabled,
    maximumContentRating: stored.maximumContentRating,
    recommendationsEnabled: stored.recommendationsEnabled,
    recommendationResetAt: stored.recommendationResetAt,
  });
}
