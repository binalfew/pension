// Statement PDFs for many people at once, for the pension office to email to
// people who cannot sign in. A person is everyone sharing one email (one
// combined statement for all their SAP IDs), or a SAP ID with no email.
import { Prisma } from "@prisma/client";
import { Zip, ZipDeflate, ZipPassThrough } from "fflate";
import { csvField } from "./csv";
import {
  combinePensionStatements,
  generatePensionStatementsBySapIds,
} from "./db.server";
import { generatePensionStatementPDF } from "./pdf-generator.server";
import prisma from "./prisma";
import { MAX_PERIOD } from "./utils";

export const NO_OFFICE = "No office";

export type StatementPerson = {
  // "e:<email>" or "s:<SAP ID>"; what the download form sends back
  key: string;
  fullName: string | null;
  email: string | null;
  // Most recently active first
  sapIds: number[];
  // Office of the latest contribution of their most recently active SAP ID
  office: string;
  lastPeriod: number | null;
};

export type StatementFilter = {
  query: string;
  office: string;
  noEmailOnly: boolean;
};

// Offices to pick from, by name
export async function listOffices(): Promise<string[]> {
  const rows = await prisma.$queryRaw<Array<{ Name: string }>>`
    SELECT DISTINCT LTRIM(RTRIM(OfficeName)) AS Name FROM offices
    WHERE LTRIM(RTRIM(ISNULL(OfficeName, ''))) <> ''
    ORDER BY Name
  `;
  return [...rows.map((row) => row.Name), NO_OFFICE];
}

// The people matching a filter, or the people with the given keys
export async function findStatementPeople(
  find: { filter: StatementFilter } | { keys: string[] }
): Promise<StatementPerson[]> {
  // Checked against the person's office and email: those of their most
  // recently active SAP ID
  const personConditions = [Prisma.sql`1 = 1`];
  // Met when any of the person's SAP IDs matches
  let searchCondition = Prisma.sql`1 = 1`;
  // Same for all of a person's rows, so checked on each row
  let keyCondition = Prisma.sql`1 = 1`;
  if ("keys" in find) {
    // As JSON so any number of keys fits in one query parameter
    keyCondition = Prisma.sql`PersonKey IN (SELECT value FROM OPENJSON(${JSON.stringify(find.keys)}))`;
  } else {
    const { query, office, noEmailOnly } = find.filter;
    if (office === NO_OFFICE) {
      personConditions.push(Prisma.sql`Office IS NULL`);
    } else if (office) {
      personConditions.push(Prisma.sql`Office = ${office}`);
    }
    if (noEmailOnly) {
      personConditions.push(Prisma.sql`Email IS NULL`);
    }
    const term = query.trim();
    if (term) {
      // LIKE wildcards in what was typed are matched literally
      const pattern = `%${term.replace(/[[\]%_]/g, "[$&]")}%`;
      searchCondition = Prisma.sql`CAST(SAPID AS VARCHAR(20)) LIKE ${pattern}
        OR FullName LIKE ${pattern} OR Email LIKE ${pattern}`;
    }
  }

  const rows = await prisma.$queryRaw<
    Array<{
      PersonKey: string;
      SAPID: number;
      Email: string | null;
      FullName: string | null;
      Office: string | null;
      LastPeriod: number | null;
    }>
  >`
    WITH ids AS (
      SELECT SAPID, Email, FullName,
        COALESCE('e:' + Email, 's:' + CAST(SAPID AS VARCHAR(20))) AS PersonKey
      FROM (
        SELECT SAPID,
          MAX(CASE WHEN LTRIM(RTRIM(ISNULL(Email, ''))) <> ''
            THEN LOWER(LTRIM(RTRIM(Email))) END) AS Email,
          MAX(NULLIF(LTRIM(RTRIM(FullName)), '')) AS FullName
        FROM users
        WHERE SAPID IS NOT NULL
        GROUP BY SAPID
      ) u
    ),
    latest AS (
      SELECT c.SAPID, NULLIF(LTRIM(RTRIM(o.OfficeName)), '') AS Office,
        CASE WHEN c.ForPeriod <= ${MAX_PERIOD} THEN c.ForPeriod END AS LastPeriod,
        -- The legacy 2015-2017 opening balance only counts when there is
        -- nothing newer
        ROW_NUMBER() OVER (
          PARTITION BY c.SAPID
          ORDER BY CASE WHEN c.ForPeriod <= ${MAX_PERIOD} THEN 0 ELSE 1 END,
            c.ForPeriod DESC
        ) AS RowNumber
      FROM contributions c
      LEFT JOIN offices o ON o.ID = c.OfficeID
      WHERE c.SAPID IN (SELECT SAPID FROM ids)
    ),
    sap AS (
      SELECT i.PersonKey, i.SAPID, i.Email, i.FullName, l.Office, l.LastPeriod,
        -- 1 for the person's most recently active SAP ID, whose office is
        -- the person's office
        ROW_NUMBER() OVER (
          PARTITION BY i.PersonKey ORDER BY l.LastPeriod DESC, i.SAPID DESC
        ) AS PersonRank
      FROM ids i
      LEFT JOIN latest l ON l.SAPID = i.SAPID AND l.RowNumber = 1
    ),
    -- Flags spread to all of a person's rows, so everything is read once
    flagged AS (
      SELECT *,
        MAX(CASE WHEN PersonRank = 1 AND ${Prisma.join(personConditions, " AND ")}
          THEN 1 ELSE 0 END) OVER (PARTITION BY PersonKey) AS PersonMatches,
        MAX(CASE WHEN ${searchCondition} THEN 1 ELSE 0 END)
          OVER (PARTITION BY PersonKey) AS SearchMatches
      FROM sap
    )
    SELECT PersonKey, SAPID, Email, FullName, Office, LastPeriod FROM flagged
    WHERE PersonMatches = 1 AND SearchMatches = 1 AND ${keyCondition}
    ORDER BY PersonKey, PersonRank
  `;

  // Each person's rows come most recently active first
  const people = new Map<string, StatementPerson>();
  for (const row of rows) {
    const person = people.get(row.PersonKey);
    if (person) {
      person.sapIds.push(row.SAPID);
      person.fullName ??= row.FullName;
    } else {
      people.set(row.PersonKey, {
        key: row.PersonKey,
        fullName: row.FullName,
        email: row.Email,
        sapIds: [row.SAPID],
        office: row.Office ?? NO_OFFICE,
        lastPeriod: row.LastPeriod,
      });
    }
  }
  return [...people.values()].sort(
    (a, b) =>
      (a.fullName ?? "").localeCompare(b.fullName ?? "") ||
      a.sapIds[0] - b.sapIds[0]
  );
}

// Statements loaded per round of queries
const BATCH_SIZE = 100;

function pdfFileName(person: StatementPerson) {
  const name = (person.fullName ?? "No name")
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
  return `${name} - ${person.sapIds.join("-")}.pdf`;
}

// A ZIP of one statement PDF per person plus index.csv listing who is in it,
// streamed while it is built so a whole office doesn't hit the request
// timeout. Stops when the browser goes away.
export function statementsZipStream(
  people: StatementPerson[],
  signal: AbortSignal
): ReadableStream<Uint8Array> {
  return new ReadableStream({
    async start(controller) {
      const zip = new Zip((error, chunk, final) => {
        if (error) {
          controller.error(error);
          return;
        }
        controller.enqueue(chunk);
        if (final) {
          controller.close();
        }
      });

      try {
        const index: Array<Array<string | number | null>> = [];
        for (let start = 0; start < people.length; start += BATCH_SIZE) {
          if (signal.aborted) {
            zip.terminate();
            return;
          }
          const batch = people.slice(start, start + BATCH_SIZE);
          const statements = await generatePensionStatementsBySapIds(
            batch.flatMap((person) => person.sapIds)
          );
          for (const person of batch) {
            const parts = person.sapIds.flatMap((sapId) => {
              const statement = statements.get(sapId);
              return statement ? [statement] : [];
            });
            if (parts.length === 0) {
              continue;
            }
            const data =
              parts.length > 1 ? combinePensionStatements(parts) : parts[0];
            const fileName = pdfFileName(person);
            // PDFs are already compressed
            const file = new ZipPassThrough(fileName);
            zip.add(file);
            file.push(await generatePensionStatementPDF(data), true);
            index.push([
              person.fullName,
              person.email,
              person.sapIds.join(" "),
              person.office,
              Math.round(data.total.Balance * 100) / 100,
              fileName,
            ]);
          }
        }

        const csv = new ZipDeflate("index.csv");
        zip.add(csv);
        const lines = [
          ["Name", "Email", "SAP IDs", "Office", "Balance", "File"].join(","),
          ...index.map((row) => row.map(csvField).join(",")),
        ];
        // BOM so Excel reads names with accents correctly
        csv.push(new TextEncoder().encode(`﻿${lines.join("\r\n")}`), true);
        zip.end();
      } catch (error) {
        console.error("Error building statements ZIP:", error);
        zip.terminate();
        controller.error(error);
      }
    },
  });
}

