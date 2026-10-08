import { Calendar, Download, Hash, User } from "lucide-react";
import { BalanceHistory } from "~/components/balance-history";
import { ContributionGaps } from "~/components/contribution-gaps";
import { StatementSummary } from "~/components/statement-summary";
import { TransactionsTable } from "~/components/transactions-table";
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
  supportEmail,
}: {
  statement: Statement;
  contributions: ContributionView[];
  computedInterests: ComputedInterest[];
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
      <div className="flex flex-wrap items-center justify-between gap-4 p-4 bg-muted/30 rounded-lg border border-border shadow-sm">
        <div className="flex items-center gap-4">
          <div className="flex-shrink-0">
            <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center">
              <User className="w-6 h-6 text-primary" />
            </div>
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

        <div className="flex flex-wrap items-center gap-2 flex-shrink-0">
          <a
            href={`/api/pdf?${downloadQuery}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-3 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors text-sm font-medium"
          >
            <Download className="w-4 h-4" />
            Download PDF
          </a>
        </div>
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

      <TransactionsTable
        contributions={contributions}
        computedInterests={computedInterests}
        showSapId={isCombined}
      />
    </>
  );
}
