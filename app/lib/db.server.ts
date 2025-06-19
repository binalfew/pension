import type { ComputedInterest } from "~/types/computed-interest";
import type { Contribution } from "~/types/contribution";
import type { ContributionType } from "~/types/contribution-type";
import type { ContributionView } from "~/types/contribution-view";
import type { Account, Statement } from "~/types/statement";
import type { AdminUser, User } from "~/types/user";
import prisma from "./prisma";

// Unified user resolution - checks both tables and returns user with role
export async function resolveUserByEmail(email: string): Promise<{
  user: User | AdminUser;
  role: "Admin" | "Pensioner";
} | null> {
  // First check admin users
  const adminUser = await getAdminUserByEmail(email);
  if (adminUser) {
    return {
      user: adminUser,
      role: "Admin" as const,
    };
  }

  // Then check pensioner users
  const pensionerUser = await getUserByEmail(email);
  if (pensionerUser) {
    return {
      user: pensionerUser,
      role: "Pensioner" as const,
    };
  }

  // User not found in either table
  return null;
}

// Get user by SAP ID for admin viewing others' statements
export async function getUserBySapId(sapId: number): Promise<User | null> {
  const users = await prisma.$queryRaw<
    User[]
  >`SELECT * FROM users WHERE SAPID = ${sapId}`;
  return users[0] || null;
}

export async function getUserByEmail(email: string): Promise<User | null> {
  const users = await prisma.$queryRaw<
    User[]
  >`SELECT * FROM users WHERE Email = ${email}`;
  return users[0] || null;
}

export async function getAdminUserByEmail(
  email: string
): Promise<AdminUser | null> {
  const users = await prisma.$queryRaw<
    AdminUser[]
  >`SELECT * FROM adminUsers WHERE Email = ${email}`;
  return users[0] || null;
}

export async function getAllContributionTypes(): Promise<ContributionType[]> {
  return prisma.$queryRaw<ContributionType[]>`SELECT * FROM contributionTypes`;
}

export async function getContributionsByType(
  sapId: number,
  contributionTypeId: number
): Promise<Contribution[]> {
  return prisma.$queryRaw<Contribution[]>`
    SELECT * FROM contributions 
    WHERE SAPID = ${sapId} 
    AND ContributionTypeID = ${contributionTypeId}
  `;
}

export async function getContributionsBySapId(
  sapId: number
): Promise<ContributionView[]> {
  return prisma.$queryRaw<ContributionView[]>`
    SELECT * FROM ContributionView 
    WHERE SAPID = ${sapId} 
    ORDER BY ForPeriod DESC
  `;
}

export async function getComputedInterestsBySapId(
  sapId: number
): Promise<ComputedInterest[]> {
  return prisma.$queryRaw<ComputedInterest[]>`
    SELECT * FROM ComputedInterests 
    WHERE SAPID = ${sapId} 
    ORDER BY YearMonth DESC
  `;
}

export async function generatePensionStatement(user: User): Promise<{
  statement: Statement;
  total: Account;
  contributions: ContributionView[];
  computedInterests: ComputedInterest[];
}> {
  const statement: Statement = {
    EmployeeFullName: user.FullName ?? "",
    AsOfMonth: new Date(),
    EmployeeID: user.SAPID ?? 0,
    PensionID: user.PensionID ?? 0,
    Accounts: [],
  };

  const total: Account = {
    AccountName: "TOTAL",
    Balance: 0,
    Interest: 0,
    Withdrawals: 0,
    ClosingBalance: 0,
  };

  const contributionTypes = await getAllContributionTypes();
  for (const contributionType of contributionTypes) {
    const contributions = await getContributionsByType(
      user.SAPID ?? 0,
      contributionType.ID
    );
    const account = {
      AccountName: contributionType.ContributionTypeName,
      Balance: contributions.reduce(
        (acc, contribution) => acc + (contribution.Amount ?? 0),
        0
      ),
      Interest: 0,
      Withdrawals: 0,
      ClosingBalance: 0,
    };

    account.ClosingBalance =
      account.Balance + account.Interest + account.Withdrawals;

    statement.Accounts.push(account);

    total.Balance += account.Balance;
    total.Interest += account.Interest;
    total.Withdrawals += account.Withdrawals;
    total.ClosingBalance += account.ClosingBalance;
  }

  const contributions = await getContributionsBySapId(user.SAPID ?? 0);
  const computedInterests = await getComputedInterestsBySapId(user.SAPID ?? 0);

  // Add Calculated Interests to the statement
  const cumulatedInterests = {
    AccountName: "CUMULATIVE INTERESTS",
    Balance: computedInterests.reduce(
      (acc, interest) => acc + interest.Interest,
      0
    ),
    Interest: 0,
    Withdrawals: 0,
    ClosingBalance: 0,
  };

  total.Balance += cumulatedInterests.Balance;
  total.Interest += cumulatedInterests.Balance;
  total.ClosingBalance += cumulatedInterests.Balance;

  statement.Accounts.push(cumulatedInterests);
  statement.Accounts.push(total);

  return { statement, total, contributions, computedInterests };
}

// Generate pension statement by SAP ID (for admin viewing others' statements)
export async function generatePensionStatementBySapId(sapId: number): Promise<{
  statement: Statement;
  total: Account;
  contributions: ContributionView[];
  computedInterests: ComputedInterest[];
} | null> {
  // First get the user by SAP ID
  const user = await getUserBySapId(sapId);
  if (!user) {
    return null;
  }

  // Then generate the statement using the existing function
  return generatePensionStatement(user);
}

// Search users for autocomplete suggestions
export async function searchUsers(query: string): Promise<
  Array<{
    SAPID: number;
    FullName: string;
    Email: string;
  }>
> {
  if (!query || query.trim().length < 2) {
    return [];
  }

  const searchQuery = `%${query.trim()}%`;

  return prisma.$queryRaw<
    Array<{
      SAPID: number;
      FullName: string;
      Email: string;
    }>
  >`
    SELECT TOP 10 SAPID, FullName, Email 
    FROM users 
    WHERE CAST(SAPID AS VARCHAR) LIKE ${searchQuery} 
       OR FullName LIKE ${searchQuery}
       OR Email LIKE ${searchQuery}
    ORDER BY 
      CASE 
        WHEN CAST(SAPID AS VARCHAR) = ${query.trim()} THEN 1
        WHEN CAST(SAPID AS VARCHAR) LIKE ${query.trim()} + '%' THEN 2
        WHEN FullName LIKE ${query.trim()} + '%' THEN 3
        ELSE 4
      END,
      FullName
  `;
}
