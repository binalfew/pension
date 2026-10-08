import { ChevronDown, ChevronLeft, ChevronRight, X } from "lucide-react";
import { useMemo, useState } from "react";
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
import { periodSortKey } from "~/lib/statement-analysis";
import {
  cn,
  formatAmount,
  formatPeriod,
  OPENING_PERIOD_LABEL,
} from "~/lib/utils";
import type { ContributionView } from "~/types/contribution-view";

const PAGE_SIZE = 25;

// Year a transaction is for, with 0 for the 2015-2017 opening balance
function yearOf(contribution: ContributionView) {
  return Math.floor(periodSortKey(contribution.ForPeriod) / 100);
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

export function TransactionsTable({
  contributions,
  showSapId,
}: {
  contributions: ContributionView[];
  // Combined statements cover several SAP IDs, so show which one
  showSapId: boolean;
}) {
  // Most recent first, with the 2015-2017 opening balance last
  const sorted = useMemo(
    () =>
      [...contributions].sort(
        (a, b) => periodSortKey(b.ForPeriod) - periodSortKey(a.ForPeriod)
      ),
    [contributions]
  );
  const years = useMemo(
    () => [...new Set(sorted.map(yearOf))].sort((a, b) => a - b),
    [sorted]
  );
  const accountNames = useMemo(
    () => [...new Set(sorted.map((row) => row.ContributionTypeName))].sort(),
    [sorted]
  );

  const [fromYear, setFromYear] = useState("");
  const [toYear, setToYear] = useState("");
  const [accountName, setAccountName] = useState("");
  const [page, setPage] = useState(0);

  const filtered = sorted.filter((contribution) => {
    const year = yearOf(contribution);
    return (
      (fromYear === "" || year >= Number(fromYear)) &&
      (toYear === "" || year <= Number(toYear)) &&
      (accountName === "" || contribution.ContributionTypeName === accountName)
    );
  });
  const filteredTotal = filtered.reduce((sum, row) => sum + row.Amount, 0);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const pageRows = filtered.slice(
    currentPage * PAGE_SIZE,
    (currentPage + 1) * PAGE_SIZE
  );

  // Changing a filter goes back to the first page
  const filterChanged =
    <T,>(set: (value: T) => void) =>
    (value: T) => {
      set(value);
      setPage(0);
    };
  const isFiltered = fromYear !== "" || toYear !== "" || accountName !== "";

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
        <div className="flex flex-1 basis-72 items-center gap-3">
          <span className="text-sm font-medium text-muted-foreground">
            Account
          </span>
          <FilterSelect
            label="Account"
            value={accountName}
            onChange={filterChanged(setAccountName)}
          >
            <option value="">All accounts</option>
            {accountNames.map((name) => (
              <option key={name} value={name}>
                {name}
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
              setAccountName("");
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
              {filtered.length}{" "}
              {filtered.length === 1 ? "transaction" : "transactions"} · total{" "}
              <span className="font-semibold text-foreground">
                ${formatAmount(filteredTotal)}
              </span>
            </span>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                {showSapId && <TableHead>SAP ID</TableHead>}
                <TableHead className="w-[15%]">For Period</TableHead>
                <TableHead className="w-[15%]">In Period</TableHead>
                <TableHead className="text-right w-[20%]">
                  Contribution (USD)
                </TableHead>
                <TableHead className="w-[15%]">Office</TableHead>
                <TableHead className="w-[35%]">Contribution Type</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageRows.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={showSapId ? 6 : 5}
                    className="py-6 text-center text-muted-foreground"
                  >
                    No transactions match these filters.
                  </TableCell>
                </TableRow>
              )}
              {pageRows.map((contribution, index) => (
                <TableRow
                  key={`${contribution.SAPID}-${contribution.ForPeriod}-${contribution.ContributionTypeName}-${index}`}
                  className={
                    contribution.ContributionTypeName === "EMPLOYER ACCOUNT"
                      ? "bg-blue-50/50 dark:bg-blue-950/20"
                      : ""
                  }
                >
                  {showSapId && <TableCell>{contribution.SAPID}</TableCell>}
                  <TableCell className="font-medium w-[15%]">
                    {formatPeriod(contribution.ForPeriod)}
                  </TableCell>
                  <TableCell className="w-[15%]">
                    {formatPeriod(contribution.InPeriod)}
                  </TableCell>
                  <TableCell
                    className={cn(
                      "text-right font-bold w-[20%]",
                      contribution.Amount < 0 && "text-destructive"
                    )}
                  >
                    ${formatAmount(contribution.Amount)}
                  </TableCell>
                  <TableCell className="w-[15%]">
                    {contribution.OfficeName ?? "—"}
                  </TableCell>
                  <TableCell className="font-medium w-[35%]">
                    {contribution.ContributionTypeName}
                  </TableCell>
                </TableRow>
              ))}
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
