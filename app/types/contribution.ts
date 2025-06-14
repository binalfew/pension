import { z } from "zod";

const Contribution = z.object({
  ID: z.number(),
  SAPID: z.number().optional(),
  Amount: z.number().optional(),
  ForPeriod: z.number().optional(),
  InPeriod: z.number().optional(),
  OfficeID: z.number().optional(),
  ContributionTypeID: z.number().optional(),
});

export type Contribution = z.infer<typeof Contribution>;
