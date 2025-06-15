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
import { generatePensionStatement, getUserByEmail } from "~/lib/db.server";
import { useOptionalUser } from "~/lib/user";
import { formatPeriod } from "~/lib/utils";
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

  const { statement, total, contributions, computedInterests } =
    await generatePensionStatement(user);

  return data({ statement, total, contributions, computedInterests });
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
