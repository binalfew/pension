import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import type { BalanceHistoryData } from "~/lib/statement-analysis";
import { cn, formatAmount, formatPeriod } from "~/lib/utils";
import type { Account } from "~/types/statement";

function Stat({
  label,
  value,
  signed,
  highlight,
}: {
  label: string;
  value: number;
  signed?: boolean;
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
          highlight && "text-primary",
          value < 0 && "text-destructive"
        )}
      >
        {signed && value > 0 ? "+" : ""}${formatAmount(value)}
      </div>
    </div>
  );
}

// Key figures and the balance of each account
export function StatementSummary({
  title,
  accounts,
  history,
}: {
  title: string;
  accounts: Account[];
  history: BalanceHistoryData;
}) {
  const { opening, months } = history;
  const total =
    accounts.find((account) => account.AccountName === "TOTAL")?.Balance ?? 0;

  const latest = months[months.length - 1];
  const contributed = latest?.contributionsToDate ?? opening;
  const interest = latest?.interestToDate ?? 0;
  // Change over the last 12 months, or since the first month for shorter
  // histories
  const hasFullYear = months.length > 12;
  const recentChange = latest
    ? latest.balance -
      (hasFullYear ? months[months.length - 13].balance : opening)
    : 0;
  const recentLabel = hasFullYear
    ? "Last 12 months"
    : months.length > 0
    ? `Since ${formatPeriod(months[0].period)}`
    : "Recent change";

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Total balance" value={total} highlight />
          <Stat label="Total contributed" value={contributed} />
          <Stat label="Interest earned" value={interest} />
          <Stat label={recentLabel} value={recentChange} signed />
        </div>

        <div>
          <h3 className="mb-2 text-sm font-medium text-muted-foreground">
            By account
          </h3>
          <div className="divide-y rounded-lg border">
            {accounts
              .filter((account) => account.AccountName !== "TOTAL")
              .map((account) => (
                <div
                  key={account.AccountName}
                  className="flex items-center justify-between px-4 py-2 text-sm"
                >
                  <span className="font-medium">{account.AccountName}</span>
                  <span
                    className={cn(
                      "font-semibold tabular-nums",
                      account.Balance < 0 && "text-destructive"
                    )}
                  >
                    ${formatAmount(account.Balance)}
                  </span>
                </div>
              ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
