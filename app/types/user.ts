import { z } from "zod";

const User = z.object({
  PensionID: z.number().optional(),
  FullName: z.string().optional(),
  Email: z.string(),
  SAPID: z.number().optional(),
  Role: z.enum(["Admin", "Pensioner"]).optional(),
});

export type User = z.infer<typeof User>;

const AdminUser = z.object({
  ID: z.number(),
  Email: z.string(),
});

export type AdminUser = z.infer<typeof AdminUser>;
