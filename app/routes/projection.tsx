import { AlertTriangle, FileText, Hash, TrendingUp } from "lucide-react";
import { Link, redirect } from "react-router";
import { BalanceProjection } from "~/components/balance-projection";
import { PensionerSearch } from "~/components/pensioner-search";
import { iconTone } from "~/components/table-styles";
import { Button } from "~/components/ui/button";
import { Card, CardContent } from "~/components/ui/card";
import { getUserEmail } from "~/lib/auth.server";
import {
  getProjectionInputs,
  getRelatedSapIds,
  getUserBySapId,
  resolveUserByEmail,
} from "~/lib/db.server";
import { formatPeriod } from "~/lib/utils";
import type { Route } from "./+types/projection";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Projected balance | AU Pension" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const userEmail = await getUserEmail(request);
  const resolvedUser = userEmail ? await resolveUserByEmail(userEmail) : null;
  // The statement page welcomes visitors and explains a missing record
  if (!resolvedUser) {
    throw redirect("/statement");
  }

  const isAdmin = resolvedUser.role === "Admin";
  const empty = { isAdmin, person: null, inputs: null, error: null };

  let person: { name: string; sapIds: number[]; statementLink: string };
  if (isAdmin) {
    // Admins project anyone's balance, picked by SAP ID
    const sapIdParam = new URL(request.url).searchParams.get("sapId");
    if (!sapIdParam) {
      return empty;
    }
    const sapId = parseInt(sapIdParam);
    const user = isNaN(sapId) ? null : await getUserBySapId(sapId);
    if (!user) {
      return { ...empty, error: `No pensioner with SAP ID ${sapIdParam}.` };
    }
    person = {
      name: user.FullName?.trim() || `SAP ID ${sapId}`,
      // Every SAP ID of the person, like the statement's combined balance
      sapIds: await getRelatedSapIds(sapId),
      statementLink: `/statement?sapId=${sapId}`,
    };
  } else {
    // Pensioners only ever see their own SAP IDs
    const accounts = resolvedUser.accounts.filter((account) => account.SAPID);
    if (accounts.length === 0) {
      return { ...empty, error: "No pension data available." };
    }
    person = {
      name: accounts[0].FullName?.trim() || "Your pension",
      sapIds: accounts.map((account) => account.SAPID as number),
      statementLink: "/statement",
    };
  }

  return {
    ...empty,
    person,
    inputs: await getProjectionInputs(person.sapIds),
  };
}

export default function ProjectionPage({ loaderData }: Route.ComponentProps) {
  const { isAdmin, person, inputs, error } = loaderData;

  const intro = (
    <div>
      <h1 className="text-2xl font-semibold">Projected balance</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Estimate what a pension balance could grow to with regular
        contributions and interest.
      </p>
    </div>
  );

  if (!person || !inputs) {
    return (
      <div className="space-y-6">
        {intro}
        {isAdmin && (
          <Card>
            <CardContent>
              <PensionerSearch action="/projection" />
            </CardContent>
          </Card>
        )}
        {error && (
          <div className="flex gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <p>{error}</p>
          </div>
        )}
      </div>
    );
  }

  const { rates } = inputs;
  const averageRate =
    rates.length > 0
      ? rates.reduce((sum, row) => sum + row.rate, 0) / rates.length
      : 0;
  const several = person.sapIds.length > 1;

  const hints = {
    balance: `Recorded balance${
      several ? ` across ${person.sapIds.length} SAP IDs` : ""
    }${
      inputs.interestThrough !== null
        ? `, with interest to ${formatPeriod(inputs.interestThrough)}`
        : ", with no interest yet"
    }.`,
    contribution:
      inputs.contributionFrom !== null && inputs.contributionTo !== null
        ? `Average for ${formatPeriod(inputs.contributionFrom)} to ${formatPeriod(
            inputs.contributionTo
          )}.`
        : undefined,
    rate:
      rates.length > 0
        ? `Average for ${formatPeriod(
            rates[rates.length - 1].period
          )} to ${formatPeriod(rates[0].period)}; the latest was ${
            rates[0].rate
          }%.`
        : undefined,
  };

  return (
    <div className="space-y-6">
      {isAdmin && (
        <Card>
          <CardContent>
            <PensionerSearch action="/projection" />
          </CardContent>
        </Card>
      )}

      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border bg-card p-5 shadow-sm">
        <div className="flex min-w-0 items-center gap-4">
          <div
            className={`flex size-11 shrink-0 items-center justify-center rounded-lg ${iconTone.success}`}
          >
            <TrendingUp className="size-5" />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-xl font-semibold">
              Projected balance: {person.name}
            </h1>
            <div className="mt-1 flex items-center gap-1 text-sm text-muted-foreground">
              <Hash className="size-3" />
              <span>
                {several ? "SAP IDs" : "SAP ID"}: {person.sapIds.join(", ")}
              </span>
            </div>
          </div>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link to={person.statementLink}>
            <FileText />
            View statement
          </Link>
        </Button>
      </div>

      <BalanceProjection
        // Start from the new person's figures when an admin switches
        key={person.sapIds.join("-")}
        defaults={{
          balance: inputs.balance,
          monthlyContribution: inputs.averageContribution,
          annualRate: averageRate,
        }}
        hints={hints}
      />
    </div>
  );
}
