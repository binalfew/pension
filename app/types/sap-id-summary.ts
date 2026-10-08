import { z } from "zod";

const SapIdSummary = z.object({
  SAPID: z.number(),
  FirstPeriod: z.number().nullable(),
  LastPeriod: z.number().nullable(),
  Balance: z.number(),
});

export type SapIdSummary = z.infer<typeof SapIdSummary>;
