import { z } from "zod";

const ContributionType = z.object({
  ID: z.number(),
  ContributionTypeName: z.string(),
});

export type ContributionType = z.infer<typeof ContributionType>;
