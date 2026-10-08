import { Calendar, Download, Hash, User } from "lucide-react";
import { BalanceHistory } from "~/components/balance-history";
import { BalanceProjection } from "~/components/balance-projection";
import { ContributionGaps } from "~/components/contribution-gaps";
import { StatementSummary } from "~/components/statement-summary";
import { iconTone } from "~/components/table-styles";
import { TransactionsTable } from "~/components/transactions-table";
import { Button } from "~/components/ui/button";
import {
  findContributionGaps,
  getAnnualSummary,
  getMonthlyBalances,
} from "~/lib/statement-analysis";
import { formatPeriod } from "~/lib/utils";
import type { ComputedInterest } from "~/types/computed-interest";
import type { ContributionView } from "~/types/contribution-view";
import type { Statement } from "~/types/statement";

export function PensionStatement({
  statement,
  contributions,
  computedInterests,
  combinedBalance,
  supportEmail,
}: {
  statement: Statement;
  contributions: ContributionView[];
  computedInterests: ComputedInterest[];
  // Total balance across all of the person's SAP IDs
  combinedBalance: number;
  supportEmail: string | null;
}) {
  const isCombined = statement.SapIds.length > 1;
  // Query string for downloading this same statement
  const downloadQuery = `sapId=${statement.SapIds[0]}${
    isCombined ? "&view=combined" : ""
  }`;
  const annualSummary = getAnnualSummary(contributions, computedInterests);
  const balanceHistory = getMonthlyBalances(contributions, computedInterests);
  const gaps = findContributionGaps(contributions);

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border bg-card p-5 shadow-sm">
        <div className="flex min-w-0 items-center gap-4">
          <div
            className={`flex size-11 shrink-0 items-center justify-center rounded-lg ${iconTone.success}`}
          >
            <User className="size-5" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl font-semibold text-foreground truncate">
              {statement.EmployeeFullName}
            </h1>
            <div className="flex items-center gap-1 mt-1 text-sm text-muted-foreground">
              <Hash className="w-3 h-3" />
              <span>
                {isCombined
                  ? `SAP IDs: ${statement.SapIds.join(", ")}`
                  : `SAP ID: ${statement.SapIds[0]}`}
              </span>
            </div>
            <div className="flex items-center gap-1 mt-0.5 text-sm text-muted-foreground">
              <Calendar className="w-3 h-3" />
              <span>
                {statement.ContributionsThrough !== null
                  ? `Contributions as of ${formatPeriod(
                      statement.ContributionsThrough
                    )}`
                  : "No dated contributions"}
                {statement.InterestThrough !== null &&
                  ` · Interest as of ${formatPeriod(
                    statement.InterestThrough
                  )}`}
              </span>
            </div>
          </div>
        </div>

        <Button asChild variant="outline" size="sm">
          <a
            href={`/api/pdf?${downloadQuery}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Download />
            Download PDF
          </a>
        </Button>
      </div>

      <ContributionGaps
        gaps={gaps}
        fullName={statement.EmployeeFullName}
        showSapId={isCombined}
        supportEmail={supportEmail}
      />

      <StatementSummary
        title={isCombined ? "Combined Pension Statement" : "Pension Statement"}
        accounts={statement.Accounts}
        history={balanceHistory}
      />

      <BalanceHistory rows={annualSummary} history={balanceHistory} />

      <BalanceProjection defaultBalance={combinedBalance} />

      <TransactionsTable
        contributions={contributions}
        computedInterests={computedInterests}
        showSapId={isCombined}
      />
    </>
  );
}
