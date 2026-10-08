import { Calculator, Table2, TriangleAlert } from "lucide-react";
import { useState, type ComponentProps } from "react";
import { tableBodyClass, tableHeaderClass } from "~/components/table-styles";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { projectBalance, type Projection } from "~/lib/statement-analysis";
import { cn, formatAmount } from "~/lib/utils";

const MAX_YEARS_AHEAD = 50;
const MAX_RATE = 25;

// Parses a number input, or null while it is blank or invalid
function toNumber(value: string) {
  const number = Number(value);
  return value.trim() !== "" && Number.isFinite(number) ? number : null;
}

function Field({
  id,
  label,
  hint,
  value,
  onChange,
  ...props
}: {
  id: string;
  label: string;
  // Where the pre-filled figure comes from
  hint?: string;
  value: string;
  onChange: (value: string) => void;
} & Omit<ComponentProps<typeof Input>, "id" | "value" | "onChange">) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="number"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-describedby={hint ? `${id}-hint` : undefined}
        {...props}
      />
      {hint && (
        <p id={`${id}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
    </div>
  );
}

function Figure({
  label,
  value,
  highlight,
}: {
  label: string;
  value: number;
  highlight?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border px-4 py-3",
        highlight ? "border-primary/30 bg-primary/5" : "bg-muted/30"
      )}
    >
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div
        className={cn(
          "mt-1 text-lg font-semibold tabular-nums",
          highlight && "text-primary"
        )}
      >
        ${formatAmount(value)}
      </div>
    </div>
  );
}

export const PROJECTION_YEARS_DEFAULT = 10;

// Keeps a typed figure from going negative
function nonNegative(value: string) {
  return Number(value) < 0 ? "0" : value;
}

function YearTable({ projection }: { projection: Projection }) {
  return (
    <Table>
      <TableHeader className={tableHeaderClass}>
        <TableRow>
          <TableHead>Year</TableHead>
          <TableHead className="text-right">Contributions</TableHead>
          <TableHead className="text-right">Interest</TableHead>
          <TableHead className="text-right">Balance at year end</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody className={cn(tableBodyClass, "tabular-nums")}>
        {projection.years.map((row) => (
          <TableRow key={row.year}>
            <TableCell className="font-medium">{row.year}</TableCell>
            <TableCell className="text-right">
              ${formatAmount(row.contributions)}
            </TableCell>
            <TableCell className="text-right">
              ${formatAmount(row.interest)}
            </TableCell>
            <TableCell className="text-right font-medium">
              ${formatAmount(row.closingBalance)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

// What-if estimate of a future balance, projected from the current month.
// Pre-filled from the person's records; every figure can be changed
export function BalanceProjection({
  defaults,
  hints,
}: {
  defaults: { balance: number; monthlyContribution: number; annualRate: number };
  hints: { balance?: string; contribution?: string; rate?: string };
}) {
  const today = new Date();
  const fromYear = today.getFullYear();
  // YYYYMM, like the statement periods
  const fromPeriod = fromYear * 100 + today.getMonth() + 1;
  const round = (value: number) => String(Math.round(value * 100) / 100);
  const [startingBalance, setStartingBalance] = useState(
    round(Math.max(defaults.balance, 0))
  );
  const [monthlyContribution, setMonthlyContribution] = useState(
    round(Math.max(defaults.monthlyContribution, 0))
  );
  const [annualRate, setAnnualRate] = useState(
    round(Math.max(defaults.annualRate, 0))
  );
  const [toYear, setToYear] = useState(
    String(fromYear + PROJECTION_YEARS_DEFAULT)
  );

  const balance = toNumber(startingBalance);
  const contribution = toNumber(monthlyContribution);
  const rate = toNumber(annualRate);
  const year = toNumber(toYear);
  const isComplete =
    balance !== null &&
    balance >= 0 &&
    contribution !== null &&
    contribution >= 0 &&
    rate !== null &&
    rate >= 0 &&
    rate <= MAX_RATE &&
    year !== null &&
    Number.isInteger(year) &&
    year >= fromYear &&
    year <= fromYear + MAX_YEARS_AHEAD;

  const projection = isComplete
    ? projectBalance({
        balance,
        fromPeriod,
        toYear: year,
        monthlyContribution: contribution,
        annualRate: rate,
      })
    : null;

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Calculator className="size-4 text-muted-foreground" />
            Your figures
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Pre-filled from the pension records. Change any of them to see how
            the estimate moves.
          </p>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Shown before any figures so the estimate isn't read as a promise */}
          <div
            role="note"
            className="flex gap-3 rounded-lg border-2 border-amber-500 bg-amber-50 px-4 py-4 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-100"
          >
            <TriangleAlert className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-600 dark:text-amber-400" />
            <div className="space-y-1">
              <p className="text-base font-semibold">
                This is an illustration, not a guarantee or an entitlement.
              </p>
              <p>
                It assumes the same contribution and the same interest rate
                every month. Interest rates change, and salary changes, breaks
                in service, withdrawals and the pension rules all affect what
                you receive. Amounts are not adjusted for inflation. For an
                official figure, contact the Pension Office.
              </p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Field
              id="projection-balance"
              label="Starting balance ($)"
              hint={hints.balance}
              inputMode="decimal"
              min={0}
              step="any"
              value={startingBalance}
              onChange={(value) => setStartingBalance(nonNegative(value))}
            />
            <Field
              id="projection-contribution"
              label="Monthly contribution ($)"
              hint={hints.contribution}
              inputMode="decimal"
              min={0}
              step="any"
              value={monthlyContribution}
              onChange={(value) => setMonthlyContribution(nonNegative(value))}
            />
            <Field
              id="projection-rate"
              label="Interest rate (% a year)"
              hint={hints.rate}
              inputMode="decimal"
              min={0}
              max={MAX_RATE}
              step="any"
              value={annualRate}
              onChange={(value) => setAnnualRate(nonNegative(value))}
            />
            <Field
              id="projection-year"
              label="Project to the end of"
              hint={`Any year to ${fromYear + MAX_YEARS_AHEAD}`}
              inputMode="numeric"
              min={fromYear}
              max={fromYear + MAX_YEARS_AHEAD}
              step={1}
              value={toYear}
              onChange={setToYear}
            />
          </div>

          {projection === null ? (
            <div className="rounded-lg border border-dashed py-8 text-center text-sm text-muted-foreground">
              Fill in all four fields to see an estimate.
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Figure
                label={`Estimated balance, Dec ${year}`}
                value={projection.balance}
                highlight
              />
              <Figure label="Starting balance" value={balance ?? 0} />
              <Figure
                label="Future contributions"
                value={projection.contributions}
              />
              <Figure label="Future interest" value={projection.interest} />
            </div>
          )}
        </CardContent>
      </Card>

      {projection !== null && projection.years.length > 0 && (
        <Card className="gap-0 overflow-hidden pb-0">
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Table2 className="size-4 text-muted-foreground" />
              Year by year
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              {projection.years[0].year === fromYear
                ? `${fromYear} covers the rest of this year only.`
                : "Each year from January to December."}
            </p>
          </CardHeader>
          <div className="border-t">
            <YearTable projection={projection} />
          </div>
        </Card>
      )}
    </>
  );
}
