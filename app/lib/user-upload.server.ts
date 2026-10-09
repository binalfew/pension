// Adding many users at once from an Excel or CSV file. Rows are judged by the
// same rules as the Add user form (findAddBlocker) and added by the same
// addUserInTransaction. The upload only ever adds: a row whose name or email
// differs from what its SAP ID already has is rejected rather than changed,
// since that would change whose statement it is or who can see it.
import { Prisma } from "@prisma/client";
import { createHash } from "node:crypto";
import { readSheet } from "read-excel-file/node";
import { parseCsv } from "./csv";
import prisma from "./prisma";
import {
  addBlockerMessage,
  addUserInTransaction,
  findAddBlocker,
  logAdded,
  normaliseEmail,
  parseSapId,
  personDetailsFrom,
  UserChangeRejectedError,
  type AddUserResult,
  type ExistingSapIdRow,
  type UserFields,
} from "./user-admin.server";
import { USER_UPLOAD_COLUMNS } from "./user-upload";

const MAX_FILE_BYTES = 5 * 1024 * 1024;
// Each row added is a few queries inside one transaction, which has to
// finish within IMPORT_TIMEOUT_MS
const MAX_ROWS = 500;
const IMPORT_TIMEOUT_MS = 120_000;

// "new" adds a users row; "emailAdded" fills in the email on the SAP ID's
// row, which has none; "unchanged" rows are already there and skipped
export type UserUploadStatus = "new" | "emailAdded" | "unchanged" | "error";

export type UserUploadRow = {
  // Row number as shown in Excel (header is row 1)
  excelRow: number;
  // As in the file, so rejected rows show what was there
  sapId: string;
  fullName: string;
  email: string;
  status: UserUploadStatus;
  // Why the row was rejected or skipped, or what else importing it does
  message: string | null;
};

export type UserUploadPreview = {
  fileName: string;
  // Identifies the exact file previewed, so the import can't run on a
  // different file than the one the admin reviewed
  fileHash: string;
  // Fingerprint of what each row will do, so the import can refuse if the
  // users table changed after the admin reviewed the preview
  outcomesHash: string;
  rows: UserUploadRow[];
  // Problems with the file as a whole, like a missing column
  fileErrors: string[];
  counts: Record<UserUploadStatus, number>;
};

export type UserUploadResult = {
  fileName: string;
  added: number;
  emailsAdded: number;
  skipped: number;
};

type Column = keyof typeof USER_UPLOAD_COLUMNS;

// Header names also accepted, normalized (lowercase, letters and digits only)
const OTHER_HEADERS: Record<Column, string[]> = {
  sapId: ["employeenumber"],
  fullName: ["name"],
  email: ["emailaddress"],
};

const COLUMNS = Object.keys(USER_UPLOAD_COLUMNS) as Column[];

function normalizeHeader(value: unknown): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

// The ' that the CSV downloads put before text Excel would run as a formula
// (see csv.ts)
function cellText(value: unknown) {
  return String(value ?? "")
    .trim()
    .replace(/^'(?=[=+\-@])/, "");
}

// Names match whatever their case and spacing
const sameName = (a: string, b: string) =>
  a.replace(/\s+/g, " ").trim().toLowerCase() ===
  b.replace(/\s+/g, " ").trim().toLowerCase();

type ParsedRow = {
  excelRow: number;
  raw: Record<Column, string>;
} & (
  | { fields: UserFields }
  | { error: string }
  // A repeat of an earlier row, word for word
  | { sameAsRow: number }
);

// Turns the sheet into rows, checking everything that doesn't need the
// database
function parseUserSheet(sheet: unknown[][]): {
  rows: ParsedRow[];
  fileErrors: string[];
} {
  const [header = [], ...body] = sheet;
  const headers = header.map(normalizeHeader);
  const columnIndex = {} as Record<Column, number>;
  const fileErrors: string[] = [];
  for (const column of COLUMNS) {
    const accepted = [
      normalizeHeader(USER_UPLOAD_COLUMNS[column]),
      ...OTHER_HEADERS[column],
    ];
    columnIndex[column] = headers.findIndex((name) => accepted.includes(name));
    if (columnIndex[column] === -1) {
      fileErrors.push(`Missing column "${USER_UPLOAD_COLUMNS[column]}"`);
    }
  }
  if (fileErrors.length > 0) {
    return { rows: [], fileErrors };
  }

  const rows: ParsedRow[] = [];
  const firstRowOf = new Map<
    number,
    { excelRow: number; raw: Record<Column, string> }
  >();
  body.forEach((cells, index) => {
    const excelRow = index + 2;
    const raw = Object.fromEntries(
      COLUMNS.map((column) => [column, cellText(cells[columnIndex[column]])])
    ) as Record<Column, string>;
    if (COLUMNS.every((column) => raw[column] === "")) {
      return;
    }

    const sapId = parseSapId(raw.sapId);
    if (sapId === null) {
      rows.push({
        excelRow,
        raw,
        error: `SAP ID must be a whole number (got "${raw.sapId}")`,
      });
      return;
    }
    const first = firstRowOf.get(sapId);
    if (first) {
      // A copy of the same row is harmless; anything else leaves it unclear
      // which row is right
      rows.push(
        sameName(first.raw.fullName, raw.fullName) &&
          normaliseEmail(first.raw.email) === normaliseEmail(raw.email)
          ? { excelRow, raw, sameAsRow: first.excelRow }
          : {
              excelRow,
              raw,
              error: `SAP ID ${sapId} is also on row ${first.excelRow} with a different name or email`,
            }
      );
      return;
    }
    firstRowOf.set(sapId, { excelRow, raw });

    const details = personDetailsFrom(raw.fullName, raw.email);
    rows.push(
      "error" in details
        ? { excelRow, raw, error: details.error }
        : { excelRow, raw, fields: { sapId, ...details.fields } }
    );
  });

  if (rows.length === 0) {
    fileErrors.push("The file has no user rows");
  } else if (rows.length > MAX_ROWS) {
    fileErrors.push(
      `The file has ${rows.length.toLocaleString()} rows; upload at most ${MAX_ROWS.toLocaleString()} at a time`
    );
  }
  return { rows, fileErrors };
}

type UsersLookup = {
  // The users rows of the file's SAP IDs
  bySapId: Map<number, ExistingSapIdRow[]>;
  // The SAP IDs each of the file's emails already opens
  sapIdsByEmail: Map<string, number[]>;
  adminEmails: Set<string>;
};

// What the users table holds for the file's SAP IDs and emails. With `lock`,
// those rows (and the gaps where new ones would go) stay locked until the
// transaction ends. The locks are update locks: other admins' changes to
// users wait for the import, but sign-ins and statements, which only read,
// don't
async function lookUpUsers(
  db: Prisma.TransactionClient,
  fields: UserFields[],
  { lock }: { lock: boolean }
): Promise<UsersLookup> {
  // One JSON parameter each rather than one per row: SQL Server takes at
  // most 2100 parameters
  const sapIds = JSON.stringify(fields.map((row) => row.sapId));
  const emails = JSON.stringify([
    ...new Set(fields.flatMap((row) => (row.email ? [row.email] : []))),
  ]);
  const hint = lock ? Prisma.sql`WITH (UPDLOCK, HOLDLOCK)` : Prisma.empty;
  const columns = Prisma.sql`
    SAPID, LTRIM(RTRIM(FullName)) AS FullName,
    CASE WHEN LTRIM(RTRIM(ISNULL(Email, ''))) = '' THEN NULL
      ELSE LOWER(LTRIM(RTRIM(Email))) END AS Email
  `;
  type UserRow = {
    SAPID: number | null;
    FullName: string | null;
    Email: string | null;
  };
  // Two queries rather than one with OR, so each can use an index on its
  // column if there is one, and lock only what it reads
  const [bySapIdRows, byEmailRows, admins] = await Promise.all([
    db.$queryRaw<UserRow[]>`
      SELECT ${columns} FROM users ${hint}
      WHERE SAPID IN (SELECT CAST(value AS int) FROM OPENJSON(${sapIds}))
    `,
    db.$queryRaw<UserRow[]>`
      SELECT ${columns} FROM users ${hint}
      WHERE LOWER(LTRIM(RTRIM(Email))) IN (SELECT value FROM OPENJSON(${emails}))
    `,
    db.$queryRaw<Array<{ Email: string }>>`
      SELECT DISTINCT LOWER(LTRIM(RTRIM(Email))) AS Email FROM adminUsers ${hint}
      WHERE LOWER(LTRIM(RTRIM(Email))) IN (SELECT value FROM OPENJSON(${emails}))
    `,
  ]);

  const bySapId: UsersLookup["bySapId"] = new Map();
  for (const user of bySapIdRows) {
    if (user.SAPID !== null) {
      const list = bySapId.get(user.SAPID) ?? [];
      list.push({ fullName: user.FullName || null, email: user.Email });
      bySapId.set(user.SAPID, list);
    }
  }
  const sapIdsByEmail: UsersLookup["sapIdsByEmail"] = new Map();
  for (const user of byEmailRows) {
    if (user.Email && user.SAPID !== null) {
      const list = sapIdsByEmail.get(user.Email) ?? [];
      if (!list.includes(user.SAPID)) {
        list.push(user.SAPID);
      }
      sapIdsByEmail.set(user.Email, list);
    }
  }
  return {
    bySapId,
    sapIdsByEmail,
    adminEmails: new Set(admins.map((admin) => admin.Email)),
  };
}

// What importing each row will do. The add rules are findAddBlocker's; the
// upload adds that a row must have the name its SAP ID already has
function classifyRows(rows: ParsedRow[], lookup: UsersLookup): UserUploadRow[] {
  // SAP IDs the file itself gives each email
  const fileSapIdsByEmail = new Map<string, number[]>();
  for (const row of rows) {
    if ("fields" in row && row.fields.email) {
      const list = fileSapIdsByEmail.get(row.fields.email) ?? [];
      list.push(row.fields.sapId);
      fileSapIdsByEmail.set(row.fields.email, list);
    }
  }

  return rows.map((row) => {
    const result = (status: UserUploadStatus, message: string | null) => ({
      excelRow: row.excelRow,
      sapId: row.raw.sapId,
      fullName: row.raw.fullName,
      email: row.raw.email,
      status,
      message,
    });
    if ("error" in row) {
      return result("error", row.error);
    }
    if ("sameAsRow" in row) {
      return result("unchanged", `Same as row ${row.sameAsRow}`);
    }

    const { sapId, fullName, email } = row.fields;
    const existing = lookup.bySapId.get(sapId) ?? [];
    const blocker = findAddBlocker(
      existing,
      email,
      email !== null && lookup.adminEmails.has(email)
    );
    // A different email is a change to the user, never a skip
    if (
      blocker?.reason === "adminEmail" ||
      (blocker?.reason === "otherEmail" && email)
    ) {
      return result("error", addBlockerMessage(sapId, email, blocker));
    }

    const names = existing.flatMap((user) =>
      user.fullName ? [user.fullName] : []
    );
    if (names.length > 0 && !names.some((name) => sameName(name, fullName))) {
      return result(
        "error",
        `SAP ID ${sapId} is registered as ${names[0]}. Use that name, or edit the user to change it.`
      );
    }

    switch (blocker?.reason) {
      case "sameEmail":
        return result("unchanged", `Already registered with ${email}`);
      case "otherEmail":
        return result(
          "unchanged",
          `Already registered with ${blocker.emails.join(", ")}`
        );
      case "noEmailGiven":
        return result("unchanged", "Already in the users table without an email");
    }

    const others = email
      ? [
          ...new Set([
            ...(lookup.sapIdsByEmail.get(email) ?? []),
            ...(fileSapIdsByEmail.get(email) ?? []),
          ]),
        ]
          .filter((other) => other !== sapId)
          .sort((a, b) => a - b)
      : [];
    return result(
      existing.length > 0 ? "emailAdded" : "new",
      others.length > 0
        ? `This email will also open SAP ID ${others.join(", ")}`
        : null
    );
  });
}

function outcomesHash(rows: UserUploadRow[]) {
  return createHash("sha256")
    .update(
      JSON.stringify(rows.map((row) => [row.excelRow, row.status, row.message]))
    )
    .digest("hex");
}

const unreadable = (fileHash: string, message: string) => ({
  fileHash,
  rows: [],
  fileErrors: [message],
});

async function readUpload(file: File) {
  if (file.size > MAX_FILE_BYTES) {
    return unreadable("", "The file is larger than 5 MB");
  }
  const buffer = Buffer.from(await file.arrayBuffer());
  const fileHash = createHash("sha256").update(buffer).digest("hex");

  // .xlsx files are zip archives, which start with PK; old .xls files start
  // with D0 CF 11 E0
  const signature = buffer.subarray(0, 4).toString("hex");
  if (signature === "d0cf11e0") {
    return unreadable(
      fileHash,
      "This is an old Excel .xls file. Open it in Excel and save it as .xlsx or CSV."
    );
  }
  let sheet: unknown[][];
  if (signature.startsWith("504b")) {
    try {
      sheet = await readSheet(buffer);
    } catch {
      return unreadable(
        fileHash,
        "Could not read the file. Upload an Excel .xlsx or a CSV file."
      );
    }
  } else {
    const text = buffer.toString("utf8");
    // Text files have no NUL characters; anything else isn't a CSV
    if (text.includes("\u0000")) {
      return unreadable(
        fileHash,
        "Could not read the file. Upload an Excel .xlsx or a CSV file."
      );
    }
    sheet = parseCsv(text);
  }
  return { fileHash, ...parseUserSheet(sheet) };
}

const validFields = (rows: ParsedRow[]) =>
  rows.flatMap((row) => ("fields" in row ? [row.fields] : []));

export async function previewUserUpload(file: File): Promise<UserUploadPreview> {
  const { fileHash, rows, fileErrors } = await readUpload(file);
  const classified =
    fileErrors.length > 0
      ? []
      : classifyRows(
          rows,
          await lookUpUsers(prisma, validFields(rows), { lock: false })
        );
  const counts: Record<UserUploadStatus, number> = {
    new: 0,
    emailAdded: 0,
    unchanged: 0,
    error: 0,
  };
  for (const row of classified) {
    counts[row.status]++;
  }
  return {
    fileName: file.name,
    fileHash,
    outcomesHash: outcomesHash(classified),
    rows: classified,
    fileErrors,
    counts,
  };
}

// Prisma's error for a transaction that ran past its timeout, which rolls
// it back
const isTransactionTimeout = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError &&
  error.code === "P2028";

// Adds every new user and missing email in the file in one transaction:
// either all of them or none. Refused if the file or what it would do
// changed since the preview
export async function importUserUpload(
  file: File,
  previewedFileHash: string,
  previewedOutcomesHash: string,
  importedBy: string
): Promise<UserUploadResult> {
  const { fileHash, rows, fileErrors } = await readUpload(file);
  if (fileHash !== previewedFileHash) {
    throw new UserChangeRejectedError(
      "The file is not the one you previewed. Preview it again before importing."
    );
  }
  if (fileErrors.length > 0) {
    throw new UserChangeRejectedError(fileErrors.join(". "));
  }

  let results: AddUserResult[];
  try {
    results = await prisma.$transaction(
      async (tx) => {
        const classified = classifyRows(
          rows,
          await lookUpUsers(tx, validFields(rows), { lock: true })
        );
        if (outcomesHash(classified) !== previewedOutcomesHash) {
          throw new UserChangeRejectedError(
            "The users table changed since the preview, so nothing was imported. Preview the file again to see what it will do now."
          );
        }
        if (classified.some((row) => row.status === "error")) {
          throw new UserChangeRejectedError(
            "Fix the rows with errors and upload the file again. Nothing was imported."
          );
        }
        const toAdd = new Set(
          classified
            .filter((row) => row.status === "new" || row.status === "emailAdded")
            .map((row) => row.excelRow)
        );
        const added: AddUserResult[] = [];
        for (const row of rows) {
          if ("fields" in row && toAdd.has(row.excelRow)) {
            added.push(await addUserInTransaction(tx, row.fields));
          }
        }
        return added;
      },
      { timeout: IMPORT_TIMEOUT_MS }
    );
  } catch (error) {
    if (isTransactionTimeout(error)) {
      throw new UserChangeRejectedError(
        "The import took too long and was undone, so nothing was saved. Split the file into smaller files and upload them one at a time."
      );
    }
    throw error;
  }

  for (const result of results) {
    logAdded(result, importedBy);
  }
  const added = results.filter((result) => result.outcome === "added").length;
  return {
    fileName: file.name,
    added,
    emailsAdded: results.length - added,
    skipped: rows.length - results.length,
  };
}
