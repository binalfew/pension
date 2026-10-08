import { TriangleAlert } from "lucide-react";
import { useState, type ComponentProps } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { projectBalance } from "~/lib/statement-analysis";
import { cn, formatAmount } from "~/lib/utils";

const MAX_YEARS_AHEAD = 50;

// Parses a number input, or null while it is blank or invalid
function toNumber(value: string) {
  const number = Number(value);
  return value.trim() !== "" && Number.isFinite(number) ? number : null;
}

function Field({
  id,
  label,
  value,
  onChange,
  ...props
}: {
  id: string;
  label: string;
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
        {...props}
      />
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

// What-if estimate of a future balance from figures the pensioner enters,
// projected from the current month
export function BalanceProjection({
  // Pre-fills the starting balance, which the pensioner can change
  defaultBalance,
}: {
  defaultBalance: number;
}) {
  const today = new Date();
  const fromYear = today.getFullYear();
  // YYYYMM, like the statement periods
  const fromPeriod = fromYear * 100 + today.getMonth() + 1;
  const [startingBalance, setStartingBalance] = useState(
    String(Math.max(Math.round(defaultBalance * 100) / 100, 0))
  );
  const [monthlyContribution, setMonthlyContribution] = useState("0");
  const [toYear, setToYear] = useState("");

  const balance = toNumber(startingBalance);
  const contribution = toNumber(monthlyContribution);
  const year = toNumber(toYear);
  const isComplete =
    balance !== null &&
    balance >= 0 &&
    contribution !== null &&
    contribution >= 0 &&
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
      })
    : null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg">Projected balance</CardTitle>
        <p className="text-sm text-muted-foreground">
          Enter your own figures to estimate what a balance could grow to by the
          end of a chosen year.
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
              It assumes the same contribution every month and a constant
              interest rate, compounded monthly. Actual interest is declared by
              the fund and varies from year to year; salary changes, breaks in
              service, withdrawals and the pension rules all affect what you
              receive. Amounts are not adjusted for inflation. For an official
              figure, contact the Pension Office.
            </p>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field
            id="projection-balance"
            label="Starting balance ($)"
            inputMode="decimal"
            min={0}
            step="any"
            value={startingBalance}
            // Balances can't be negative
            onChange={(value) =>
              setStartingBalance(Number(value) < 0 ? "0" : value)
            }
          />
          <Field
            id="projection-contribution"
            label="Monthly contribution ($)"
            inputMode="decimal"
            min={0}
            step="any"
            value={monthlyContribution}
            // Contributions can't be negative
            onChange={(value) =>
              setMonthlyContribution(Number(value) < 0 ? "0" : value)
            }
          />
          <Field
            id="projection-year"
            label="Project to the end of"
            inputMode="numeric"
            min={fromYear}
            max={fromYear + MAX_YEARS_AHEAD}
            step={1}
            placeholder={`${fromYear}–${fromYear + MAX_YEARS_AHEAD}`}
            value={toYear}
            onChange={setToYear}
          />
        </div>

        {projection === null ? (
          <div className="rounded-lg border border-dashed py-8 text-center text-sm text-muted-foreground">
            Fill in all three fields to see an estimate.
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-3">
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
          </div>
        )}
      </CardContent>
    </Card>
  );
}
