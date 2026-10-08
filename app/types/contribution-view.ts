import { z } from "zod";

const ContributionView = z.object({
  SAPID: z.number(),
  Amount: z.number(),
  ForPeriod: z.number(),
  InPeriod: z.number(),
  // Some contributions have no office
  OfficeName: z.string().nullable(),
  ContributionTypeName: z.string(),
});

export type ContributionView = z.infer<typeof ContributionView>;
