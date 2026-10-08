import { z } from "zod";

// Account type definition
export const Account = z.object({
  AccountName: z.string(),
  Balance: z.number(),
});

export type Account = z.infer<typeof Account>;

// Statement type definition
export const Statement = z.object({
  EmployeeFullName: z.string(),
  PensionID: z.number(),
  // One SAP ID, or several for a combined statement
  SapIds: z.array(z.number()),
  // Latest contribution and interest months (YYYYMM) in the data, so the
  // statement shows how current it is rather than today's date
  ContributionsThrough: z.number().nullable(),
  InterestThrough: z.number().nullable(),
  Accounts: z.array(Account),
});

export type Statement = z.infer<typeof Statement>;
