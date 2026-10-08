import { Check, Info, Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  data,
  Form,
  useFetcher,
  useSearchParams,
  useSubmit,
} from "react-router";
import { PensionStatement } from "~/components/pension-statement";
import { SapIdSwitcher } from "~/components/sap-id-switcher";
import { StatusButton } from "~/components/status-button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import Welcome from "~/components/welcome";
import { getUserEmail } from "~/lib/auth.server";
import { getSapIdSummaries, resolveUserByEmail } from "~/lib/db.server";
import { selectStatement } from "~/lib/statement-access.server";
import { useDebounce, useIsPending } from "~/lib/utils";
import type { Route } from "./+types/index";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "AU Pension" },
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

  const { user, role } = resolvedUser;
  const selection = await selectStatement(
    resolvedUser,
    new URL(request.url).searchParams,
    // Only allow selecting one of the pensioner's own SAP IDs
    { fallbackToOwn: true }
  );

  // Admin with no sapId param
  if (selection.status === "none") {
    return data({
      user: { ...user, Role: role },
      statement: null,
      total: null,
      contributions: null,
      computedInterests: null,
      error: null,
      supportEmail,
    });
  }

  if (selection.status === "error") {
    return data({
      user: { ...user, Role: role },
      statement: null,
      total: null,
      contributions: null,
      computedInterests: null,
      error: selection.message,
      supportEmail,
    });
  }

  return data({
    // Pensioners see the SAP ID record being viewed
    user: { ...(selection.account ?? user), Role: role },
    sapIdSummaries: await getSapIdSummaries(selection.personSapIds),
    ...selection.statementData,
    error: null,
    supportEmail,
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
  const sapIdSummaries =
    "sapIdSummaries" in loaderData ? loaderData.sapIdSummaries : [];
  // Across all of the person's SAP IDs, whichever statement is shown
  const combinedBalance =
    sapIdSummaries.length > 0
      ? sapIdSummaries.reduce((sum, summary) => sum + summary.Balance, 0)
      : total?.Balance ?? 0;

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
      <div className="max-w-6xl mx-auto space-y-6">
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
          <SapIdSwitcher
            summaries={sapIdSummaries}
            currentSapId={statement.SapIds[0]}
            isCombined={statement.SapIds.length > 1}
          >
            <PensionStatement
              // Start with fresh filters when switching statements
              key={statement.SapIds.join("-")}
              statement={statement}
              contributions={contributions}
              computedInterests={computedInterests}
              combinedBalance={combinedBalance}
              supportEmail={supportEmail}
            />
          </SapIdSwitcher>
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
      <div className="max-w-6xl mx-auto space-y-6">
        <SapIdSwitcher
          summaries={sapIdSummaries}
          currentSapId={statement.SapIds[0]}
          isCombined={statement.SapIds.length > 1}
        >
          <PensionStatement
            // Start with fresh filters when switching statements
            key={statement.SapIds.join("-")}
            statement={statement}
            contributions={contributions}
            computedInterests={computedInterests}
            combinedBalance={combinedBalance}
            supportEmail={supportEmail}
          />
        </SapIdSwitcher>
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
