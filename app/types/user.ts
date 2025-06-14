import { z } from "zod";

const User = z.object({
  PensionID: z.number().optional(),
  FullName: z.string().optional(),
  Email: z.string(),
  SAPID: z.number().optional(),
});

export type User = z.infer<typeof User>;
