import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { readSheet } from "read-excel-file/node";
import prisma from "./prisma";
import { MAX_PERIOD } from "./utils";

// Monthly contribution uploads from the payroll Excel file. Replaces the
// SSMS routine of importing into ContributionsStaging and running
// ProcessStagingContributions: rows are matched on SAP ID, FOR period,
// IN period and contribution type; matches get their amount and office
// updated, everything else is inserted.

export type UploadRow = {
  // Row number as shown in Excel (header is row 1)
  excelRow: number;
  SAPID: number;
  ForPeriod: number;
  InPeriod: number;
  ContributionTypeID: number;
  Amount: number;
  OfficeID: number;
};

type Column = keyof Omit<UploadRow, "excelRow">;

export type UploadIssue = {
  excelRow: number | null;
  message: string;
  // The row's cells as text, keyed by column, for showing the bad row
  raw?: Record<Column, string>;
};

export type PreviewRowStatus = "new" | "changed" | "unchanged" | "error";

// One row of the file as it will be imported
export type PreviewRow = {
  excelRow: number;
  status: PreviewRowStatus;
  SAPID: number;
  ForPeriod: number;
  InPeriod: number;
  ContributionTypeID: number;
  Amount: number;
  OfficeID: number;
  // Current values in the database, for changed rows
  OldAmount: number | null;
  OldOfficeID: number | null;
  // Whether the SAP ID has a users row, so the person can sign in
  inUsers: boolean;
};

// A SAP ID in the file with no row in users: the contributions are imported,
// but nobody can sign in to see them until the pension office adds the user
export type MissingUser = {
  SAPID: number;
  OfficeID: number;
};

export type UploadPreview = {
  fileName: string;
  // Identifies the exact file previewed, so the import can't run on a
  // different file than the one the admin reviewed
  fileHash: string;
  // Fingerprint of the existing contributions the file matches, so the
  // import can refuse if they changed after the admin reviewed the preview
  stateHash: string;
  rows: PreviewRow[];
  // Blocking problems: nothing is imported while there are any
  errors: UploadIssue[];
  counts: Record<PreviewRowStatus, number>;
  // Rows per IN period, e.g. [{ period: 202607, rows: 3265 }]
  inPeriods: Array<{ period: number; rows: number }>;
  missingUsers: MissingUser[];
  contributionTypes: Record<number, string>;
  offices: Record<number, string>;
};

export type UploadResult = {
  fileName: string;
  rowCount: number;
  inserted: number;
  // Rows in the table whose amount or office changed
  updated: number;
};

const MAX_FILE_BYTES = 10 * 1024 * 1024;

// Accepted header names, normalized (lowercase, letters and digits only).
// The payroll file's names come first, then the database column names.
const COLUMN_ALIASES: Record<Column, string[]> = {
  SAPID: ["employeenumber", "sapid"],
  ForPeriod: ["forperiod"],
  InPeriod: ["inperiod"],
  ContributionTypeID: ["contributionsid", "contributionid", "contributiontypeid"],
  Amount: ["amount"],
  OfficeID: ["officeid"],
};

const COLUMN_LABELS: Record<Column, string> = {
  SAPID: "Employee number",
  ForPeriod: "FOR-Period",
  InPeriod: "IN-Period",
  ContributionTypeID: "Contributions ID",
  Amount: "Amount",
  OfficeID: "Office ID",
};

const COLUMNS = Object.keys(COLUMN_ALIASES) as Column[];

// Legacy opening balance period for 2015-2017 arrears
const OPENING_PERIOD = 20152017;

function normalizeHeader(value: unknown): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function isValidPeriod(value: number): boolean {
  if (value === OPENING_PERIOD) {
    return true;
  }
  const year = Math.floor(value / 100);
  const month = value % 100;
  return value <= MAX_PERIOD && year >= 1990 && year <= 2100 && month >= 1 && month <= 12;
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value.trim().replace(/,/g, ""));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function rawCells(row: Record<Column, unknown>): Record<Column, string> {
  return Object.fromEntries(
    COLUMNS.map((column) => [column, String(row[column] ?? "")])
  ) as Record<Column, string>;
}

// Turns the sheet into rows, checking everything that doesn't need the
// database. Exported for testing.
export function parseContributionSheet(sheet: unknown[][]): {
  rows: UploadRow[];
  errors: UploadIssue[];
} {
  const errors: UploadIssue[] = [];
  const [header = [], ...body] = sheet;
  const headers = header.map(normalizeHeader);

  const columnIndex = {} as Record<Column, number>;
  for (const column of COLUMNS) {
    const index = headers.findIndex((name) =>
      COLUMN_ALIASES[column].includes(name)
    );
    if (index === -1) {
      errors.push({
        excelRow: 1,
        message: `Missing column "${COLUMN_LABELS[column]}"`,
      });
    }
    columnIndex[column] = index;
  }
  if (errors.length > 0) {
    return { rows: [], errors };
  }

  const rows: UploadRow[] = [];
  const seenKeys = new Map<string, number>();

  body.forEach((cells, index) => {
    const excelRow = index + 2;
    if (cells.every((cell) => cell === null || String(cell).trim() === "")) {
      return;
    }

    const cell = (column: Column) => cells[columnIndex[column]];
    const raw = rawCells(
      Object.fromEntries(COLUMNS.map((column) => [column, cell(column)])) as Record<Column, unknown>
    );
    const rowErrors: string[] = [];

    const integer = (column: Column) => {
      const number = toNumber(cell(column));
      if (number === null || !Number.isInteger(number) || number <= 0) {
        rowErrors.push(
          `${COLUMN_LABELS[column]} must be a whole number (got "${raw[column]}")`
        );
        return 0;
      }
      return number;
    };

    const SAPID = integer("SAPID");
    const ForPeriod = integer("ForPeriod");
    const InPeriod = integer("InPeriod");
    const ContributionTypeID = integer("ContributionTypeID");
    const OfficeID = integer("OfficeID");
    const amount = toNumber(cell("Amount"));

    for (const [column, period] of [
      ["ForPeriod", ForPeriod],
      ["InPeriod", InPeriod],
    ] as const) {
      if (period !== 0 && !isValidPeriod(period)) {
        rowErrors.push(`${COLUMN_LABELS[column]} ${period} is not a YYYYMM month`);
      }
    }
    if (amount === null) {
      rowErrors.push(`Amount must be a number (got "${raw.Amount}")`);
    }

    if (rowErrors.length > 0) {
      errors.push({ excelRow, message: rowErrors.join("; "), raw });
      return;
    }

    // The same key twice would leave it unclear which amount is right
    const key = `${SAPID}|${ForPeriod}|${InPeriod}|${ContributionTypeID}`;
    const firstRow = seenKeys.get(key);
    if (firstRow !== undefined) {
      errors.push({
        excelRow,
        message: `Duplicate of row ${firstRow} (same employee, periods and contribution type)`,
        raw,
      });
      return;
    }
    seenKeys.set(key, excelRow);

    rows.push({
      excelRow,
      SAPID,
      ForPeriod,
      InPeriod,
      ContributionTypeID,
      // Excel stores 2554.7 as 2554.6999999999998; amounts are in cents
      Amount: Math.round((amount as number) * 100) / 100,
      OfficeID,
    });
  });

  if (rows.length === 0 && errors.length === 0) {
    errors.push({ excelRow: null, message: "The file has no contribution rows" });
  }

  return { rows, errors };
}

// Loads the rows into a @upload table variable for the rest of the batch.
// Parsing the JSON once matters: joined directly, SQL Server guesses
// OPENJSON returns 50 rows and re-parses it for every contributions row.
// Queries on @upload need OPTION (RECOMPILE): otherwise SQL Server plans
// for a table variable of 1 row and scans contributions once per employee.
function declareUploadTable(rows: UploadRow[]) {
  // Compact JSON: one parameter instead of six per row
  const json = JSON.stringify(
    rows.map((row) => ({
      r: row.excelRow,
      s: row.SAPID,
      f: row.ForPeriod,
      i: row.InPeriod,
      t: row.ContributionTypeID,
      a: row.Amount,
      o: row.OfficeID,
    }))
  );
  return Prisma.sql`
    DECLARE @upload TABLE (
      r int, s int, f int, i int, t int, a money, o int,
      PRIMARY KEY (s, f, i, t)
    );
    INSERT INTO @upload (r, s, f, i, t, a, o)
    SELECT r, s, f, i, t, a, o FROM OPENJSON(${json}) WITH (
      r int '$.r', s int '$.s', f int '$.f', i int '$.i', t int '$.t',
      a money '$.a', o int '$.o'
    );
  `;
}

async function getLookups() {
  const [types, offices] = await Promise.all([
    prisma.$queryRaw<Array<{ ID: number; ContributionTypeName: string | null }>>`
      SELECT ID, ContributionTypeName FROM contributionTypes
    `,
    prisma.$queryRaw<Array<{ ID: number; OfficeName: string | null }>>`
      SELECT ID, OfficeName FROM offices
    `,
  ]);
  return {
    contributionTypes: Object.fromEntries(
      types.map((type) => [type.ID, type.ContributionTypeName?.trim() ?? `Type ${type.ID}`])
    ) as Record<number, string>,
    offices: Object.fromEntries(
      offices.map((office) => [office.ID, office.OfficeName?.trim() ?? `Office ${office.ID}`])
    ) as Record<number, string>,
  };
}

async function readUpload(file: File) {
  const lookups = await getLookups();
  const result = (fileHash: string, rows: UploadRow[], errors: UploadIssue[]) => ({
    fileHash,
    rows,
    errors: errors.sort((a, b) => (a.excelRow ?? 0) - (b.excelRow ?? 0)),
    ...lookups,
  });

  if (file.size > MAX_FILE_BYTES) {
    return result("", [], [{ excelRow: null, message: "The file is larger than 10 MB" }]);
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const fileHash = createHash("sha256").update(buffer).digest("hex");

  let sheet: unknown[][];
  try {
    sheet = await readSheet(buffer);
  } catch {
    return result(fileHash, [], [
      { excelRow: null, message: "Could not read the file. Upload an Excel .xlsx file." },
    ]);
  }

  const { rows, errors } = parseContributionSheet(sheet);

  // Checks against lookup tables
  const valid: UploadRow[] = [];
  for (const row of rows) {
    const rowErrors: string[] = [];
    if (!(row.ContributionTypeID in lookups.contributionTypes)) {
      rowErrors.push(`Contributions ID ${row.ContributionTypeID} is not a known contribution type`);
    }
    if (!(row.OfficeID in lookups.offices)) {
      rowErrors.push(`Office ID ${row.OfficeID} is not a known office`);
    }
    if (rowErrors.length > 0) {
      errors.push({ excelRow: row.excelRow, message: rowErrors.join("; "), raw: rawCells(row) });
    } else {
      valid.push(row);
    }
  }

  return result(fileHash, valid, errors);
}

type ExistingMatch = {
  // Excel row of the uploaded row with the same key
  r: number;
  ID: number;
  OldAmount: number;
  OldOfficeID: number | null;
};

// Existing contributions with the same key (SAP ID, FOR, IN, type) as each
// uploaded row. With `lock`, the rows read stay locked until the transaction
// ends, and so does the range scanned, so no matching row can be added,
// changed or deleted meanwhile. contributions has no index on the key, so
// this effectively locks the table for the length of the import.
async function findExistingMatches(
  client: Prisma.TransactionClient,
  rows: UploadRow[],
  { lock }: { lock: boolean }
): Promise<ExistingMatch[]> {
  if (rows.length === 0) {
    return [];
  }
  const hint = lock ? Prisma.sql`WITH (UPDLOCK, HOLDLOCK)` : Prisma.empty;
  return client.$queryRaw<ExistingMatch[]>`
    ${declareUploadTable(rows)}
    SELECT f.r, c.ID, c.Amount AS OldAmount, c.OfficeID AS OldOfficeID
    FROM @upload f
    INNER JOIN contributions c ${hint}
      ON c.SAPID = f.s AND c.ForPeriod = f.f AND c.InPeriod = f.i
      AND c.ContributionTypeID = f.t
    OPTION (RECOMPILE)
  `;
}

function existingStateHash(matches: ExistingMatch[]): string {
  const lines = matches
    .map(
      (match) =>
        `${match.r}|${match.ID}|${Number(match.OldAmount).toFixed(4)}|${match.OldOfficeID ?? ""}`
    )
    .sort();
  return createHash("sha256").update(lines.join("\n")).digest("hex");
}

// Uploaded rows whose key is already in the table more than once. Those
// are usually separate entries (e.g. an amount and a 0.00 correction) that
// statements add up, so updating them all to the uploaded amount would
// count it several times, and there's no telling which one to update.
function ambiguousMatches(matches: ExistingMatch[]): Map<number, ExistingMatch[]> {
  const byRow = new Map<number, ExistingMatch[]>();
  for (const match of matches) {
    byRow.set(match.r, [...(byRow.get(match.r) ?? []), match]);
  }
  return new Map([...byRow].filter(([, rowMatches]) => rowMatches.length > 1));
}

export async function previewContributionUpload(
  file: File
): Promise<UploadPreview> {
  const { fileHash, rows, errors, contributionTypes, offices } =
    await readUpload(file);

  let matches: ExistingMatch[] = [];
  let people: Array<{ SAPID: number; InUsers: number }> = [];

  if (rows.length > 0) {
    [matches, people] = await Promise.all([
      findExistingMatches(prisma, rows, { lock: false }),
      // Whether each SAP ID has a users row
      prisma.$queryRaw<typeof people>`
        ${declareUploadTable(rows)}
        -- Distinct SAP IDs, keyed, so each lookup below is a seek
        DECLARE @people TABLE (s int PRIMARY KEY);
        INSERT INTO @people (s) SELECT DISTINCT s FROM @upload;

        SELECT p.s AS SAPID,
          CASE WHEN EXISTS (SELECT 1 FROM users u WHERE u.SAPID = p.s)
            THEN 1 ELSE 0 END AS InUsers
        FROM @people p
        OPTION (RECOMPILE)
      `,
    ]);
  }

  const ambiguous = ambiguousMatches(matches);
  const matchByRow = new Map(matches.map((match) => [match.r, match]));
  const peopleBySapId = new Map(people.map((person) => [person.SAPID, person]));

  const previewRows: PreviewRow[] = [];
  for (const row of rows) {
    const duplicates = ambiguous.get(row.excelRow);
    if (duplicates) {
      errors.push({
        excelRow: row.excelRow,
        message:
          `Already in the database ${duplicates.length} times for this employee, ` +
          `periods and contribution type (amounts ${duplicates
            .map((match) => Number(match.OldAmount).toFixed(2))
            .join(", ")}). It's unclear which one to update; ` +
          `fix them in the database first.`,
        raw: rawCells(row),
      });
      continue;
    }

    const match = matchByRow.get(row.excelRow);
    const changed =
      match !== undefined &&
      (Number(match.OldAmount) !== row.Amount ||
        match.OldOfficeID !== row.OfficeID);
    previewRows.push({
      ...row,
      status: !match ? "new" : changed ? "changed" : "unchanged",
      OldAmount: changed ? Number(match.OldAmount) : null,
      OldOfficeID: changed ? match.OldOfficeID : null,
      inUsers: peopleBySapId.get(row.SAPID)?.InUsers === 1,
    });
  }
  errors.sort((a, b) => (a.excelRow ?? 0) - (b.excelRow ?? 0));

  // One entry per person, with the office of their first row in the file
  const missingUsers = new Map<number, MissingUser>();
  for (const row of previewRows) {
    if (!row.inUsers && !missingUsers.has(row.SAPID)) {
      missingUsers.set(row.SAPID, {
        SAPID: row.SAPID,
        OfficeID: row.OfficeID,
      });
    }
  }

  const inPeriodCounts = new Map<number, number>();
  for (const row of rows) {
    inPeriodCounts.set(row.InPeriod, (inPeriodCounts.get(row.InPeriod) ?? 0) + 1);
  }

  const count = (status: PreviewRowStatus) =>
    previewRows.filter((row) => row.status === status).length;

  return {
    fileName: file.name,
    fileHash,
    stateHash: existingStateHash(matches),
    rows: previewRows,
    errors,
    counts: {
      new: count("new"),
      changed: count("changed"),
      unchanged: count("unchanged"),
      // Header problems block the import but aren't data rows
      error: errors.filter((error) => error.raw).length,
    },
    inPeriods: [...inPeriodCounts]
      .map(([period, rows]) => ({ period, rows }))
      .sort((a, b) => a.period - b.period),
    missingUsers: [...missingUsers.values()].sort((a, b) => a.SAPID - b.SAPID),
    contributionTypes,
    offices,
  };
}

export class UploadRejectedError extends Error {}

// Imports the file in one transaction: either every row is applied or none.
// `expectedHash` and `expectedStateHash` come from the preview the admin
// confirmed; the import only runs if neither the file nor the matching
// contributions changed since.
export async function importContributionUpload(
  file: File,
  expectedHash: string,
  expectedStateHash: string
): Promise<UploadResult> {
  const { fileHash, rows, errors } = await readUpload(file);
  if (fileHash !== expectedHash) {
    throw new UploadRejectedError(
      "The file changed since it was previewed. Preview it again before importing."
    );
  }
  if (errors.length > 0) {
    throw new UploadRejectedError("The file has errors. Fix them and upload it again.");
  }

  const { updated, inserted } = await prisma.$transaction(
    async (tx) => {
      // One import at a time: two concurrent imports of the same file could
      // both pass the NOT EXISTS check and insert every row twice. The lock
      // is released when the transaction ends.
      const [lock] = await tx.$queryRaw<Array<{ result: number }>>`
        DECLARE @result int;
        EXEC @result = sp_getapplock
          @Resource = 'contribution-upload', @LockMode = 'Exclusive',
          @LockOwner = 'Transaction', @LockTimeout = 60000;
        SELECT @result AS result;
      `;
      if (lock.result < 0) {
        throw new UploadRejectedError(
          "Another contribution upload is still running. Try again in a minute."
        );
      }

      // Someone may have imported or edited these contributions since the
      // preview. Applying the file now would overwrite changes the admin
      // never saw.
      const matches = await findExistingMatches(tx, rows, { lock: true });
      if (existingStateHash(matches) !== expectedStateHash) {
        throw new UploadRejectedError(
          "Contributions in this file were changed in the database after the preview. " +
            "Preview the file again to see the current values before importing."
        );
      }
      if (ambiguousMatches(matches).size > 0) {
        throw new UploadRejectedError(
          "Some rows match more than one existing contribution. Preview the file to see which."
        );
      }

      const [counts] = await tx.$queryRaw<
        Array<{ updated: number; inserted: number }>
      >`
        ${declareUploadTable(rows)}

        UPDATE c SET c.Amount = f.a, c.OfficeID = f.o
        FROM contributions c
        INNER JOIN @upload f
          ON c.SAPID = f.s AND c.ForPeriod = f.f AND c.InPeriod = f.i
          AND c.ContributionTypeID = f.t
        WHERE c.Amount IS NULL OR c.Amount <> f.a
          OR c.OfficeID IS NULL OR c.OfficeID <> f.o
        OPTION (RECOMPILE);
        DECLARE @updated int = @@ROWCOUNT;

        INSERT INTO contributions (SAPID, Amount, ForPeriod, InPeriod, OfficeID, ContributionTypeID)
        SELECT f.s, f.a, f.f, f.i, f.o, f.t
        FROM @upload f
        WHERE NOT EXISTS (
          SELECT 1 FROM contributions c
          WHERE c.SAPID = f.s AND c.ForPeriod = f.f AND c.InPeriod = f.i
            AND c.ContributionTypeID = f.t
        )
        OPTION (RECOMPILE);
        DECLARE @inserted int = @@ROWCOUNT;

        SELECT @updated AS updated, @inserted AS inserted;
      `;
      return counts;
    },
    { timeout: 120_000 }
  );

  return { fileName: file.name, rowCount: rows.length, inserted, updated };
}
