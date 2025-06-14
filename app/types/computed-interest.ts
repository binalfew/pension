import { z } from "zod";

export const computedInterestSchema = z.object({
  ID: z.number(),
  SAPID: z.number(),
  YearMonth: z.number(),
  Interest: z.number(),
});

export type ComputedInterest = z.infer<typeof computedInterestSchema>;
