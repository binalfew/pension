// Shared types and month logic for the system overview page

export type SystemOverview = {
  // Distinct SAP IDs in the users table, and how many have an email
  pensioners: number;
  pensionersWithEmail: number;
  admins: number;
  contributionRows: number;
  contributionTotal: number;
  interestTotal: number;
  // Latest payroll month (InPeriod) with contributions, YYYYMM
  latestPayrollMonth: number | null;
  // Contributions per payroll month, newest first; months with nothing
  // loaded are missing here and filled in by monthlySeries()
  payrollMonths: PayrollMonth[];
  // Latest month interest has been computed for, YYYYMM
  latestInterestMonth: number | null;
  latestInterestPeople: number;
};

export type PayrollMonth = {
  period: number;
  entries: number;
  people: number;
  total: number;
};

export type SeriesMonth = PayrollMonth & {
  // Nothing loaded for this payroll month
  missing: boolean;
  // Noticeably fewer people paid than the month before
  drop: boolean;
};

export const CHART_MONTHS = 24;

// A drop of more than this share of people from one month to the next is
// worth a look (a partial upload, or an office left out)
const DROP_SHARE = 0.2;

export function addMonths(period: number, months: number): number {
  const index = Math.floor(period / 100) * 12 + (period % 100) - 1 + months;
  return Math.floor(index / 12) * 100 + (index % 12) + 1;
}

export function monthsBetween(from: number, to: number): number {
  return (
    (Math.floor(to / 100) - Math.floor(from / 100)) * 12 +
    (to % 100) -
    (from % 100)
  );
}

// The last CHART_MONTHS payroll months up to the latest one, oldest first,
// with gaps filled in and flagged
export function monthlySeries(
  latest: number | null,
  months: PayrollMonth[]
): SeriesMonth[] {
  if (latest === null) {
    return [];
  }
  const byPeriod = new Map(months.map((month) => [month.period, month]));
  const series: SeriesMonth[] = [];
  for (let offset = CHART_MONTHS - 1; offset >= 0; offset--) {
    const period = addMonths(latest, -offset);
    const month = byPeriod.get(period);
    const previous = series[series.length - 1];
    series.push({
      period,
      entries: month?.entries ?? 0,
      people: month?.people ?? 0,
      total: month?.total ?? 0,
      missing: !month,
      drop:
        !!month &&
        !!previous &&
        !previous.missing &&
        month.people < previous.people * (1 - DROP_SHARE),
    });
  }
  return series;
}
