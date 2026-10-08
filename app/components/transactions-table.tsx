import { ChevronDown, ChevronLeft, ChevronRight, X } from "lucide-react";
import { Fragment, useMemo, useState } from "react";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import {
  getMonthRows,
  periodSortKey,
  type MonthRow,
} from "~/lib/statement-analysis";
import {
  cn,
  formatAmount,
  formatPeriod,
  OPENING_PERIOD_LABEL,
} from "~/lib/utils";
import type { ComputedInterest } from "~/types/computed-interest";
import type { ContributionView } from "~/types/contribution-view";

const PAGE_SIZE = 25;

// Year a row is for, with 0 for the 2015-2017 opening balance
function yearOf(row: MonthRow) {
  return Math.floor(periodSortKey(row.period) / 100);
}

function yearLabel(year: number) {
  return year === 0 ? OPENING_PERIOD_LABEL : String(year);
}

function FilterSelect({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="relative flex-1">
      <select
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-9 w-full min-w-28 appearance-none rounded-md border border-input bg-background pl-3 pr-9 text-sm text-foreground shadow-xs outline-none cursor-pointer focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
    </div>
  );
}

function Amount({ value, className }: { value: number; className?: string }) {
  return (
    <TableCell
      className={cn(
        "text-right tabular-nums",
        value < 0 && "text-destructive",
        className
      )}
    >
      {value === 0 ? (
        <span className="text-muted-foreground">—</span>
      ) : (
        `$${formatAmount(value)}`
      )}
    </TableCell>
  );
}

// The individual records behind a month
function MonthDetails({ row }: { row: MonthRow }) {
  return (
    <div className="space-y-1 py-1 text-sm">
      {row.records.map((record, index) => (
        <div
          key={index}
          className="grid grid-cols-[1fr_auto] gap-x-4 sm:grid-cols-[2fr_1fr_1fr_auto]"
        >
          <span className="font-medium">{record.ContributionTypeName}</span>
          <span className="hidden text-muted-foreground sm:block">
            Paid in {formatPeriod(record.InPeriod)}
          </span>
          <span className="hidden text-muted-foreground sm:block">
            {record.OfficeName ?? "No office recorded"}
          </span>
          <span
            className={cn(
              "text-right tabular-nums",
              record.Amount < 0 && "text-destructive"
            )}
          >
            ${formatAmount(record.Amount)}
          </span>
        </div>
      ))}
      {row.interest !== 0 && (
        <div className="grid grid-cols-[1fr_auto] gap-x-4">
          <span className="font-medium">Interest computed</span>
          <span
            className={cn(
              "text-right tabular-nums",
              row.interest < 0 && "text-destructive"
            )}
          >
            ${formatAmount(row.interest)}
          </span>
        </div>
      )}
    </div>
  );
}

export function TransactionsTable({
  contributions,
  computedInterests,
  showSapId,
}: {
  contributions: ContributionView[];
  computedInterests: ComputedInterest[];
  // Combined statements cover several SAP IDs, so show which one
  showSapId: boolean;
}) {
  const rows = useMemo(
    () => getMonthRows(contributions, computedInterests),
    [contributions, computedInterests]
  );
  const years = useMemo(
    () => [...new Set(rows.map(yearOf))].sort((a, b) => a - b),
    [rows]
  );
  // Only show columns that have something in them
  const showVoluntary = rows.some((row) => row.voluntary !== 0);
  const showOther = rows.some((row) => row.other !== 0);
  const columnCount =
    6 + (showSapId ? 1 : 0) + (showVoluntary ? 1 : 0) + (showOther ? 1 : 0);

  const [fromYear, setFromYear] = useState("");
  const [toYear, setToYear] = useState("");
  const [page, setPage] = useState(0);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const filtered = rows.filter((row) => {
    const year = yearOf(row);
    return (
      (fromYear === "" || year >= Number(fromYear)) &&
      (toYear === "" || year <= Number(toYear))
    );
  });
  const filteredTotal = filtered.reduce((sum, row) => sum + row.total, 0);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const pageRows = filtered.slice(
    currentPage * PAGE_SIZE,
    (currentPage + 1) * PAGE_SIZE
  );

  // Changing a filter goes back to the first page
  const filterChanged = (set: (value: string) => void) => (value: string) => {
    set(value);
    setPage(0);
  };
  const isFiltered = fromYear !== "" || toYear !== "";

  const toggle = (key: string) => {
    const next = new Set(expanded);
    if (!next.delete(key)) {
      next.add(key);
    }
    setExpanded(next);
  };

  return (
    <>
      <div className="flex flex-wrap items-center gap-x-10 gap-y-4 rounded-lg border bg-card px-6 py-4 shadow-sm">
        <div className="flex flex-1 basis-72 items-center gap-3">
          <span className="text-sm font-medium text-muted-foreground">
            Period
          </span>
          <FilterSelect
            label="From year"
            value={fromYear}
            onChange={filterChanged(setFromYear)}
          >
            <option value="">Earliest</option>
            {years.map((year) => (
              <option key={year} value={year}>
                {yearLabel(year)}
              </option>
            ))}
          </FilterSelect>
          <span className="text-sm text-muted-foreground">to</span>
          <FilterSelect
            label="To year"
            value={toYear}
            onChange={filterChanged(setToYear)}
          >
            <option value="">Latest</option>
            {years.map((year) => (
              <option key={year} value={year}>
                {yearLabel(year)}
              </option>
            ))}
          </FilterSelect>
        </div>
        {isFiltered && (
          <Button
            variant="ghost"
            size="sm"
            className="cursor-pointer"
            onClick={() => {
              setFromYear("");
              setToYear("");
              setPage(0);
            }}
          >
            <X />
            Clear filters
          </Button>
        )}
      </div>

      <Card>
        <CardHeader className="pb-4">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <CardTitle className="text-lg">Monthly Transactions</CardTitle>
            <span className="text-sm text-muted-foreground">
              {filtered.length} {filtered.length === 1 ? "month" : "months"} ·
              total{" "}
              <span className="font-semibold text-foreground">
                ${formatAmount(filteredTotal)}
              </span>
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            Select a month to see the individual payments.
          </p>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8" />
                {showSapId && <TableHead>SAP ID</TableHead>}
                <TableHead>Month</TableHead>
                <TableHead className="text-right">Employee</TableHead>
                <TableHead className="text-right">Employer</TableHead>
                {showVoluntary && (
                  <TableHead className="text-right">Voluntary</TableHead>
                )}
                {showOther && (
                  <TableHead
                    className="text-right"
                    title="Other accounts, such as arrears for 2015–2017"
                  >
                    Other
                  </TableHead>
                )}
                <TableHead className="text-right">Interest</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageRows.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={columnCount}
                    className="py-6 text-center text-muted-foreground"
                  >
                    No months match these filters.
                  </TableCell>
                </TableRow>
              )}
              {pageRows.map((row) => {
                const key = `${row.sapId}-${row.period}`;
                const isExpanded = expanded.has(key);
                return (
                  <Fragment key={key}>
                    <TableRow
                      onClick={() => toggle(key)}
                      aria-expanded={isExpanded}
                      className={cn(
                        "cursor-pointer",
                        isExpanded && "bg-muted/40 hover:bg-muted/40"
                      )}
                    >
                      <TableCell className="w-8 pr-0">
                        <ChevronRight
                          className={cn(
                            "size-4 text-muted-foreground transition-transform",
                            isExpanded && "rotate-90"
                          )}
                        />
                      </TableCell>
                      {showSapId && <TableCell>{row.sapId}</TableCell>}
                      <TableCell className="font-medium">
                        {formatPeriod(row.period)}
                      </TableCell>
                      <Amount value={row.employee} />
                      {row.missingEmployerShare ? (
                        <TableCell
                          className="text-right text-amber-600 dark:text-amber-400"
                          title="Employee contribution without an employer share"
                        >
                          Missing
                        </TableCell>
                      ) : (
                        <Amount value={row.employer} />
                      )}
                      {showVoluntary && <Amount value={row.voluntary} />}
                      {showOther && <Amount value={row.other} />}
                      <Amount value={row.interest} />
                      <Amount value={row.total} className="font-semibold" />
                    </TableRow>
                    {isExpanded && (
                      <TableRow className="bg-muted/20 hover:bg-muted/20">
                        <TableCell />
                        <TableCell colSpan={columnCount - 1}>
                          <MonthDetails row={row} />
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>

          {pageCount > 1 && (
            <div className="flex items-center justify-between gap-2 px-4 py-3 border-t text-sm">
              <span className="text-muted-foreground">
                Page {currentPage + 1} of {pageCount}
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="cursor-pointer"
                  disabled={currentPage === 0}
                  onClick={() => setPage(currentPage - 1)}
                >
                  <ChevronLeft />
                  Newer
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="cursor-pointer"
                  disabled={currentPage >= pageCount - 1}
                  onClick={() => setPage(currentPage + 1)}
                >
                  Older
                  <ChevronRight />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}
