import { z } from "zod";

export const duplicateMergeSchema = z
  .object({
    leftContentId: z.uuid(),
    rightContentId: z.uuid(),
  })
  .strict()
  .refine((value) => value.leftContentId !== value.rightContentId);

export const duplicateSplitSchema = z.object({ contentId: z.uuid() }).strict();
