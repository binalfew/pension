import { data } from "react-router";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import Welcome from "~/components/welcome";
import {
  getAllContributionTypes,
  getComputedInterestsBySapId,
  getContributionsBySapId,
  getContributionsByType,
  getUserByEmail,
} from "~/lib/db.server";
import { useOptionalUser } from "~/lib/user";
import type { Account, Statement } from "~/types/statement";
import type { Route } from "./+types/index";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Pension Management System" },
    {
      name: "description",
      content:
        "Manage your pension plans, track contributions, and plan for your retirement",
    },
  ];
}

export async function loader({ request }: Route.LoaderArgs) {
  const user = await getUserByEmail("Gideons@africa-union.org");

  if (!user) {
    throw new Error("User not found");
  }

  const statement: Statement = {
    EmployeeFullName: user.FullName ?? "",
    AsOfMonth: new Date(),
    EmployeeID: user.SAPID ?? 0,
    PensionID: user.PensionID ?? 0,
    Accounts: [],
  };

  const total: Account = {
    AccountName: "TOTAL",
    Balance: 0,
    Interest: 0,
    Withdrawals: 0,
    ClosingBalance: 0,
  };

  const contributionTypes = await getAllContributionTypes();
  for (const contributionType of contributionTypes) {
    const contributions = await getContributionsByType(
      user.SAPID ?? 0,
      contributionType.ID
    );
    const account = {
      AccountName: contributionType.ContributionTypeName,
      Balance: contributions.reduce(
        (acc, contribution) => acc + (contribution.Amount ?? 0),
        0
      ),
      Interest: 0,
      Withdrawals: 0,
      ClosingBalance: 0,
    };

    account.ClosingBalance =
      account.Balance + account.Interest + account.Withdrawals;

    statement.Accounts.push(account);

    total.Balance += account.Balance;
    total.Interest += account.Interest;
    total.Withdrawals += account.Withdrawals;
    total.ClosingBalance += account.ClosingBalance;
  }

  const contributions = await getContributionsBySapId(user.SAPID ?? 0);
  const computedInterests = await getComputedInterestsBySapId(user.SAPID ?? 0);

  // Add Cululated Interests to the statement
  const cumulatedInterests = {
    AccountName: "CUMULATIVE INTERESTS",
    Balance: computedInterests.reduce(
      (acc, interest) => acc + interest.Interest,
      0
    ),
    Interest: 0,
    Withdrawals: 0,
    ClosingBalance: 0,
  };

  total.Balance += cumulatedInterests.Balance;
  total.Interest += cumulatedInterests.Balance;
  total.ClosingBalance += cumulatedInterests.Balance;

  statement.Accounts.push(cumulatedInterests);
  statement.Accounts.push(total);

  return data({ statement, total, contributions, computedInterests });
}

// Helper function to format period (YYYYMM to readable format)
function formatPeriod(period: number): string {
  // Convert to string and ensure it's 6 digits
  const periodStr = period.toString().padStart(6, "0");

  // Extract year and month
  const year = parseInt(periodStr.substring(0, 4));
  const month = parseInt(periodStr.substring(4, 6));

  // If month is not valid (1-12), return original input
  if (month < 1 || month > 12) {
    return period.toString();
  }

  const monthNames = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];

  return `${monthNames[month - 1]} ${year}`;
}

export default function Home({ loaderData }: Route.ComponentProps) {
  const user = useOptionalUser();
  const { statement, total, contributions, computedInterests } = loaderData;

  if (user) {
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        {/* User Info Header */}
        <div className="space-y-1">
          <h1 className="text-xl font-bold">{statement.EmployeeFullName}</h1>
          <div className="text-sm text-muted-foreground">
            SAP ID: {statement.EmployeeID} • As of{" "}
            {new Date().toLocaleDateString("en-US", {
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </div>
        </div>

        {/* Pension Statement Card */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between text-base">
              <span>Pension Statement</span>
              <span className="text-lg font-bold text-primary">
                $
                {total.Balance.toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </span>
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
                    $
                    {acc.Balance.toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </span>
                </div>
              ))}

              {/* Total Row */}
              <div className="flex items-center justify-between px-4 py-3 bg-primary/5 font-bold rounded-b-lg">
                <span className="text-sm">TOTAL BALANCE</span>
                <span className="text-primary">
                  $
                  {(
                    statement.Accounts.find(
                      (acc) => acc.AccountName === "TOTAL"
                    )?.Balance ?? 0
                  ).toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
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
                      $
                      {contribution.Amount.toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
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
                    <TableCell>
                      $
                      {interest.Interest.toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <Welcome />;
}
