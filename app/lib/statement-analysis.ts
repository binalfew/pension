import type { ComputedInterest } from "~/types/computed-interest";
import type { ContributionView } from "~/types/contribution-view";
import { formatPeriod, isMonthPeriod, OPENING_PERIOD_LABEL } from "./utils";

const EMPLOYEE_ACCOUNT = "EMPLOYEE ACCOUNT";
const EMPLOYER_ACCOUNT = "EMPLOYER ACCOUNT";

// Sorts the legacy 2015-2017 opening balance before every real month
export function periodSortKey(period: number) {
  return isMonthPeriod(period) ? period : 0;
}

function nextMonth(period: number) {
  return period % 100 === 12
    ? (Math.floor(period / 100) + 1) * 100 + 1
    : period + 1;
}

export type AnnualSummaryRow = {
  // Calendar year, or 0 for the 2015-2017 opening balance
  year: number;
  label: string;
  employee: number;
  employer: number;
  voluntary: number;
  // Any other account, such as the 2015-2017 arrears
  other: number;
  interest: number;
  // Everything added during the year
  netChange: number;
  // Running totals at the end of the year
  contributionsToDate: number;
  interestToDate: number;
  closingBalance: number;
};

// One row per year, oldest first. Contributions count in the year they are
// for (ForPeriod), interest in the year it was computed for.
export function getAnnualSummary(
  contributions: ContributionView[],
  computedInterests: ComputedInterest[]
): AnnualSummaryRow[] {
  const rows = new Map<number, AnnualSummaryRow>();
  const rowFor = (year: number) => {
    let row = rows.get(year);
    if (!row) {
      row = {
        year,
        label: year === 0 ? OPENING_PERIOD_LABEL : String(year),
        employee: 0,
        employer: 0,
        voluntary: 0,
        other: 0,
        interest: 0,
        netChange: 0,
        contributionsToDate: 0,
        interestToDate: 0,
        closingBalance: 0,
      };
      rows.set(year, row);
    }
    return row;
  };

  for (const contribution of contributions) {
    const row = rowFor(Math.floor(periodSortKey(contribution.ForPeriod) / 100));
    const name = contribution.ContributionTypeName;
    if (name === EMPLOYEE_ACCOUNT) {
      row.employee += contribution.Amount;
    } else if (name === EMPLOYER_ACCOUNT) {
      row.employer += contribution.Amount;
    } else if (name.includes("VOLUNTARY")) {
      row.voluntary += contribution.Amount;
    } else {
      row.other += contribution.Amount;
    }
  }
  for (const interest of computedInterests) {
    rowFor(Math.floor(interest.YearMonth / 100)).interest += interest.Interest;
  }

  let contributionsToDate = 0;
  let interestToDate = 0;
  return [...rows.values()]
    .sort((a, b) => a.year - b.year)
    .map((row) => {
      const contributed =
        row.employee + row.employer + row.voluntary + row.other;
      contributionsToDate += contributed;
      interestToDate += row.interest;
      return {
        ...row,
        netChange: contributed + row.interest,
        contributionsToDate,
        interestToDate,
        closingBalance: contributionsToDate + interestToDate,
      };
    });
}

export type MonthlyBalance = {
  period: number;
  // Added during the month
  contributed: number;
  interest: number;
  // Running totals at the end of the month
  contributionsToDate: number;
  interestToDate: number;
  balance: number;
};

export type BalanceHistoryData = {
  // 2015-2017 arrears, counted before the first month
  opening: number;
  // Every month from the first to the last recorded one, oldest first
  months: MonthlyBalance[];
  // Last month interest has been computed for
  interestThrough: number | null;
};

// Month-by-month running balance. Contributions count in the month they are
// for (ForPeriod), interest in the month it was computed for.
export function getMonthlyBalances(
  contributions: ContributionView[],
  computedInterests: ComputedInterest[]
): BalanceHistoryData {
  let opening = 0;
  const contributedByMonth = new Map<number, number>();
  const interestByMonth = new Map<number, number>();
  for (const contribution of contributions) {
    const period = contribution.ForPeriod;
    if (isMonthPeriod(period)) {
      contributedByMonth.set(
        period,
        (contributedByMonth.get(period) ?? 0) + contribution.Amount
      );
    } else {
      opening += contribution.Amount;
    }
  }
  for (const interest of computedInterests) {
    interestByMonth.set(
      interest.YearMonth,
      (interestByMonth.get(interest.YearMonth) ?? 0) + interest.Interest
    );
  }

  const periods = [...contributedByMonth.keys(), ...interestByMonth.keys()];
  const interestThrough =
    interestByMonth.size > 0 ? Math.max(...interestByMonth.keys()) : null;
  if (periods.length === 0) {
    return { opening, months: [], interestThrough };
  }

  const months: MonthlyBalance[] = [];
  const last = Math.max(...periods);
  let contributionsToDate = opening;
  let interestToDate = 0;
  for (
    let period = Math.min(...periods);
    period <= last;
    period = nextMonth(period)
  ) {
    const contributed = contributedByMonth.get(period) ?? 0;
    const interest = interestByMonth.get(period) ?? 0;
    contributionsToDate += contributed;
    interestToDate += interest;
    months.push({
      period,
      contributed,
      interest,
      contributionsToDate,
      interestToDate,
      balance: contributionsToDate + interestToDate,
    });
  }
  return { opening, months, interestThrough };
}

export type ContributionGap = {
  sapId: number;
  // First and last affected month (YYYYMM)
  from: number;
  to: number;
  months: number;
  // "missing": no contribution at all. "no-employer-share": the employee
  // contributed but there is no matching employer contribution.
  kind: "missing" | "no-employer-share";
};

// Months between a SAP ID's first and last contribution that look
// incomplete, grouped into runs of consecutive months. Months after the
// last contribution are not flagged, since the person may have left.
export function findContributionGaps(
  contributions: ContributionView[]
): ContributionGap[] {
  // SAP ID -> month -> account names contributed to
  const bySapId = new Map<number, Map<number, Set<string>>>();
  for (const contribution of contributions) {
    if (!isMonthPeriod(contribution.ForPeriod)) {
      continue;
    }
    let months = bySapId.get(contribution.SAPID);
    if (!months) {
      months = new Map();
      bySapId.set(contribution.SAPID, months);
    }
    let accounts = months.get(contribution.ForPeriod);
    if (!accounts) {
      accounts = new Set();
      months.set(contribution.ForPeriod, accounts);
    }
    accounts.add(contribution.ContributionTypeName);
  }

  const gaps: ContributionGap[] = [];
  for (const [sapId, months] of bySapId) {
    const periods = [...months.keys()];
    const last = Math.max(...periods);
    let current: ContributionGap | null = null;

    for (
      let period = Math.min(...periods);
      period <= last;
      period = nextMonth(period)
    ) {
      const accounts = months.get(period);
      const kind: ContributionGap["kind"] | null = !accounts
        ? "missing"
        : accounts.has(EMPLOYEE_ACCOUNT) && !accounts.has(EMPLOYER_ACCOUNT)
        ? "no-employer-share"
        : null;

      if (current && current.kind === kind) {
        current.to = period;
        current.months += 1;
        continue;
      }
      if (current) {
        gaps.push(current);
      }
      current = kind
        ? { sapId, from: period, to: period, months: 1, kind }
        : null;
    }
    if (current) {
      gaps.push(current);
    }
  }

  // Most recent first
  return gaps.sort((a, b) => b.from - a.from || a.sapId - b.sapId);
}

export function formatPeriodRange(from: number, to: number) {
  return from === to
    ? formatPeriod(from)
    : `${formatPeriod(from)} – ${formatPeriod(to)}`;
}

// mailto: link to the pension office about a possible error, pre-filled with
// the details they need to look it up
export function discrepancyMailto({
  supportEmail,
  fullName,
  sapIds,
  period,
}: {
  supportEmail: string;
  fullName: string;
  sapIds: number[];
  // Description of the months in question, if any
  period?: string;
}) {
  const sapIdText = sapIds.join(", ");
  const subject = `Pension statement discrepancy – SAP ID ${sapIdText}`;
  const body = [
    "Hello,",
    "",
    "I would like to report a possible discrepancy in my pension statement.",
    "",
    `Name: ${fullName}`,
    `SAP ID: ${sapIdText}`,
    `Period: ${period ?? "(please specify)"}`,
    "",
    "Details:",
    "",
    "",
    "Thank you.",
  ].join("\n");
  return `mailto:${supportEmail}?subject=${encodeURIComponent(
    subject
  )}&body=${encodeURIComponent(body)}`;
}
