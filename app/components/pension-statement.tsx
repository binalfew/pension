import { Calendar, Download, Hash, User } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { formatPeriod } from "~/lib/utils";
import type { ComputedInterest } from "~/types/computed-interest";
import type { ContributionView } from "~/types/contribution-view";
import type { Account, Statement } from "~/types/statement";

export function formatAmount(amount: number) {
  return amount.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function PensionStatement({
  statement,
  total,
  contributions,
  computedInterests,
}: {
  statement: Statement;
  total: Account;
  contributions: ContributionView[];
  computedInterests: ComputedInterest[];
}) {
  return (
    <>
      <div className="flex items-center justify-between gap-4 p-4 bg-muted/30 rounded-lg border border-border shadow-sm">
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
              <span>SAP ID: {statement.EmployeeID}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4 flex-shrink-0">
          <div className="flex items-center gap-1 text-sm text-muted-foreground">
            <Calendar className="w-3 h-3" />
            <span>
              As of{" "}
              {new Date().toLocaleDateString("en-US", {
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </span>
          </div>
          <a
            href={`/api/pdf?sapId=${statement.EmployeeID}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-3 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors text-sm font-medium"
          >
            <Download className="w-4 h-4" />
            Download PDF
          </a>
        </div>
      </div>

      {/* Pension Statement Card */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center justify-between text-base">
            <span>Pension Statement</span>
            <div className="flex items-center gap-2">
              <span className="text-lg font-bold text-primary">
                ${formatAmount(total.Balance)}
              </span>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y">
            {statement.Accounts.filter(
              (acc) => acc.AccountName !== "TOTAL"
            ).map((acc) => (
              <div
                key={acc.AccountName}
                className="flex items-center justify-between px-4 py-2 hover:bg-muted/30 transition-colors"
              >
                <span className="font-medium text-sm">{acc.AccountName}</span>
                <span className="font-semibold text-sm">
                  ${formatAmount(acc.Balance)}
                </span>
              </div>
            ))}

            {/* Total Row */}
            <div className="flex items-center justify-between px-4 py-3 bg-primary/5 font-bold rounded-b-lg">
              <span className="text-sm">TOTAL BALANCE</span>
              <span className="text-primary">
                $
                {formatAmount(
                  statement.Accounts.find((acc) => acc.AccountName === "TOTAL")
                    ?.Balance ?? 0
                )}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Monthly Transactions Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Monthly Transactions</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
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
              {contributions.map((contribution, index) => (
                <TableRow
                  key={`${contribution.ForPeriod}-${contribution.ContributionTypeName}-${index}`}
                  className={
                    contribution.ContributionTypeName === "EMPLOYER ACCOUNT"
                      ? "bg-blue-50/50 dark:bg-blue-950/20"
                      : ""
                  }
                >
                  <TableCell className="font-medium w-[15%]">
                    {formatPeriod(contribution.ForPeriod)}
                  </TableCell>
                  <TableCell className="w-[15%]">
                    {formatPeriod(contribution.InPeriod)}
                  </TableCell>
                  <TableCell className="text-right font-bold w-[20%]">
                    ${formatAmount(contribution.Amount)}
                  </TableCell>
                  <TableCell className="w-[15%]">
                    {contribution.OfficeName}
                  </TableCell>
                  <TableCell className="font-medium w-[35%]">
                    {contribution.ContributionTypeName}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Computed Interests</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Year Month</TableHead>
                <TableHead>Interest</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {computedInterests.map((interest) => (
                <TableRow key={interest.ID}>
                  <TableCell>{formatPeriod(interest.YearMonth)}</TableCell>
                  <TableCell>${formatAmount(interest.Interest)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}
