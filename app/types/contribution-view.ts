import { z } from "zod";

const ContributionView = z.object({
  SAPID: z.number(),
  Amount: z.number(),
  ForPeriod: z.number(),
  InPeriod: z.number(),
  OfficeName: z.string(),
  ContributionTypeName: z.string(),
});

export type ContributionView = z.infer<typeof ContributionView>;
