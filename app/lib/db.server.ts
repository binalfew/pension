import type { ComputedInterest } from "~/types/computed-interest";
import type { Contribution } from "~/types/contribution";
import type { ContributionType } from "~/types/contribution-type";
import type { ContributionView } from "~/types/contribution-view";
import type { SapIdSummary } from "~/types/sap-id-summary";
import type { Account, Statement } from "~/types/statement";
import type { AdminUser, User } from "~/types/user";
import { Prisma } from "@prisma/client";
import prisma from "./prisma";
import { MAX_PERIOD } from "./utils";

// Unified user resolution - checks both tables and returns user with role
export async function resolveUserByEmail(email: string): Promise<{
  user: User | AdminUser;
  role: "Admin" | "Pensioner";
  // All pensioner records for this email (one per SAP ID); empty for admins
  accounts: User[];
} | null> {
  // First check admin users
  const adminUser = await getAdminUserByEmail(email);
  if (adminUser) {
    return {
      user: adminUser,
      role: "Admin" as const,
      accounts: [],
    };
  }

  // Then check pensioner users
  // A pensioner can have multiple SAP IDs registered under the same email
  const pensionerUsers = await getUsersByEmail(email);
  if (pensionerUsers.length > 0) {
    return {
      user: pensionerUsers[0],
      role: "Pensioner" as const,
      accounts: pensionerUsers,
    };
  }

  // User not found in either table
  return null;
}

// Get user by SAP ID for admin viewing others' statements.
// A SAP ID can have duplicate rows, so prefer the one with an email.
export async function getUserBySapId(sapId: number): Promise<User | null> {
  const users = await prisma.$queryRaw<User[]>`
    SELECT TOP 1 * FROM users
    WHERE SAPID = ${sapId}
    ORDER BY CASE WHEN Email IS NULL THEN 1 ELSE 0 END
  `;
  return users[0] || null;
}

export async function getUserByEmail(email: string): Promise<User | null> {
  const users = await prisma.$queryRaw<
    User[]
  >`SELECT * FROM users WHERE Email = ${email}`;
  return users[0] || null;
}

// One row per SAP ID, most recently active SAP ID (latest contribution) first
export async function getUsersByEmail(email: string): Promise<User[]> {
  const users = await prisma.$queryRaw<User[]>`
    SELECT u.* FROM users u
    WHERE u.Email = ${email}
    ORDER BY
      (SELECT MAX(c.ForPeriod) FROM contributions c WHERE c.SAPID = u.SAPID AND c.ForPeriod <= ${MAX_PERIOD}) DESC,
      u.SAPID DESC
  `;
  return users.filter(
    (user, index) =>
      users.findIndex((other) => other.SAPID === user.SAPID) === index
  );
}

// All SAP IDs registered under the same email as the given SAP ID
// (including the SAP ID itself), most recently active first
export async function getRelatedSapIds(sapId: number): Promise<number[]> {
  const rows = await prisma.$queryRaw<Array<{ SAPID: number }>>`
    SELECT u.SAPID FROM users u
    WHERE u.SAPID IS NOT NULL
      AND u.Email IN (
        SELECT Email FROM users WHERE SAPID = ${sapId} AND Email IS NOT NULL
      )
    GROUP BY u.SAPID
    ORDER BY
      (SELECT MAX(c.ForPeriod) FROM contributions c WHERE c.SAPID = u.SAPID AND c.ForPeriod <= ${MAX_PERIOD}) DESC,
      u.SAPID DESC
  `;
  return rows.length > 0 ? rows.map((row) => row.SAPID) : [sapId];
}

// Contribution period range and closing balance for each SAP ID, returned in
// the same order as the input. Balance matches the statement TOTAL.
export async function getSapIdSummaries(
  sapIds: number[]
): Promise<SapIdSummary[]> {
  if (sapIds.length === 0) {
    return [];
  }

  const rows = await prisma.$queryRaw<SapIdSummary[]>`
    SELECT
      s.SAPID,
      (SELECT MIN(c.ForPeriod) FROM contributions c WHERE c.SAPID = s.SAPID AND c.ForPeriod <= ${MAX_PERIOD}) AS FirstPeriod,
      (SELECT MAX(c.ForPeriod) FROM contributions c WHERE c.SAPID = s.SAPID AND c.ForPeriod <= ${MAX_PERIOD}) AS LastPeriod,
      COALESCE((
        SELECT SUM(c.Amount) FROM contributions c
        INNER JOIN contributionTypes t ON t.ID = c.ContributionTypeID
        WHERE c.SAPID = s.SAPID
      ), 0) + COALESCE((
        SELECT SUM(i.Interest) FROM ComputedInterests i WHERE i.SAPID = s.SAPID
      ), 0) AS Balance
    FROM (SELECT DISTINCT SAPID FROM users WHERE SAPID IN (${Prisma.join(
      sapIds
    )})) s
  `;

  return sapIds
    .map((sapId) => rows.find((row) => row.SAPID === sapId))
    .filter((row): row is SapIdSummary => row !== undefined);
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

// Same columns as ContributionView, but keeps contributions that have no
// office: the view's inner join drops them even though they count towards
// the balance.
export async function getContributionsBySapId(
  sapId: number
): Promise<ContributionView[]> {
  return prisma.$queryRaw<ContributionView[]>`
    SELECT c.SAPID, c.Amount, c.ForPeriod, c.InPeriod, o.OfficeName, t.ContributionTypeName
    FROM contributions c
    INNER JOIN contributionTypes t ON t.ID = c.ContributionTypeID
    LEFT JOIN offices o ON o.ID = c.OfficeID
    WHERE c.SAPID = ${sapId}
    ORDER BY c.ForPeriod DESC, t.ID
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

export type PensionStatementData = {
  statement: Statement;
  total: Account;
  contributions: ContributionView[];
  computedInterests: ComputedInterest[];
};

// Latest month (YYYYMM) in a list of periods, ignoring the legacy
// 2015-2017 opening balance period
function latestPeriod(periods: number[]): number | null {
  const months = periods.filter((period) => period <= MAX_PERIOD);
  return months.length > 0 ? Math.max(...months) : null;
}

export async function generatePensionStatement(
  user: User
): Promise<PensionStatementData> {
  const sapId = user.SAPID ?? 0;
  const statement: Statement = {
    EmployeeFullName: user.FullName ?? "",
    PensionID: user.PensionID ?? 0,
    SapIds: [sapId],
    ContributionsThrough: null,
    InterestThrough: null,
    Accounts: [],
  };

  const total: Account = {
    AccountName: "TOTAL",
    Balance: 0,
  };

  const [contributionTypes, contributions, computedInterests] =
    await Promise.all([
      getAllContributionTypes(),
      getContributionsBySapId(sapId),
      getComputedInterestsBySapId(sapId),
    ]);
  const contributionsByType = await Promise.all(
    contributionTypes.map((contributionType) =>
      getContributionsByType(sapId, contributionType.ID)
    )
  );

  contributionTypes.forEach((contributionType, index) => {
    const contributions = contributionsByType[index];
    const account = {
      AccountName: contributionType.ContributionTypeName,
      Balance: contributions.reduce(
        (acc, contribution) => acc + (contribution.Amount ?? 0),
        0
      ),
    };

    statement.Accounts.push(account);

    total.Balance += account.Balance;
  });

  statement.ContributionsThrough = latestPeriod(
    contributionsByType.flat().map((contribution) => contribution.ForPeriod ?? 0)
  );
  statement.InterestThrough = latestPeriod(
    computedInterests.map((interest) => interest.YearMonth)
  );

  // Add Calculated Interests to the statement
  const cumulatedInterests = {
    AccountName: "CUMULATIVE INTERESTS",
    Balance: computedInterests.reduce(
      (acc, interest) => acc + interest.Interest,
      0
    ),
  };

  total.Balance += cumulatedInterests.Balance;

  statement.Accounts.push(cumulatedInterests);
  statement.Accounts.push(total);

  return { statement, total, contributions, computedInterests };
}

// Generate pension statement by SAP ID (for admin viewing others' statements)
export async function generatePensionStatementBySapId(
  sapId: number
): Promise<PensionStatementData | null> {
  // First get the user by SAP ID
  const user = await getUserBySapId(sapId);
  if (!user) {
    return null;
  }

  // Then generate the statement using the existing function
  return generatePensionStatement(user);
}

// One statement covering all of a person's SAP IDs: account balances are
// summed and transactions merged. Each transaction keeps its own SAPID.
export function combinePensionStatements(
  parts: PensionStatementData[]
): PensionStatementData {
  const accounts: Account[] = [];
  for (const part of parts) {
    for (const account of part.statement.Accounts) {
      const existing = accounts.find(
        (other) => other.AccountName === account.AccountName
      );
      if (existing) {
        existing.Balance += account.Balance;
      } else {
        accounts.push({ ...account });
      }
    }
  }

  const maxOrNull = (values: Array<number | null>) => {
    const present = values.filter((value): value is number => value !== null);
    return present.length > 0 ? Math.max(...present) : null;
  };

  return {
    statement: {
      EmployeeFullName: parts[0]?.statement.EmployeeFullName ?? "",
      PensionID: parts[0]?.statement.PensionID ?? 0,
      SapIds: parts.flatMap((part) => part.statement.SapIds),
      ContributionsThrough: maxOrNull(
        parts.map((part) => part.statement.ContributionsThrough)
      ),
      InterestThrough: maxOrNull(
        parts.map((part) => part.statement.InterestThrough)
      ),
      // TOTAL stays last, as in a single statement
      Accounts: [
        ...accounts.filter((account) => account.AccountName !== "TOTAL"),
        ...accounts.filter((account) => account.AccountName === "TOTAL"),
      ],
    },
    total: {
      AccountName: "TOTAL",
      Balance: parts.reduce((sum, part) => sum + part.total.Balance, 0),
    },
    contributions: parts
      .flatMap((part) => part.contributions)
      .sort((a, b) => b.ForPeriod - a.ForPeriod || a.SAPID - b.SAPID),
    computedInterests: parts
      .flatMap((part) => part.computedInterests)
      .sort((a, b) => b.YearMonth - a.YearMonth || a.SAPID - b.SAPID),
  };
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
    WITH matches AS (
      SELECT SAPID, FullName, Email,
        -- A SAP ID can have duplicate rows; keep one, preferring one with an email
        ROW_NUMBER() OVER (
          PARTITION BY SAPID
          ORDER BY CASE WHEN Email IS NULL THEN 1 ELSE 0 END
        ) AS RowNumber
      FROM users
      WHERE SAPID IS NOT NULL
        AND (CAST(SAPID AS VARCHAR) LIKE ${searchQuery}
          OR FullName LIKE ${searchQuery}
          OR Email LIKE ${searchQuery})
    )
    SELECT TOP 10 SAPID, FullName, Email
    FROM matches
    WHERE RowNumber = 1
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

// Data-quality issues in the users table, for the pension office to clean up
export async function getDataQualityReport(): Promise<{
  // Pensioners with contributions who cannot sign in because they have no email
  missingEmail: Array<{
    SAPID: number;
    FullName: string | null;
    ContributionCount: number;
  }>;
  // SAP IDs that appear in more than one users row
  duplicateSapIds: Array<{
    SAPID: number;
    Rows: number;
    FullNames: string | null;
    Emails: string | null;
  }>;
  // Emails on a domain used by fewer than 3 users, which usually means a typo
  unusualDomains: Array<{
    SAPID: number | null;
    FullName: string | null;
    Email: string;
  }>;
}> {
  const [missingEmail, duplicateSapIds, unusualDomains] = await Promise.all([
    prisma.$queryRaw<
      Array<{
        SAPID: number;
        FullName: string | null;
        ContributionCount: number;
      }>
    >`
      SELECT u.SAPID, u.FullName, COUNT(c.SAPID) AS ContributionCount
      FROM users u
      INNER JOIN contributions c ON c.SAPID = u.SAPID
      WHERE (u.Email IS NULL OR LTRIM(RTRIM(u.Email)) = '')
        -- Skip duplicate rows of a SAP ID that does have an email elsewhere
        AND NOT EXISTS (
          SELECT 1 FROM users o WHERE o.SAPID = u.SAPID AND o.Email IS NOT NULL
        )
      GROUP BY u.SAPID, u.FullName
      ORDER BY u.FullName
    `,
    prisma.$queryRaw<
      Array<{
        SAPID: number;
        Rows: number;
        FullNames: string | null;
        Emails: string | null;
      }>
    >`
      SELECT
        SAPID,
        COUNT(*) AS Rows,
        STRING_AGG(COALESCE(FullName, '(no name)'), ' | ') AS FullNames,
        STRING_AGG(COALESCE(Email, '(no email)'), ' | ') AS Emails
      FROM users
      WHERE SAPID IS NOT NULL
      GROUP BY SAPID
      HAVING COUNT(*) > 1
      ORDER BY SAPID
    `,
    prisma.$queryRaw<
      Array<{ SAPID: number | null; FullName: string | null; Email: string }>
    >`
      WITH emails AS (
        SELECT SAPID, FullName, Email,
          LOWER(LTRIM(RTRIM(SUBSTRING(Email, CHARINDEX('@', Email) + 1, 255)))) AS Domain
        FROM users
        WHERE Email IS NOT NULL AND LTRIM(RTRIM(Email)) <> ''
      )
      SELECT SAPID, FullName, Email
      FROM emails
      WHERE Domain IN (
        SELECT Domain FROM emails GROUP BY Domain HAVING COUNT(*) < 3
      )
      ORDER BY Domain, Email
    `,
  ]);

  return { missingEmail, duplicateSapIds, unusualDomains };
}
