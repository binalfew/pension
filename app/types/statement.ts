import { z } from "zod";

// Account type definition
export const Account = z.object({
  AccountName: z.string(),
  Balance: z.number(),
  Interest: z.number(),
  Withdrawals: z.number(),
  ClosingBalance: z.number(),
});

export type Account = z.infer<typeof Account>;

// Statement type definition
export const Statement = z.object({
  AsOfMonth: z.date(),
  EmployeeFullName: z.string(),
  PensionID: z.number(),
  EmployeeID: z.number(),
  Accounts: z.array(Account),
});

export type Statement = z.infer<typeof Statement>;
