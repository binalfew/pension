import {
  Calendar,
  Check,
  Download,
  Hash,
  Info,
  Loader2,
  Search,
  User,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  data,
  Form,
  Link,
  useFetcher,
  useNavigation,
  useSearchParams,
  useSubmit,
} from "react-router";
import { useSpinDelay } from "spin-delay";
import { StatusButton } from "~/components/status-button";
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
import Welcome from "~/components/welcome";
import { getUserEmail } from "~/lib/auth.server";
import {
  generatePensionStatement,
  generatePensionStatementBySapId,
  resolveUserByEmail,
} from "~/lib/db.server";
import { cn, formatPeriod, useDebounce, useIsPending } from "~/lib/utils";
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
  const userEmail = await getUserEmail(request);
  const supportEmail = process.env.PENSION_SUPPORT_EMAIL ?? null;

  // If no user email in session, show welcome page
  if (!userEmail) {
    return data({
      user: null,
      statement: null,
      total: null,
      contributions: null,
      computedInterests: null,
      error: null,
      signedInEmail: null,
      supportEmail,
    });
  }

  // Resolve user from both tables
  const resolvedUser = await resolveUserByEmail(userEmail);

  // If user not found in either table, show appropriate message
  if (!resolvedUser) {
    return data({
      user: null,
      statement: null,
      total: null,
      contributions: null,
      computedInterests: null,
      error: "no-pension-record",
      signedInEmail: userEmail,
      supportEmail,
    });
  }

  const { user, role, accounts } = resolvedUser;
  const url = new URL(request.url);
  const selectedSapId = url.searchParams.get("sapId");

  // For admin users
  if (role === "Admin") {
    // If admin is viewing a specific user's statement
    if (selectedSapId) {
      const sapId = parseInt(selectedSapId);
      if (isNaN(sapId)) {
        return data({
          user: { ...user, Role: role },
          statement: null,
          total: null,
          contributions: null,
          computedInterests: null,
          error: "Invalid SAP ID",
        });
      }

      const statementData = await generatePensionStatementBySapId(sapId);
      if (!statementData) {
        return data({
          user: { ...user, Role: role },
          statement: null,
          total: null,
          contributions: null,
          computedInterests: null,
          error: `Pension statement not found for the selected sap id ${sapId}`,
        });
      }

      return data({
        user: { ...user, Role: role },
        ...statementData,
        error: null,
      });
    }

    // Admin with no sapId param
    return data({
      user: { ...user, Role: role },
      statement: null,
      total: null,
      contributions: null,
      computedInterests: null,
      error: null,
    });
  }

  // For pensioner users - they can only view their own statement(s)
  const ownAccounts = accounts.filter((account) => account.SAPID);
  if (role === "Pensioner" && ownAccounts.length > 0) {
    // Only allow selecting one of the pensioner's own SAP IDs
    const selectedAccount =
      ownAccounts.find((account) => String(account.SAPID) === selectedSapId) ??
      ownAccounts[0];
    const { statement, total, contributions, computedInterests } =
      await generatePensionStatement(selectedAccount);

    return data({
      user: { ...selectedAccount, Role: role },
      sapIds: ownAccounts.map((account) => account.SAPID as number),
      statement,
      total,
      contributions,
      computedInterests,
      error: null,
    });
  }

  // Pensioner without SAP ID
  return data({
    user: { ...user, Role: role },
    statement: null,
    total: null,
    contributions: null,
    computedInterests: null,
    error: "No pension data available",
  });
}

export default function Home({ loaderData }: Route.ComponentProps) {
  const handler = "/";
  const autoSubmit = false;
  const [searchParams] = useSearchParams();
  const submit = useSubmit();
  const searchFetcher = useFetcher();
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const isSubmitting = useIsPending({
    formMethod: "GET",
    formAction: handler,
  });

  const handleFormChange = useDebounce((form: HTMLFormElement) => {
    const formData = new FormData(form);
    const filteredData = new URLSearchParams();

    // Preserve existing search params
    for (const [key, value] of formData.entries()) {
      if (typeof value === "string" && value.trim() !== "") {
        filteredData.append(key, value);
      }
    }

    submit(filteredData, { method: "GET", action: handler });
  }, 400);

  const handleSearchInput = useDebounce((value: string) => {
    if (value && value.trim().length >= 2) {
      searchFetcher.load(`/api/search?q=${encodeURIComponent(value.trim())}`);
      setShowDropdown(true);
    } else {
      setShowDropdown(false);
    }
  }, 300);

  const { user, statement, total, contributions, computedInterests, error } =
    loaderData;
  const signedInEmail =
    "signedInEmail" in loaderData ? loaderData.signedInEmail : null;
  const supportEmail =
    "supportEmail" in loaderData ? loaderData.supportEmail : null;
  const sapIds = "sapIds" in loaderData ? loaderData.sapIds : [];

  // SAP ID the pensioner just switched to, while its statement is loading
  const navigation = useNavigation();
  const pendingSapId =
    navigation.state === "loading" && navigation.location.pathname === "/"
      ? Number(new URLSearchParams(navigation.location.search).get("sapId")) ||
        null
      : null;
  const isSwitchingSapId = useSpinDelay(pendingSapId !== null, {
    delay: 150,
    minDuration: 300,
  });

  const suggestions = searchFetcher.data?.suggestions || [];

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setShowDropdown(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  // Close dropdown when suggestions change to empty
  useEffect(() => {
    if (suggestions.length === 0) {
      setShowDropdown(false);
    }
  }, [suggestions.length]);

  // Show welcome page for unauthenticated users
  if (!user) {
    if (error === "no-pension-record") {
      const mailtoSubject = encodeURIComponent(
        "Pension portal access request"
      );
      const mailtoBody = encodeURIComponent(
        `Hello,\n\nI signed in to the AU Pension portal with ${signedInEmail ?? "my account"} but no pension record was found for this account. Could you please check whether my pension record is set up under a different email address, or arrange for it to be created?\n\nThank you.`
      );

      return (
        <div className="max-w-3xl mx-auto py-16">
          <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
            <div className="px-8 py-7 border-b border-border bg-muted/30">
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 mt-0.5">
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                    <Info className="w-6 h-6 text-primary" />
                  </div>
                </div>
                <div className="min-w-0 flex-1">
                  <h1 className="text-2xl font-semibold text-foreground">
                    No pension record found
                  </h1>
                  <p className="mt-1.5 text-base text-muted-foreground">
                    We couldn't find any pension information linked to your
                    account.
                  </p>
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 text-xs font-medium">
                      <Check className="w-3.5 h-3.5" />
                      Signed in
                    </span>
                    <span className="text-base text-foreground font-medium break-all">
                      {signedInEmail ?? "your account"}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="px-8 py-7 space-y-6">
              <div>
                <h2 className="text-base font-semibold text-foreground mb-2">
                  Why am I seeing this?
                </h2>
                <ul className="text-sm text-muted-foreground space-y-1.5 list-disc pl-5">
                  <li>
                    Your pension record may not have been created yet in the
                    system.
                  </li>
                  <li>
                    Your pension record may exist under a different email
                    address than the one used to sign in.
                  </li>
                  <li>
                    Recent changes to your account may not yet be reflected in
                    the pension system.
                  </li>
                </ul>
              </div>

              <div>
                <h2 className="text-base font-semibold text-foreground mb-2">
                  What can I do?
                </h2>
                {supportEmail ? (
                  <p className="text-sm text-muted-foreground">
                    Please contact the Pension Office at{" "}
                    <a
                      href={`mailto:${supportEmail}?subject=${mailtoSubject}&body=${mailtoBody}`}
                      className="font-medium text-primary hover:underline"
                    >
                      {supportEmail}
                    </a>{" "}
                    so they can verify your record. Mention the email address
                    you used to sign in.
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Please contact the Pension Office and mention the email
                    address you used to sign in so they can verify your
                    record.
                  </p>
                )}
              </div>

            </div>
          </div>
        </div>
      );
    }

    if (error) {
      return (
        <div className="max-w-4xl mx-auto space-y-6">
          <div className="p-6 bg-destructive/10 border border-destructive/20 rounded-lg">
            <h2 className="text-lg font-semibold text-destructive mb-2">
              Access Error
            </h2>
            <p className="text-destructive/80">{error}</p>
          </div>
        </div>
      );
    }
    return <Welcome />;
  }

  // For admin users - always show the admin interface with search
  if (user.Role === "Admin") {
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Search Pension Statement</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Form
              method="GET"
              action={handler}
              className="flex flex-col gap-4"
              onChange={(e) => autoSubmit && handleFormChange(e.currentTarget)}
              onSubmit={(e) => {
                e.preventDefault();
                handleFormChange(e.currentTarget);
              }}
            >
              <div className="flex items-center gap-2">
                <div className="flex-1 relative" ref={dropdownRef}>
                  <Label htmlFor="sapId" className="sr-only">
                    Search
                  </Label>
                  <Input
                    ref={inputRef}
                    type="search"
                    name="sapId"
                    id="sapId"
                    defaultValue={searchParams.get("sapId") ?? ""}
                    placeholder="Enter SAP ID or name to search"
                    className="w-full"
                    onChange={(e) => handleSearchInput(e.target.value)}
                    onFocus={() => {
                      if (suggestions.length > 0) {
                        setShowDropdown(true);
                      }
                    }}
                  />

                  {/* Autocomplete suggestions */}
                  {showDropdown && suggestions.length > 0 && (
                    <div className="absolute top-full left-0 right-0 bg-background border border-border rounded-md shadow-lg z-10 max-h-60 overflow-y-auto">
                      {suggestions.map(
                        (suggestion: {
                          SAPID: number;
                          FullName: string;
                          Email: string;
                        }) => (
                          <button
                            key={suggestion.SAPID}
                            type="button"
                            className="w-full px-3 py-2 text-left hover:bg-muted/50 focus:bg-muted/50 focus:outline-none"
                            onClick={() => {
                              const form = document.querySelector(
                                'form[method="GET"]'
                              ) as HTMLFormElement;
                              const input = form?.querySelector(
                                'input[name="sapId"]'
                              ) as HTMLInputElement;
                              if (input) {
                                input.value = suggestion.SAPID.toString();
                                setShowDropdown(false);
                                handleFormChange(form);
                              }
                            }}
                          >
                            <div className="font-medium">
                              {suggestion.FullName}
                            </div>
                            <div className="text-sm text-muted-foreground">
                              SAP ID: {suggestion.SAPID} • {suggestion.Email}
                            </div>
                          </button>
                        )
                      )}
                    </div>
                  )}
                </div>
                <StatusButton
                  type="submit"
                  status={isSubmitting ? "pending" : "idle"}
                  className="flex cursor-pointer items-center justify-center"
                  size="sm"
                >
                  <Search className="h-4 w-4" />
                  <span className="sr-only">Search</span>
                </StatusButton>
              </div>
            </Form>
          </CardContent>
        </Card>

        {/* Show error message if there's an error */}
        {error && (
          <div className="p-6 bg-destructive/10 border border-destructive/20 rounded-lg">
            <h2 className="text-lg font-semibold text-destructive mb-2">
              Access Error
            </h2>
            <p className="text-destructive/80">{error}</p>
          </div>
        )}

        {/* Show statement if available */}
        {statement && total && contributions && computedInterests && (
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
                      $
                      {total.Balance.toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
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
                      <span className="font-medium text-sm">
                        {acc.AccountName}
                      </span>
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
                      <TableHead className="w-[35%]">
                        Contribution Type
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {contributions.map((contribution, index) => (
                      <TableRow
                        key={`${contribution.ForPeriod}-${contribution.ContributionTypeName}-${index}`}
                        className={
                          contribution.ContributionTypeName ===
                          "EMPLOYER ACCOUNT"
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
                        <TableCell>
                          {formatPeriod(interest.YearMonth)}
                        </TableCell>
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
          </>
        )}
      </div>
    );
  }

  // For non-admin users, show error message if there's an error
  if (error) {
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="p-6 bg-destructive/10 border border-destructive/20 rounded-lg">
          <h2 className="text-lg font-semibold text-destructive mb-2">
            Access Error
          </h2>
          <p className="text-destructive/80">{error}</p>
        </div>
      </div>
    );
  }

  // For pensioner users with pension statements
  if (statement && total && contributions && computedInterests) {
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        {sapIds.length > 1 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-muted-foreground">SAP ID:</span>
            {sapIds.map((sapId) => (
              <Link
                key={sapId}
                to={`?sapId=${sapId}`}
                className={cn(
                  "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-sm font-medium transition-colors",
                  sapId === (pendingSapId ?? statement.EmployeeID)
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background border-border hover:bg-muted/50"
                )}
              >
                {isSwitchingSapId && sapId === pendingSapId && (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                )}
                {sapId}
              </Link>
            ))}
          </div>
        )}

        <div
          aria-busy={isSwitchingSapId}
          className={cn(
            "space-y-6 transition-opacity",
            isSwitchingSapId && "opacity-50 pointer-events-none"
          )}
        >
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
                    $
                    {total.Balance.toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
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
                    <span className="font-medium text-sm">
                      {acc.AccountName}
                    </span>
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
      </div>
    );
  }

  // Fallback for unexpected states
  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="p-6 bg-muted/10 border border-muted/20 rounded-lg">
        <h2 className="text-lg font-semibold mb-2">No Data Available</h2>
        <p className="text-muted-foreground">
          No pension statement data is available for your account.
        </p>
      </div>
    </div>
  );
}
