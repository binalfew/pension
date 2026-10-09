// Managing the users table from the Users pages. The pages work with people:
// everyone signing in with one email (who can have several SAP IDs), or a SAP
// ID that has no email
import { Prisma } from "@prisma/client";
import { createHash } from "node:crypto";
import { redirect } from "react-router";
import { getUserEmail } from "./auth.server";
import { resolveUserByEmail } from "./db.server";
import prisma from "./prisma";
import type { SapIdRecord } from "~/types/sap-id-record";
import { MAX_PERIOD } from "./utils";
import type { PersonRef } from "./user-links";

// Every users row has this placeholder PensionID
const PLACEHOLDER_PENSION_ID = 99999;

// The users table's SAPID is an int
const MAX_SAP_ID = 2147483647;
// FullName and Email are nvarchar(255)
const MAX_TEXT_LENGTH = 255;

export const USERS_PAGE_SIZE = 50;

// Only admins (the pension office) can manage users
export async function requireAdminEmail(request: Request) {
  const userEmail = await getUserEmail(request);
  const resolvedUser = userEmail ? await resolveUserByEmail(userEmail) : null;
  if (resolvedUser?.role !== "Admin") {
    throw redirect("/statement");
  }
  return userEmail as string;
}

// Set on the Users list by the edit and delete pages when they send the
// admin back there
const NOTICE_PARAMS = ["deleted"];

// The Users list as the admin left it (search, filter and page), for the
// edit and delete pages to go back to. Anything else falls back to the list
export function usersListUrl(
  value: unknown,
  notice: Record<string, string> = {}
) {
  const path = String(value ?? "");
  const url = new URL(
    /^\/users(\?|$)/.test(path) ? path : "/users",
    "http://localhost"
  );
  for (const name of NOTICE_PARAMS) {
    url.searchParams.delete(name);
  }
  for (const [name, text] of Object.entries(notice)) {
    url.searchParams.set(name, text);
  }
  return `${url.pathname}${url.search}`;
}

// The request was refused and nothing was changed
export class UserChangeRejectedError extends Error {}

export function parseSapId(value: unknown) {
  const text = String(value ?? "").trim();
  if (!/^\d+$/.test(text)) {
    return null;
  }
  const sapId = Number(text);
  return sapId > 0 && sapId <= MAX_SAP_ID ? sapId : null;
}

// Trimmed and lower-cased, the way sign-in normalises the Microsoft email
export function normaliseEmail(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

export type UserFields = {
  sapId: number;
  fullName: string;
  email: string | null;
};

// A person's name and email from a form, or what's wrong with them
export function parsePersonDetails(
  formData: FormData
): { fields: Omit<UserFields, "sapId"> } | { error: string } {
  const fullName = String(formData.get("fullName") ?? "")
    .trim()
    .replace(/\s+/g, " ");
  const email = normaliseEmail(formData.get("email"));

  if (!fullName) {
    return { error: "Enter the person's full name." };
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: "Enter the full email address the person signs in with." };
  }
  if (fullName.length > MAX_TEXT_LENGTH || email.length > MAX_TEXT_LENGTH) {
    return {
      error: `Names and emails can be at most ${MAX_TEXT_LENGTH} characters.`,
    };
  }
  return { fields: { fullName, email: email || null } };
}

// The add form's fields, or what's wrong with them
export function parseUserForm(
  formData: FormData
): { fields: UserFields } | { error: string } {
  const sapId = parseSapId(formData.get("sapId"));
  if (sapId === null) {
    return { error: "A SAP ID is a whole number, like 12345." };
  }
  const details = parsePersonDetails(formData);
  return "error" in details
    ? details
    : { fields: { sapId, ...details.fields } };
}

// The person a page or form is about, from its email or sapId parameter
export function parsePersonRef(
  params: URLSearchParams | FormData
): PersonRef | null {
  const email = normaliseEmail(params.get("email"));
  if (email) {
    return { email };
  }
  const sapId = parseSapId(params.get("sapId"));
  return sapId === null ? null : { sapId };
}

const normalise = (value: string | null) => value?.trim().toLowerCase() || null;

// The same email, however it's stored: case and spaces vary in the data
const emailIs = (email: string) =>
  Prisma.sql`LOWER(LTRIM(RTRIM(Email))) = ${email}`;
const noEmail = Prisma.sql`LTRIM(RTRIM(ISNULL(Email, ''))) = ''`;

// WHERE condition for a person's users rows
function personRows(ref: PersonRef) {
  return "email" in ref
    ? emailIs(ref.email)
    : Prisma.sql`SAPID = ${ref.sapId} AND ${noEmail}`;
}

export type PeopleFilter = "all" | "no-email" | "several" | "duplicates";

export type PersonListRow = {
  ref: PersonRef;
  fullName: string | null;
  email: string | null;
  // Flagged when the SAP ID has more than one users row
  sapIds: Array<{ sapId: number; duplicate: boolean }>;
  contributions: number;
};

// One row per person: rows sharing an email are one person, and a SAP ID
// without an email is a person of its own
export async function listPeople({
  query,
  filter,
  page,
}: {
  query: string;
  filter: PeopleFilter;
  page: number;
}): Promise<{ rows: PersonListRow[]; total: number }> {
  const term = query.trim();
  // LIKE wildcards in what was typed are matched literally
  const pattern = `%${term.replace(/[[\]%_]/g, "[$&]")}%`;
  const conditions = [Prisma.sql`1 = 1`];
  if (term) {
    conditions.push(Prisma.sql`Matches = 1`);
  }
  if (filter === "no-email") {
    conditions.push(Prisma.sql`Email IS NULL`);
  } else if (filter === "several") {
    conditions.push(Prisma.sql`SapIdCount > 1`);
  } else if (filter === "duplicates") {
    conditions.push(Prisma.sql`HasDuplicates = 1`);
  }
  const where = Prisma.join(conditions, " AND ");

  const people = Prisma.sql`
    WITH duplicated AS (
      SELECT SAPID FROM users WHERE SAPID IS NOT NULL
      GROUP BY SAPID HAVING COUNT(*) > 1
    ),
    base AS (
      SELECT u.SAPID, u.FullName, u.Email,
        CASE WHEN LTRIM(RTRIM(ISNULL(u.Email, ''))) <> ''
          THEN LOWER(LTRIM(RTRIM(u.Email))) END AS NormEmail,
        CASE WHEN d.SAPID IS NULL THEN 0 ELSE 1 END AS Duplicated
      FROM users u
      LEFT JOIN duplicated d ON d.SAPID = u.SAPID
    ),
    people AS (
      SELECT
        MAX(NormEmail) AS Email,
        MIN(SAPID) AS FirstSapId,
        MAX(LTRIM(RTRIM(FullName))) AS FullName,
        COUNT(DISTINCT SAPID) AS SapIdCount,
        MAX(CASE WHEN CAST(SAPID AS VARCHAR(20)) LIKE ${pattern}
          OR FullName LIKE ${pattern} OR Email LIKE ${pattern}
          THEN 1 ELSE 0 END) AS Matches,
        MAX(Duplicated) AS HasDuplicates
      FROM base
      -- Rows with neither are on the Quality page
      WHERE NormEmail IS NOT NULL OR SAPID IS NOT NULL
      GROUP BY COALESCE('e:' + NormEmail, 's:' + CAST(SAPID AS VARCHAR(20)))
    )
  `;

  const [found, [{ Total }]] = await Promise.all([
    prisma.$queryRaw<
      Array<{ Email: string | null; FirstSapId: number; FullName: string | null }>
    >`
      ${people}
      SELECT Email, FirstSapId, FullName FROM people
      WHERE ${where}
      ORDER BY FullName, Email, FirstSapId
      OFFSET ${(page - 1) * USERS_PAGE_SIZE} ROWS
      FETCH NEXT ${USERS_PAGE_SIZE} ROWS ONLY
    `,
    prisma.$queryRaw<Array<{ Total: number }>>`
      ${people}
      SELECT COUNT(*) AS Total FROM people WHERE ${where}
    `,
  ]);

  const emails = found.flatMap((row) => (row.Email ? [row.Email] : []));
  const loneSapIds = found.flatMap((row) =>
    row.Email ? [] : [row.FirstSapId]
  );
  const links =
    found.length === 0
      ? []
      : await prisma.$queryRaw<Array<{ Email: string | null; SAPID: number }>>`
          SELECT DISTINCT
            CASE WHEN ${noEmail} THEN NULL ELSE LOWER(LTRIM(RTRIM(Email))) END AS Email,
            SAPID
          FROM users
          WHERE SAPID IS NOT NULL AND (
            ${
              emails.length > 0
                ? Prisma.sql`LOWER(LTRIM(RTRIM(Email))) IN (${Prisma.join(emails)})`
                : Prisma.sql`1 = 0`
            }
            OR (${noEmail} AND ${
              loneSapIds.length > 0
                ? Prisma.sql`SAPID IN (${Prisma.join(loneSapIds)})`
                : Prisma.sql`1 = 0`
            })
          )
        `;
  const sapIds = [...new Set(links.map((link) => link.SAPID))];
  const counts =
    sapIds.length === 0
      ? []
      : await prisma.$queryRaw<
          Array<{ SAPID: number; UserRows: number; Contributions: number }>
        >`
          SELECT s.SAPID,
            (SELECT COUNT(*) FROM users u WHERE u.SAPID = s.SAPID) AS UserRows,
            (SELECT COUNT(*) FROM contributions c WHERE c.SAPID = s.SAPID) AS Contributions
          FROM (SELECT DISTINCT SAPID FROM users
            WHERE SAPID IN (${Prisma.join(sapIds)})) s
        `;
  const countBySapId = new Map(counts.map((row) => [row.SAPID, row]));

  return {
    rows: found.map((row) => {
      const own = links
        .filter((link) =>
          row.Email ? link.Email === row.Email : link.Email === null && link.SAPID === row.FirstSapId
        )
        .map((link) => link.SAPID)
        .sort((a, b) => a - b);
      return {
        ref: row.Email ? { email: row.Email } : { sapId: row.FirstSapId },
        fullName: row.FullName || null,
        email: row.Email,
        sapIds: own.map((sapId) => ({
          sapId,
          duplicate: Number(countBySapId.get(sapId)?.UserRows ?? 0) > 1,
        })),
        contributions: own.reduce(
          (sum, sapId) =>
            sum + Number(countBySapId.get(sapId)?.Contributions ?? 0),
          0
        ),
      };
    }),
    total: Number(Total),
  };
}

export type PersonSapId = {
  sapId: number;
  contributions: number;
  total: number;
  firstPeriod: number | null;
  lastPeriod: number | null;
  office: string | null;
  // This person's rows for the SAP ID
  ownRows: number;
  // For a person with an email: rows for the SAP ID with no email
  blankRows: number;
  // Other emails the SAP ID is registered with
  otherEmails: string[];
};

export type Person = {
  ref: PersonRef;
  email: string | null;
  fullName: string | null;
  sapIds: PersonSapId[];
};

// Fingerprint of a person's rows: their SAP IDs and who else holds each one,
// which is what the delete page's warning is based on. Contributions are
// left out so a payroll upload doesn't invalidate a confirmation
export function personVersion(person: Person) {
  const state = person.sapIds.map((item) => [
    item.sapId,
    item.ownRows,
    item.blankRows,
    [...item.otherEmails].sort(),
  ]);
  return createHash("sha256")
    .update(JSON.stringify([person.email, state]))
    .digest("hex");
}

// Everything the person page shows, or null if no users row matches
export async function getPerson(
  ref: PersonRef,
  db: Transaction = prisma
): Promise<Person | null> {
  const rows = await db.$queryRaw<
    Array<{ FullName: string | null; SAPID: number | null }>
  >`SELECT FullName, SAPID FROM users WHERE ${personRows(ref)}`;
  if (rows.length === 0) {
    return null;
  }
  const email = "email" in ref ? ref.email : null;
  const sapIds = [
    ...new Set(rows.flatMap((row) => (row.SAPID === null ? [] : [row.SAPID]))),
  ].sort((a, b) => a - b);

  const [links, summaries] =
    sapIds.length === 0
      ? [[], []]
      : await Promise.all([
          db.$queryRaw<
            Array<{ SAPID: number; Email: string | null; UserRows: number }>
          >`
            SELECT SAPID,
              CASE WHEN ${noEmail} THEN NULL ELSE LOWER(LTRIM(RTRIM(Email))) END AS Email,
              COUNT(*) AS UserRows
            FROM users
            WHERE SAPID IN (${Prisma.join(sapIds)})
            GROUP BY SAPID,
              CASE WHEN ${noEmail} THEN NULL ELSE LOWER(LTRIM(RTRIM(Email))) END
          `,
          db.$queryRaw<
            Array<{
              SAPID: number;
              Contributions: number;
              Total: unknown;
              FirstPeriod: number | null;
              LastPeriod: number | null;
              Office: string | null;
            }>
          >`
            SELECT c.SAPID,
              COUNT(*) AS Contributions,
              SUM(c.Amount) AS Total,
              MIN(CASE WHEN c.ForPeriod <= ${MAX_PERIOD} THEN c.ForPeriod END) AS FirstPeriod,
              MAX(CASE WHEN c.ForPeriod <= ${MAX_PERIOD} THEN c.ForPeriod END) AS LastPeriod,
              -- Office of the latest contribution
              (SELECT TOP 1 LTRIM(RTRIM(o.OfficeName)) FROM contributions l
                LEFT JOIN offices o ON o.ID = l.OfficeID
                WHERE l.SAPID = c.SAPID
                ORDER BY l.ForPeriod DESC) AS Office
            FROM contributions c
            WHERE c.SAPID IN (${Prisma.join(sapIds)})
            GROUP BY c.SAPID
          `,
        ]);

  return {
    ref,
    email,
    fullName: rows.find((row) => row.FullName?.trim())?.FullName?.trim() ?? null,
    sapIds: sapIds.map((sapId) => {
      const forSapId = links.filter((link) => link.SAPID === sapId);
      const summary = summaries.find((row) => row.SAPID === sapId);
      const rowsWith = (value: string | null) =>
        Number(forSapId.find((link) => link.Email === value)?.UserRows ?? 0);
      return {
        sapId,
        contributions: Number(summary?.Contributions ?? 0),
        // SQL Server money columns can arrive as non-numbers
        total: Number(summary?.Total ?? 0),
        firstPeriod: summary?.FirstPeriod ?? null,
        lastPeriod: summary?.LastPeriod ?? null,
        office: summary?.Office ?? null,
        ownRows: rowsWith(email),
        blankRows: email ? rowsWith(null) : 0,
        otherEmails: forSapId.flatMap((link) =>
          link.Email && link.Email !== email ? [link.Email] : []
        ),
      };
    }),
  };
}

export async function getSapIdRecord(sapId: number): Promise<SapIdRecord> {
  const [users, [summary]] = await Promise.all([
    prisma.$queryRaw<SapIdRecord["users"]>`
      SELECT LTRIM(RTRIM(FullName)) AS FullName, LTRIM(RTRIM(Email)) AS Email
      FROM users
      WHERE SAPID = ${sapId}
      ORDER BY CASE WHEN Email IS NULL THEN 1 ELSE 0 END
    `,
    prisma.$queryRaw<
      Array<{
        Contributions: number;
        Total: unknown;
        FirstPeriod: number | null;
        LastPeriod: number | null;
        Office: string | null;
      }>
    >`
      SELECT
        COUNT(*) AS Contributions,
        SUM(c.Amount) AS Total,
        MIN(CASE WHEN c.ForPeriod <= ${MAX_PERIOD} THEN c.ForPeriod END) AS FirstPeriod,
        MAX(CASE WHEN c.ForPeriod <= ${MAX_PERIOD} THEN c.ForPeriod END) AS LastPeriod,
        -- Office of the latest contribution
        (SELECT TOP 1 LTRIM(RTRIM(o.OfficeName)) FROM contributions l
          LEFT JOIN offices o ON o.ID = l.OfficeID
          WHERE l.SAPID = ${sapId}
          ORDER BY l.ForPeriod DESC) AS Office
      FROM contributions c
      WHERE c.SAPID = ${sapId}
    `,
  ]);

  return {
    sapId,
    users,
    contributions: Number(summary.Contributions ?? 0),
    // SQL Server money columns can arrive as non-numbers
    total: Number(summary.Total ?? 0),
    firstPeriod: summary.FirstPeriod,
    lastPeriod: summary.LastPeriod,
    office: summary.Office,
  };
}


type Transaction = Prisma.TransactionClient;

async function rejectAdminEmail(tx: Transaction, email: string | null) {
  if (!email) {
    return;
  }
  const [admin] = await tx.$queryRaw<Array<{ ID: number }>>`
    SELECT TOP 1 ID FROM adminUsers
    WHERE LOWER(LTRIM(RTRIM(Email))) = ${email}
  `;
  if (admin) {
    throw new UserChangeRejectedError(
      `${email} is an admin email. Admins sign in to the admin pages and never see a statement, so it can't be a pensioner's email.`
    );
  }
}

// Other SAP IDs the email opens, besides this one (-1 for all of them)
async function otherSapIdsFor(
  tx: Transaction,
  email: string | null,
  sapId: number
) {
  if (!email) {
    return [];
  }
  const rows = await tx.$queryRaw<Array<{ SAPID: number }>>`
    SELECT DISTINCT SAPID FROM users
    WHERE LOWER(LTRIM(RTRIM(Email))) = ${email}
      AND SAPID IS NOT NULL AND SAPID <> ${sapId}
    ORDER BY SAPID
  `;
  return rows.map((row) => row.SAPID);
}

// Locks a SAP ID's rows (and the gap where a new one would go) until commit,
// so two admins can't change the same person at once
function lockSapId(tx: Transaction, sapId: number) {
  return tx.$queryRaw<
    Array<{ FullName: string | null; Email: string | null }>
  >`
    SELECT FullName, Email FROM users WITH (UPDLOCK, HOLDLOCK)
    WHERE SAPID = ${sapId}
  `;
}

export type AddUserResult = {
  sapId: number;
  fullName: string;
  email: string | null;
  // "added" is a new users row; "emailAdded" filled in the email on the SAP
  // ID's existing row, which had none
  outcome: "added" | "emailAdded";
  // Other SAP IDs the email already opened; it now opens these too
  otherSapIds: number[];
};

// Adds a SAP ID, or fills in its missing email, inside the caller's
// transaction
async function addUserInTransaction(
  tx: Transaction,
  { sapId, fullName, email }: UserFields
): Promise<AddUserResult> {
  const existing = await lockSapId(tx, sapId);
  const existingEmails = [
    ...new Set(existing.map((row) => normalise(row.Email)).filter(Boolean)),
  ] as string[];

  if (email && existingEmails.includes(email)) {
    throw new UserChangeRejectedError(
      `SAP ID ${sapId} is already registered with ${email}.`
    );
  }
  if (existingEmails.length > 0) {
    throw new UserChangeRejectedError(
      `SAP ID ${sapId} is already registered with ${existingEmails.join(
        ", "
      )}. Edit that user instead of adding another.`
    );
  }
  if (existing.length > 0 && !email) {
    throw new UserChangeRejectedError(
      `SAP ID ${sapId} is already in the users table. Enter an email to let them sign in.`
    );
  }
  await rejectAdminEmail(tx, email);
  const otherSapIds = await otherSapIdsFor(tx, email, sapId);

  if (existing.length > 0) {
    // Fill in the existing row rather than adding a duplicate SAP ID. Only
    // one row if there are already duplicates; the name is kept if it has one
    await tx.$executeRaw`
      UPDATE TOP (1) users
      SET Email = ${email},
        FullName = CASE WHEN LTRIM(RTRIM(ISNULL(FullName, ''))) = ''
          THEN ${fullName} ELSE FullName END
      WHERE SAPID = ${sapId} AND LTRIM(RTRIM(ISNULL(Email, ''))) = ''
    `;
    const kept = existing.find((row) => row.FullName?.trim())?.FullName;
    return {
      sapId,
      fullName: kept?.trim() || fullName,
      email,
      outcome: "emailAdded" as const,
      otherSapIds,
    };
  }

  await tx.$executeRaw`
    INSERT INTO users (PensionID, FullName, Email, SAPID)
    VALUES (${PLACEHOLDER_PENSION_ID}, ${fullName}, ${email}, ${sapId})
  `;
  return { sapId, fullName, email, outcome: "added" as const, otherSapIds };
}

// There is no history table for users; the server log records who did it
function logAdded(result: AddUserResult, addedBy: string) {
  console.info(
    `users: ${addedBy} ${
      result.outcome === "added" ? "added" : "set the email on"
    } SAP ID ${result.sapId} (${result.email ?? "no email"})`
  );
}

export async function addUser(
  fields: UserFields,
  addedBy: string
): Promise<AddUserResult> {
  const result = await prisma.$transaction((tx) =>
    addUserInTransaction(tx, fields)
  );
  logAdded(result, addedBy);
  return result;
}

const describe = (ref: PersonRef) =>
  "email" in ref ? ref.email : `SAP ID ${ref.sapId} (no email)`;

// Changes a person's name and email on all of their rows. Returns where the
// person is now: null if clearing the email split them into several SAP IDs
export async function updatePerson(
  ref: PersonRef,
  { fullName, email }: Omit<UserFields, "sapId">,
  updatedBy: string
): Promise<{ ref: PersonRef | null; merged: number[]; removedDuplicates: number }> {
  const result = await prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<Array<{ SAPID: number | null }>>`
      SELECT SAPID FROM users WITH (UPDLOCK, HOLDLOCK) WHERE ${personRows(ref)}
    `;
    if (rows.length === 0) {
      throw new UserChangeRejectedError(
        "Someone changed or deleted this user since you opened the page. Go back to Users and open them again."
      );
    }
    const sapIds = [
      ...new Set(rows.flatMap((row) => (row.SAPID === null ? [] : [row.SAPID]))),
    ];
    const currentEmail = "email" in ref ? ref.email : null;

    if (email && email !== currentEmail) {
      await rejectAdminEmail(tx, email);
    }

    if ("email" in ref) {
      if (email && email !== ref.email) {
        const taken = await otherSapIdsFor(tx, email, -1);
        if (taken.length > 0) {
          throw new UserChangeRejectedError(
            `${email} already opens SAP ID ${taken.join(", ")}. If it's the same person, add these SAP IDs there instead.`
          );
        }
      }
      await tx.$executeRaw`
        UPDATE users SET FullName = ${fullName}, Email = ${email}
        WHERE ${emailIs(ref.email)}
      `;
      const next: PersonRef | null = email
        ? { email }
        : sapIds.length === 1
        ? { sapId: sapIds[0] }
        : null;
      return { ref: next, merged: [], removedDuplicates: 0 };
    }

    // A SAP ID without an email
    if (!email) {
      await tx.$executeRaw`
        UPDATE users SET FullName = ${fullName} WHERE ${personRows(ref)}
      `;
      return { ref, merged: [], removedDuplicates: 0 };
    }
    const registered = await tx.$queryRaw<Array<{ Email: string }>>`
      SELECT DISTINCT LOWER(LTRIM(RTRIM(Email))) AS Email FROM users
      WHERE SAPID = ${ref.sapId} AND NOT (${noEmail})
    `;
    if (registered.length > 0) {
      throw new UserChangeRejectedError(
        `SAP ID ${ref.sapId} is already registered with ${registered
          .map((row) => row.Email)
          .join(", ")}, so these rows without an email are duplicates. Open that user and use Remove duplicates.`
      );
    }
    // The email may already open other SAP IDs: this one joins them
    const merged = await otherSapIdsFor(tx, email, ref.sapId);
    await tx.$executeRaw`
      UPDATE TOP (1) users SET FullName = ${fullName}, Email = ${email}
      WHERE ${personRows(ref)}
    `;
    // Any further rows were duplicates of the one that now has the email
    const removedDuplicates = await tx.$executeRaw`
      DELETE FROM users WHERE ${personRows(ref)}
    `;
    return { ref: { email }, merged, removedDuplicates };
  });

  console.info(
    `users: ${updatedBy} changed ${describe(ref)} to "${fullName}" (${
      email ?? "no email"
    })`
  );
  return result;
}

// Adds a SAP ID to everyone signing in with an email
export async function addSapIdToPerson(
  email: string,
  sapId: number,
  addedBy: string
) {
  const result = await prisma.$transaction(async (tx) => {
    // The email must still be someone's when the SAP ID is added: a page
    // opened before another admin changed or cleared the email mustn't give
    // the old address access again. Locked until commit so it can't change
    // in between
    const rows = await tx.$queryRaw<Array<{ FullName: string | null }>>`
      SELECT LTRIM(RTRIM(FullName)) AS FullName FROM users WITH (UPDLOCK, HOLDLOCK)
      WHERE ${emailIs(email)}
    `;
    if (rows.length === 0) {
      throw new UserChangeRejectedError(
        `No one signs in with ${email} any more; someone changed or removed the email since you opened the page. Nothing was added. Go back to Users and open the person again.`
      );
    }
    const fullName = rows.find((row) => row.FullName)?.FullName ?? email;
    return addUserInTransaction(tx, { sapId, fullName, email });
  });
  logAdded(result, addedBy);
  return result;
}

// Stops an email opening a SAP ID. The SAP ID stays in the users table: if
// it has no other row, its row is kept without an email, so its
// contributions stay on a statement
export async function removeSapIdFromPerson(
  email: string,
  sapId: number,
  removedBy: string
): Promise<{ keptWithoutEmail: boolean }> {
  const result = await prisma.$transaction(async (tx) => {
    const rows = await lockSapId(tx, sapId);
    const own = rows.filter((row) => normalise(row.Email) === email);
    if (own.length === 0) {
      throw new UserChangeRejectedError(
        `${email} doesn't open SAP ID ${sapId} any more. Someone may have changed it; reload the page.`
      );
    }
    if (rows.length > own.length) {
      await tx.$executeRaw`
        DELETE FROM users WHERE SAPID = ${sapId} AND ${emailIs(email)}
      `;
      return { keptWithoutEmail: false };
    }
    await tx.$executeRaw`
      UPDATE TOP (1) users SET Email = NULL
      WHERE SAPID = ${sapId} AND ${emailIs(email)}
    `;
    await tx.$executeRaw`
      DELETE FROM users WHERE SAPID = ${sapId} AND ${emailIs(email)}
    `;
    return { keptWithoutEmail: true };
  });

  console.info(
    `users: ${removedBy} removed SAP ID ${sapId} from ${email}${
      result.keptWithoutEmail ? " (kept without an email)" : ""
    }`
  );
  return result;
}

// Leaves one row for a person's SAP ID: deletes their extra rows and, for a
// person with an email, the SAP ID's rows without one. Rows with other
// emails belong to other people and are left alone
export async function removeDuplicateRows(
  ref: PersonRef,
  sapId: number,
  removedBy: string
): Promise<number> {
  const removed = await prisma.$transaction(async (tx) => {
    await lockSapId(tx, sapId);
    const own = Prisma.sql`SAPID = ${sapId} AND ${
      "email" in ref ? emailIs(ref.email) : noEmail
    }`;
    const [{ Rows }] = await tx.$queryRaw<Array<{ Rows: number }>>`
      SELECT COUNT(*) AS Rows FROM users WHERE ${own}
    `;
    if (Number(Rows) === 0) {
      throw new UserChangeRejectedError(
        `SAP ID ${sapId} isn't on this user any more. Someone may have changed it; reload the page.`
      );
    }
    let deleted = 0;
    if (Number(Rows) > 1) {
      deleted += await tx.$executeRaw`
        DELETE TOP (${Number(Rows) - 1}) FROM users WHERE ${own}
      `;
    }
    if ("email" in ref) {
      deleted += await tx.$executeRaw`
        DELETE FROM users WHERE SAPID = ${sapId} AND ${noEmail}
      `;
    }
    return deleted;
  });

  console.info(
    `users: ${removedBy} removed ${removed} duplicate rows of SAP ID ${sapId} for ${describe(ref)}`
  );
  return removed;
}

// Deletes all of a person's rows, provided they are still what the admin
// confirmed on the delete page (see personVersion)
export async function deletePerson(
  ref: PersonRef,
  confirmedVersion: string,
  deletedBy: string
) {
  const deleted = await prisma.$transaction(async (tx) => {
    // Lock the person's rows and every row of their SAP IDs, so neither who
    // they are nor who else holds their SAP IDs can change before the delete
    const rows = await tx.$queryRaw<Array<{ SAPID: number | null }>>`
      SELECT SAPID FROM users WITH (UPDLOCK, HOLDLOCK) WHERE ${personRows(ref)}
    `;
    const sapIds = [
      ...new Set(rows.flatMap((row) => (row.SAPID === null ? [] : [row.SAPID]))),
    ];
    if (sapIds.length > 0) {
      await tx.$queryRaw`
        SELECT 1 AS Locked FROM users WITH (UPDLOCK, HOLDLOCK)
        WHERE SAPID IN (${Prisma.join(sapIds)})
      `;
    }
    const current = rows.length === 0 ? null : await getPerson(ref, tx);
    if (!current) {
      throw new UserChangeRejectedError(
        "Someone deleted this user or changed their email since you opened the page. Nothing was deleted."
      );
    }
    if (personVersion(current) !== confirmedVersion) {
      throw new UserChangeRejectedError(
        "Someone changed this user's SAP IDs since you opened the page, so nothing was deleted. The page now shows them as they are; check it and confirm again."
      );
    }
    return tx.$executeRaw`DELETE FROM users WHERE ${personRows(ref)}`;
  });
  console.info(
    `users: ${deletedBy} deleted ${describe(ref)} (${deleted} rows)`
  );
  return deleted;
}
