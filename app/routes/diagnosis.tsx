import {
  AlertTriangle,
  CheckCircle2,
  Info,
  Layers,
  UserSearch,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { Form, Link, redirect, useNavigation } from "react-router";
import { StatusButton } from "~/components/status-button";
import {
  badgeTone,
  iconTone,
  tableBodyClass,
  tableHeaderClass,
  type BadgeTone,
} from "~/components/table-styles";
import { Badge } from "~/components/ui/badge";
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
import { getUserEmail } from "~/lib/auth.server";
import { getSignInCheck, resolveUserByEmail } from "~/lib/db.server";
import {
  diagnoseSignIn,
  type CheckStatus,
  type NearMatch,
  type SignInCheck,
} from "~/lib/sign-in-check";
import { cn, formatAmount, formatPeriod } from "~/lib/utils";
import type { Route } from "./+types/diagnosis";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Diagnosis | AU Pension" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const userEmail = await getUserEmail(request);
  const resolvedUser = userEmail ? await resolveUserByEmail(userEmail) : null;

  // Only admins (the pension office) can look up other people's records
  if (resolvedUser?.role !== "Admin") {
    throw redirect("/statement");
  }

  // Normalised the same way sign-in normalises the Microsoft email
  const email = new URL(request.url).searchParams
    .get("email")
    ?.trim()
    .toLowerCase();
  if (!email) {
    return { email: null, check: null, error: null };
  }
  if (!/^[^\s@]+@[^\s@]+$/.test(email)) {
    return {
      email,
      check: null,
      error: "Enter the full email address the person signs in with.",
    };
  }
  return { email, check: await getSignInCheck(email), error: null };
}

const statusTone: Record<CheckStatus, BadgeTone> = {
  ok: "success",
  info: "info",
  warning: "warning",
  error: "danger",
};

const statusIcon: Record<CheckStatus, LucideIcon> = {
  ok: CheckCircle2,
  info: Info,
  warning: AlertTriangle,
  error: XCircle,
};

const statusLabel: Record<CheckStatus, string> = {
  ok: "OK",
  info: "Note",
  warning: "Check",
  error: "Problem",
};

const nearMatchReason: Record<NearMatch["Reason"], string> = {
  spaces: "Same email, stored with extra spaces",
  email: "Similar email",
  name: "Name matches the email",
};

function SapIdLink({ sapId }: { sapId: number | null }) {
  if (sapId === null) {
    return <span className="text-muted-foreground">—</span>;
  }
  return (
    <Link
      to={`/statement?sapId=${sapId}`}
      className="font-medium text-primary hover:underline"
    >
      {sapId}
    </Link>
  );
}

function Diagnosis({ check }: { check: SignInCheck }) {
  const { status, headline, steps } = diagnoseSignIn(check);
  const Icon = statusIcon[status];

  return (
    <Card className="gap-4">
      <CardHeader>
        <div className="flex items-center gap-4">
          <div
            className={cn(
              "flex size-11 shrink-0 items-center justify-center rounded-lg",
              iconTone[statusTone[status]]
            )}
          >
            <Icon className="size-5" />
          </div>
          <div className="min-w-0">
            <CardTitle className="text-lg">{headline}</CardTitle>
            <p className="mt-0.5 break-all text-sm text-muted-foreground">
              {check.email}
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <ol className="divide-y rounded-lg border">
          {steps.map((step) => {
            const StepIcon = statusIcon[step.status];
            return (
              <li
                key={step.title}
                className="flex flex-col gap-1.5 px-4 py-3 sm:flex-row sm:gap-4"
              >
                <div className="flex shrink-0 items-center justify-between gap-2 sm:w-44 sm:flex-col sm:items-start sm:justify-start">
                  <span className="text-sm font-medium">{step.title}</span>
                  <Badge className={badgeTone[statusTone[step.status]]}>
                    <StepIcon />
                    {statusLabel[step.status]}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">{step.detail}</p>
              </li>
            );
          })}
        </ol>
      </CardContent>
    </Card>
  );
}

function SapIdTable({ check }: { check: SignInCheck }) {
  if (check.sapIds.length === 0) {
    return null;
  }
  return (
    <Card className="gap-4 overflow-hidden pb-0">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Layers className="size-4 text-muted-foreground" />
          SAP IDs for this email
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          In the order sign-in uses: the first one opens, the others are in the
          switcher.
        </p>
      </CardHeader>
      <CardContent className="border-t p-0">
        <Table>
          <TableHeader className={tableHeaderClass}>
            <TableRow>
              <TableHead>SAP ID</TableHead>
              <TableHead>Name</TableHead>
              <TableHead className="text-right">Contributions</TableHead>
              <TableHead>Period</TableHead>
              <TableHead>Interest to</TableHead>
              <TableHead className="text-right">Balance</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className={tableBodyClass}>
            {check.sapIds.map((sapId, index) => (
              <TableRow key={sapId.SAPID}>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <SapIdLink sapId={sapId.SAPID} />
                    {index === 0 && check.sapIds.length > 1 && (
                      <Badge className={badgeTone.success}>Opens first</Badge>
                    )}
                    {sapId.UserRows > 1 && (
                      <Badge className={badgeTone.warning}>
                        {sapId.UserRows} rows
                      </Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell>{sapId.FullName ?? "—"}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {sapId.ContributionRows.toLocaleString()}
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  {sapId.FirstPeriod !== null && sapId.LastPeriod !== null
                    ? `${formatPeriod(sapId.FirstPeriod)} – ${formatPeriod(sapId.LastPeriod)}`
                    : "—"}
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  {sapId.LatestInterest !== null ? (
                    formatPeriod(sapId.LatestInterest)
                  ) : (
                    <Badge className={badgeTone.warning}>None</Badge>
                  )}
                </TableCell>
                <TableCell className="text-right font-medium tabular-nums">
                  ${formatAmount(sapId.Balance)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function NearMatches({ check }: { check: SignInCheck }) {
  const isRecognised = check.isAdmin || check.accounts.length > 0;
  if (check.nearMatches.length === 0) {
    if (isRecognised) {
      return null;
    }
    return (
      <Card>
        <CardContent className="text-sm text-muted-foreground">
          No similar records either. Find them by name or SAP ID with the{" "}
          <Link to="/statement" className="font-medium text-primary hover:underline">
            statement search
          </Link>
          ; if they aren't there, they need adding to the users table.
        </CardContent>
      </Card>
    );
  }
  return (
    <Card className="gap-4 overflow-hidden pb-0">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <UserSearch className="size-4 text-muted-foreground" />
          Similar records
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          {isRecognised
            ? "Other records that may belong to the same person."
            : "The person's record may be under one of these instead. If so, correct the email on the record or have them sign in with that address."}
        </p>
      </CardHeader>
      <CardContent className="border-t p-0">
        <Table>
          <TableHeader className={tableHeaderClass}>
            <TableRow>
              <TableHead>Why it matched</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>SAP ID</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Type</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className={tableBodyClass}>
            {check.nearMatches.map((match, index) => (
              <TableRow key={`${match.Source}-${match.Email}-${match.SAPID}-${index}`}>
                <TableCell>
                  <Badge
                    className={
                      badgeTone[match.Reason === "spaces" ? "danger" : "neutral"]
                    }
                  >
                    {nearMatchReason[match.Reason]}
                  </Badge>
                </TableCell>
                <TableCell className="break-all">
                  {match.Email ? (
                    <span className="whitespace-pre">{match.Email}</span>
                  ) : (
                    <span className="text-muted-foreground">No email</span>
                  )}
                </TableCell>
                <TableCell>
                  <SapIdLink sapId={match.SAPID} />
                </TableCell>
                <TableCell>{match.FullName?.trim() || "—"}</TableCell>
                <TableCell>{match.Source}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

export default function SignInCheckPage({ loaderData }: Route.ComponentProps) {
  const { email, check, error } = loaderData;
  const navigation = useNavigation();
  const isChecking =
    navigation.state === "loading" &&
    navigation.location.pathname === "/diagnosis";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Diagnosis</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          See what someone gets when they sign in with an email: whether they
          are recognised, which statement opens, and where it goes wrong if
          they can't see it. Use the email they sign in to Microsoft with.
        </p>
      </div>

      <Card>
        <CardContent>
          <Form method="GET" className="flex flex-col gap-3 sm:flex-row">
            <Label htmlFor="email" className="sr-only">
              Email
            </Label>
            <Input
              // Fresh input when moving between checks with back and forward
              key={email ?? ""}
              id="email"
              name="email"
              type="email"
              required
              defaultValue={email ?? ""}
              placeholder="name@africanunion.org"
              autoComplete="off"
              className="sm:flex-1"
            />
            <StatusButton
              type="submit"
              status={isChecking ? "pending" : "idle"}
              disabled={isChecking}
            >
              Check
            </StatusButton>
          </Form>
        </CardContent>
      </Card>

      {error && (
        <div className="flex gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <p>{error}</p>
        </div>
      )}

      {check && (
        <div
          className={cn(
            "space-y-6 transition-opacity",
            isChecking && "opacity-50"
          )}
        >
          <Diagnosis check={check} />
          <SapIdTable check={check} />
          <NearMatches check={check} />
        </div>
      )}
    </div>
  );
}
