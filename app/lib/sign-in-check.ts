import { formatPeriod } from "./utils";

// What the database holds for one sign-in email, gathered by
// getSignInCheck() in db.server.ts
export type SignInCheck = {
  email: string;
  isAdmin: boolean;
  // Pensioner rows for the email, one per SAP ID, in the order the app uses
  // at sign-in (most recently active SAP ID first)
  accounts: Array<{ SAPID: number | null; FullName: string | null }>;
  // Details for each SAP ID in `accounts`, in the same order
  sapIds: SapIdCheck[];
  // Records that look like the same person under a slightly different email
  nearMatches: NearMatch[];
};

export type SapIdCheck = {
  SAPID: number;
  FullName: string | null;
  ContributionRows: number;
  // Rows the transactions table reads (ContributionView)
  ViewRows: number;
  FirstPeriod: number | null;
  LastPeriod: number | null;
  InterestRows: number;
  LatestInterest: number | null;
  Balance: number;
  // users rows for this SAP ID (more than 1 is a duplicate)
  UserRows: number;
  // Other emails this SAP ID is registered under, joined with " | "
  OtherEmails: string | null;
};

export type NearMatch = {
  Source: "Admin" | "Pensioner";
  Email: string | null;
  SAPID: number | null;
  FullName: string | null;
  // spaces: the same email stored with extra spaces, so sign-in misses it
  // email: a similar email, e.g. another domain
  // name: no email match, but the name matches the email's name parts
  Reason: "spaces" | "email" | "name";
};

export type CheckStatus = "ok" | "info" | "warning" | "error";

export type CheckStep = {
  title: string;
  status: CheckStatus;
  detail: string;
};

export type SignInDiagnosis = {
  status: CheckStatus;
  headline: string;
  steps: CheckStep[];
};

const severity: Record<CheckStatus, number> = {
  ok: 0,
  info: 1,
  warning: 2,
  error: 3,
};

function periodRange(sapId: SapIdCheck) {
  if (sapId.FirstPeriod === null || sapId.LastPeriod === null) {
    return "opening balance only";
  }
  return sapId.FirstPeriod === sapId.LastPeriod
    ? formatPeriod(sapId.FirstPeriod)
    : `${formatPeriod(sapId.FirstPeriod)} – ${formatPeriod(sapId.LastPeriod)}`;
}

function plural(count: number, word: string) {
  return `${count.toLocaleString()} ${word}${count === 1 ? "" : "s"}`;
}

// Walks the same chain as sign-in (email → role → SAP ID → contributions →
// interest) and says where it breaks
export function diagnoseSignIn(check: SignInCheck): SignInDiagnosis {
  const steps: CheckStep[] = [];
  const isPensioner = check.accounts.length > 0;
  const [opening, ...others] = check.sapIds;

  // 1. Is the email recognised, and as what?
  if (!check.isAdmin && !isPensioner) {
    steps.push({
      title: "Email recognised",
      status: "error",
      detail:
        "No admin or pensioner record uses this email. They can sign in with Microsoft but will see “No pension record found”." +
        (check.nearMatches.length > 0
          ? " See the similar records below: the record may be under another address."
          : ""),
    });
  } else if (check.isAdmin && isPensioner) {
    steps.push({
      title: "Email recognised",
      status: "warning",
      detail:
        "This email is both an admin and a pensioner. Admin wins: they land on the statement search, and see their own statement only by searching for their SAP ID.",
    });
  } else if (check.isAdmin) {
    steps.push({
      title: "Email recognised",
      status: "ok",
      detail: "Admin. They land on the statement search and can open anyone's statement.",
    });
  } else {
    steps.push({
      title: "Email recognised",
      status: "ok",
      detail: `Pensioner, with ${plural(check.accounts.length, "record")}.`,
    });
  }

  if (isPensioner) {
    // 2. Which SAP ID opens?
    if (!opening) {
      steps.push({
        title: "SAP ID",
        status: "error",
        detail:
          "The pensioner record has no SAP ID, so they see “No pension data available”. Set the SAP ID on their users row.",
      });
    } else {
      steps.push({
        title: "SAP ID",
        status: "ok",
        detail:
          others.length === 0
            ? `Opens SAP ID ${opening.SAPID}.`
            : `Opens SAP ID ${opening.SAPID} (the most recently active) and can switch between ${check.sapIds.length} SAP IDs or view them combined.`,
      });
    }

    // 3. Contributions for each SAP ID
    if (opening) {
      const problems: string[] = [];
      let status: CheckStatus = "ok";
      for (const sapId of check.sapIds) {
        const isOpening = sapId === opening;
        if (sapId.ContributionRows === 0) {
          problems.push(`SAP ID ${sapId.SAPID} has no contributions loaded.`);
          status = isOpening ? "error" : maxStatus(status, "warning");
        } else if (sapId.ViewRows === 0) {
          problems.push(
            `SAP ID ${sapId.SAPID} has contributions, but the transactions view returns none, so the monthly table is empty. Check the ContributionView definition.`
          );
          status = "error";
        }
      }
      steps.push({
        title: "Contributions",
        status,
        detail:
          problems.length > 0
            ? problems.join(" ")
            : check.sapIds
                .map(
                  (sapId) =>
                    `SAP ID ${sapId.SAPID}: ${plural(sapId.ContributionRows, "row")}, ${periodRange(sapId)}.`
                )
                .join(" "),
      });

      // 4. Interest for each SAP ID with contributions
      const interestNotes: string[] = [];
      let interestStatus: CheckStatus = "ok";
      for (const sapId of check.sapIds) {
        if (sapId.ContributionRows === 0) continue;
        if (sapId.InterestRows === 0 || sapId.LatestInterest === null) {
          interestNotes.push(`SAP ID ${sapId.SAPID} has no interest computed yet.`);
          interestStatus = maxStatus(interestStatus, "warning");
        } else if (
          sapId.LastPeriod !== null &&
          sapId.LatestInterest < sapId.LastPeriod
        ) {
          interestNotes.push(
            `SAP ID ${sapId.SAPID}: interest computed to ${formatPeriod(sapId.LatestInterest)}, contributions through ${formatPeriod(sapId.LastPeriod)}. The statement says so; this is normal until the interest job runs.`
          );
          interestStatus = maxStatus(interestStatus, "info");
        } else {
          interestNotes.push(
            `SAP ID ${sapId.SAPID}: computed to ${formatPeriod(sapId.LatestInterest)}.`
          );
        }
      }
      if (interestNotes.length > 0) {
        steps.push({
          title: "Interest",
          status: interestStatus,
          detail: interestNotes.join(" "),
        });
      }

      // 5. Records shared with other rows or other people
      const recordNotes: string[] = [];
      for (const sapId of check.sapIds) {
        if (sapId.UserRows > 1) {
          recordNotes.push(
            `SAP ID ${sapId.SAPID} has ${sapId.UserRows} users rows (listed on the Data quality page); merge them into one.`
          );
        }
        if (sapId.OtherEmails) {
          recordNotes.push(
            `SAP ID ${sapId.SAPID} is also registered to ${sapId.OtherEmails.split(" | ").join(", ")}, who can see this statement too. Check that's the same person.`
          );
        }
      }
      steps.push({
        title: "Records",
        status: recordNotes.length > 0 ? "warning" : "ok",
        detail:
          recordNotes.length > 0
            ? recordNotes.join(" ")
            : "No duplicate rows, and no SAP ID is shared with another email.",
      });
    }
  }

  if (check.nearMatches.some((match) => match.Reason === "spaces")) {
    steps.push({
      title: "Stored email",
      status: "error",
      detail:
        "A record has this email with extra spaces at the start, so sign-in doesn't find it. Remove the spaces from the Email column.",
    });
  }

  const status = steps.reduce<CheckStatus>(
    (worst, step) => maxStatus(worst, step.status),
    "ok"
  );
  return { status, headline: headline(check, status), steps };
}

function maxStatus(a: CheckStatus, b: CheckStatus): CheckStatus {
  return severity[b] > severity[a] ? b : a;
}

function headline(check: SignInCheck, status: CheckStatus) {
  if (!check.isAdmin && check.accounts.length === 0) {
    return "Not recognised: they can't see a statement";
  }
  if (check.isAdmin) {
    return status === "ok" || status === "info"
      ? "Signs in as an admin"
      : "Signs in as an admin, with things to check";
  }
  if (status === "error") {
    return "Can sign in, but can't see a complete statement";
  }
  if (status === "warning") {
    return "Can sign in and see their statement, with things to check";
  }
  return "Can sign in and see their statement";
}
