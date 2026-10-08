import type { User } from "~/types/user";
import {
  combinePensionStatements,
  generatePensionStatement,
  generatePensionStatementBySapId,
  getRelatedSapIds,
  resolveUserByEmail,
  type PensionStatementData,
} from "./db.server";

type ResolvedUser = NonNullable<Awaited<ReturnType<typeof resolveUserByEmail>>>;

export type StatementSelection =
  | {
      status: "ok";
      statementData: PensionStatementData;
      // Every SAP ID belonging to the person whose statement this is
      personSapIds: number[];
      // The pensioner record being viewed (pensioners only)
      account: User | null;
    }
  // An admin who hasn't picked a SAP ID yet
  | { status: "none" }
  | { status: "error"; httpStatus: number; message: string };

// Works out which statement a request may see, from the `sapId` and
// `view=combined` search params. Pensioners only ever get their own SAP IDs;
// admins can see anyone's.
export async function selectStatement(
  resolvedUser: ResolvedUser,
  searchParams: URLSearchParams,
  {
    // When a pensioner asks for a SAP ID that isn't theirs, show their own
    // statement instead of refusing
    fallbackToOwn,
  }: { fallbackToOwn: boolean }
): Promise<StatementSelection> {
  const selectedSapId = searchParams.get("sapId");
  const combined = searchParams.get("view") === "combined";

  if (resolvedUser.role === "Admin") {
    if (!selectedSapId) {
      return { status: "none" };
    }
    const sapId = parseInt(selectedSapId);
    if (isNaN(sapId)) {
      return { status: "error", httpStatus: 400, message: "Invalid SAP ID" };
    }

    // Other SAP IDs belonging to the same person
    const personSapIds = await getRelatedSapIds(sapId);
    const statementData =
      combined && personSapIds.length > 1
        ? combineFound(
            await Promise.all(personSapIds.map(generatePensionStatementBySapId))
          )
        : await generatePensionStatementBySapId(sapId);

    if (!statementData) {
      return {
        status: "error",
        httpStatus: 404,
        message: `Pension statement not found for the selected sap id ${sapId}`,
      };
    }
    return { status: "ok", statementData, personSapIds, account: null };
  }

  const ownAccounts = resolvedUser.accounts.filter((account) => account.SAPID);
  if (ownAccounts.length === 0) {
    return {
      status: "error",
      httpStatus: 404,
      message: "No pension data available",
    };
  }

  const requestedAccount = ownAccounts.find(
    (account) => String(account.SAPID) === selectedSapId
  );
  if (selectedSapId && !requestedAccount && !fallbackToOwn) {
    return { status: "error", httpStatus: 403, message: "Forbidden" };
  }
  const account = requestedAccount ?? ownAccounts[0];
  const personSapIds = ownAccounts.map((own) => own.SAPID as number);

  const statementData =
    combined && ownAccounts.length > 1
      ? combineFound(
          await Promise.all(ownAccounts.map(generatePensionStatement))
        )
      : await generatePensionStatement(account);

  if (!statementData) {
    return {
      status: "error",
      httpStatus: 404,
      message: "No pension data available",
    };
  }
  return { status: "ok", statementData, personSapIds, account };
}

function combineFound(
  parts: Array<PensionStatementData | null>
): PensionStatementData | null {
  const found = parts.filter(
    (part): part is PensionStatementData => part !== null
  );
  return found.length > 0 ? combinePensionStatements(found) : null;
}
