import { AlertTriangle, CheckCircle2, UserPlus } from "lucide-react";
import { Form, Link, redirect, useNavigation } from "react-router";
import { BackLink } from "~/components/back-link";
import { RecordSummary } from "~/components/sap-id-record";
import { StatusButton } from "~/components/status-button";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { invalidateOverview } from "~/lib/overview.server";
import {
  addUser,
  getPerson,
  getSapIdRecord,
  normaliseEmail,
  parseSapId,
  parseUserForm,
  requireAdminEmail,
  UserChangeRejectedError,
  usersListUrl,
  type AddUserResult,
} from "~/lib/user-admin.server";
import { personPath } from "~/lib/user-links";
import type { Route } from "./+types/users.new";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Add user | AU Pension" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireAdminEmail(request);

  const params = new URL(request.url).searchParams;
  const back = usersListUrl(params.get("back"));
  // From the diagnosis page when an email isn't recognised. An email that is
  // already someone's gets more SAP IDs on their own page
  const email = normaliseEmail(params.get("email"));
  if (email && (await getPerson({ email }))) {
    throw redirect(personPath({ email }, back));
  }
  const sapIdParam = params.get("sapId")?.trim() ?? "";
  if (!sapIdParam) {
    return { sapIdParam, email, back, record: null, error: null };
  }
  const sapId = parseSapId(sapIdParam);
  if (sapId === null) {
    return {
      sapIdParam,
      email,
      back,
      record: null,
      error: "A SAP ID is a whole number, like 12345.",
    };
  }
  return {
    sapIdParam,
    email,
    back,
    record: await getSapIdRecord(sapId),
    error: null,
  };
}

type ActionData =
  | { ok: true; result: AddUserResult }
  | { ok: false; message: string };

export async function action({
  request,
}: Route.ActionArgs): Promise<ActionData> {
  const adminEmail = await requireAdminEmail(request);
  const parsed = parseUserForm(await request.formData());
  if ("error" in parsed) {
    return { ok: false, message: parsed.error };
  }

  try {
    const result = await addUser(parsed.fields, adminEmail);
    // New pensioners change the overview's figures and quality counts
    invalidateOverview();
    return { ok: true, result };
  } catch (error) {
    if (error instanceof UserChangeRejectedError) {
      return { ok: false, message: error.message };
    }
    throw error;
  }
}

function AddedCard({ result, back }: { result: AddUserResult; back: string }) {
  const ref = result.email
    ? { email: result.email }
    : { sapId: result.sapId };
  return (
    <Card className="border-primary/40 bg-primary/5">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <CheckCircle2 className="size-5 text-primary" />
          {result.outcome === "added"
            ? `Added ${result.fullName}`
            : `Added an email for ${result.fullName}`}
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          SAP ID {result.sapId}
          {result.email
            ? ` can now sign in with ${result.email}.`
            : " is now in the users table and on the statement search. Add an email to let them sign in."}
          {result.otherSapIds.length > 0 &&
            ` This email also opens SAP ID ${result.otherSapIds.join(
              ", "
            )}; they can switch between them on their statement.`}
        </p>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        <Button asChild size="sm">
          <Link to={personPath(ref, back)}>Open user</Link>
        </Button>
        <Button asChild size="sm" variant="outline">
          <Link to={`/statement?sapId=${result.sapId}`}>Open statement</Link>
        </Button>
        <Button asChild size="sm" variant="outline">
          <Link to="/users/new">Add another</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

const linkClass = "font-medium text-primary hover:underline";

export default function AddUser({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const { sapIdParam, email, back, record, error } = loaderData;
  const navigation = useNavigation();
  const isLooking =
    navigation.state === "loading" &&
    navigation.location.pathname === "/users/new";
  const isAdding = navigation.state === "submitting";

  const registeredEmails = [
    ...new Set(
      (record?.users ?? [])
        .map((row) => row.Email?.toLowerCase())
        .filter(Boolean)
    ),
  ] as string[];
  const knownName = record?.users.find((row) => row.FullName)?.FullName ?? "";

  return (
    <div className="space-y-6">
      <div>
        <BackLink to={back} label="Users" />
        <h1 className="text-2xl font-semibold">Add user</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Add a pensioner so their contributions show on a statement and they
          can sign in. Look up the SAP ID first to see what's already there. To
          give someone another SAP ID, open them in Users instead.
        </p>
      </div>

      {actionData?.ok && <AddedCard result={actionData.result} back={back} />}

      <Card>
        <CardContent className="space-y-4">
          <Form method="GET" className="flex flex-col gap-3 sm:flex-row">
            <Label htmlFor="sapId" className="sr-only">
              SAP ID
            </Label>
            <Input
              // Fresh input when moving between lookups with back and forward
              key={sapIdParam}
              id="sapId"
              name="sapId"
              inputMode="numeric"
              required
              defaultValue={sapIdParam}
              placeholder="SAP ID"
              autoComplete="off"
              className="sm:flex-1"
            />
            {email && <input type="hidden" name="email" value={email} />}
            <input type="hidden" name="back" value={back} />
            <StatusButton
              type="submit"
              status={isLooking ? "pending" : "idle"}
              disabled={isLooking}
            >
              Look up
            </StatusButton>
          </Form>

          {error && (
            <p className="flex gap-2 text-sm text-destructive">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              {error}
            </p>
          )}

          {record && <RecordSummary record={record} />}

          {record && registeredEmails.length > 0 && !actionData?.ok && (
            <p className="text-sm text-muted-foreground">
              Nothing to add: SAP ID {record.sapId} already opens with{" "}
              {registeredEmails.map((registered, index) => (
                <span key={registered}>
                  {index > 0 && ", "}
                  <Link
                    to={personPath({ email: registered }, back)}
                    className={linkClass}
                  >
                    {registered}
                  </Link>
                </span>
              ))}
              .
            </p>
          )}

          {record && registeredEmails.length === 0 && (
            <Form
              method="POST"
              // Start over with empty fields after each lookup or addition
              key={`${record.sapId}-${actionData?.ok ? "added" : ""}`}
              className="space-y-4"
            >
              <input type="hidden" name="sapId" value={record.sapId} />
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="fullName">Full name</Label>
                  <Input
                    id="fullName"
                    name="fullName"
                    required
                    maxLength={255}
                    defaultValue={knownName}
                    readOnly={knownName !== ""}
                    autoComplete="off"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    // Without an email they're on the statement search but
                    // can't sign in
                    required={record.users.length > 0}
                    maxLength={255}
                    defaultValue={email}
                    placeholder="name@africanunion.org"
                    autoComplete="off"
                  />
                  <p className="text-xs text-muted-foreground">
                    The address they sign in to Microsoft with.
                    {record.users.length === 0 &&
                      " Leave empty to add them without sign-in."}
                  </p>
                </div>
              </div>

              {actionData && !actionData.ok && (
                <div className="flex gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                  <p>{actionData.message}</p>
                </div>
              )}

              <StatusButton
                type="submit"
                status={isAdding ? "pending" : "idle"}
                disabled={isAdding}
              >
                <UserPlus />
                {record.users.length > 0 ? "Add email" : "Add to users"}
              </StatusButton>
            </Form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
