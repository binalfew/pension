import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  Layers,
  Plus,
  Save,
  Trash2,
  X,
} from "lucide-react";
import { Form, Link, redirect, useNavigation } from "react-router";
import { BackLink } from "~/components/back-link";
import { ConfirmDialog } from "~/components/confirm-dialog";
import { DeleteUserDialog } from "~/components/delete-user";
import { StatusButton } from "~/components/status-button";
import {
  badgeTone,
  tableBodyClass,
  tableHeaderClass,
} from "~/components/table-styles";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
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
import { invalidateOverview } from "~/lib/overview.server";
import {
  addSapIdToPerson,
  getPerson,
  parsePersonDetails,
  parsePersonRef,
  parseSapId,
  removeDuplicateRows,
  removeSapIdFromPerson,
  requireAdminEmail,
  updatePerson,
  UserChangeRejectedError,
  usersListUrl,
  type PersonSapId,
} from "~/lib/user-admin.server";
import { personPath } from "~/lib/user-links";
import { cn, formatAmount, formatPeriod } from "~/lib/utils";
import type { Route } from "./+types/users.edit";

export function meta({ data }: Route.MetaArgs) {
  const name = data?.person?.fullName;
  return [{ title: `${name ? name : "User"} | AU Pension` }];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireAdminEmail(request);
  const params = new URL(request.url).searchParams;
  const ref = parsePersonRef(params);
  return {
    person: ref ? await getPerson(ref) : null,
    back: usersListUrl(params.get("back")),
  };
}

type ActionData = { ok: boolean; message: string };

export async function action({
  request,
}: Route.ActionArgs): Promise<ActionData> {
  const adminEmail = await requireAdminEmail(request);
  const params = new URL(request.url).searchParams;
  const ref = parsePersonRef(params);
  const back = usersListUrl(params.get("back"));
  if (!ref) {
    throw redirect(back);
  }
  const formData = await request.formData();
  const intent = formData.get("intent");
  const sapId = parseSapId(formData.get("sapId"));

  try {
    if (intent === "save") {
      const parsed = parsePersonDetails(formData);
      if ("error" in parsed) {
        return { ok: false, message: parsed.error };
      }
      const result = await updatePerson(ref, parsed.fields, adminEmail);
      invalidateOverview();
      // A new email (or none) moves the person to another page
      if (result.ref === null) {
        throw redirect(back);
      }
      if (personPath(result.ref) !== personPath(ref)) {
        throw redirect(personPath(result.ref, back));
      }
      return { ok: true, message: "Saved." };
    }

    if (sapId === null) {
      return { ok: false, message: "A SAP ID is a whole number, like 12345." };
    }

    if (intent === "add-sap-id" && "email" in ref) {
      const result = await addSapIdToPerson(ref.email, sapId, adminEmail);
      invalidateOverview();
      return {
        ok: true,
        message: `Added SAP ID ${sapId}. Signing in with ${ref.email} now opens it too${
          result.outcome === "emailAdded"
            ? "; it was in Users without an email"
            : ""
        }.`,
      };
    }

    if (intent === "remove" && "email" in ref) {
      const { keptWithoutEmail } = await removeSapIdFromPerson(
        ref.email,
        sapId,
        adminEmail
      );
      invalidateOverview();
      return {
        ok: true,
        message: keptWithoutEmail
          ? `Removed SAP ID ${sapId}. It stays in Users without an email, so its statement is kept.`
          : `Removed SAP ID ${sapId}. Its other row stays in Users.`,
      };
    }

    if (intent === "remove-duplicates") {
      const removed = await removeDuplicateRows(ref, sapId, adminEmail);
      invalidateOverview();
      return {
        ok: true,
        message: `Removed ${removed} duplicate ${
          removed === 1 ? "row" : "rows"
        } of SAP ID ${sapId}.`,
      };
    }
  } catch (error) {
    if (error instanceof UserChangeRejectedError) {
      return { ok: false, message: error.message };
    }
    throw error;
  }

  return { ok: false, message: "Unknown action." };
}

function periodRange(first: number | null, last: number | null) {
  if (first === null || last === null) {
    return "—";
  }
  return first === last
    ? formatPeriod(first)
    : `${formatPeriod(first)} – ${formatPeriod(last)}`;
}

// Extra rows this person could do without: their own beyond one and, with
// an email, the SAP ID's rows without one
const hasDuplicates = (item: PersonSapId) =>
  item.ownRows > 1 || item.blankRows > 0;

function Banner({ ok, message }: ActionData) {
  return (
    <div
      className={cn(
        "flex gap-3 rounded-xl border px-4 py-3 text-sm",
        ok
          ? "border-primary/40 bg-primary/5"
          : "border-destructive/30 bg-destructive/5 text-destructive"
      )}
    >
      {ok ? (
        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" />
      ) : (
        <AlertTriangle className="mt-0.5 size-4 shrink-0" />
      )}
      <p>{message}</p>
    </div>
  );
}

export default function EditUser({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const { person, back } = loaderData;
  const navigation = useNavigation();
  const pendingIntent =
    navigation.state === "submitting"
      ? String(navigation.formData?.get("intent"))
      : null;
  const pendingSapId =
    navigation.state === "submitting"
      ? String(navigation.formData?.get("sapId"))
      : null;

  if (!person) {
    return (
      <div className="space-y-6">
        <div>
          <BackLink to={back} label="Users" />
          <h1 className="text-2xl font-semibold">User not found</h1>
        </div>
        <Card>
          <CardContent className="text-sm text-muted-foreground">
            No one in the users table matches this link any more; someone may
            have changed or deleted them. Find them again in{" "}
            <Link to={back} className="font-medium text-primary hover:underline">
              Users
            </Link>
            .
          </CardContent>
        </Card>
      </div>
    );
  }

  const selfPath = personPath(person.ref, back);
  const canRemove = person.email !== null && person.sapIds.length > 1;

  return (
    <div className="space-y-6">
      <div>
        <BackLink to={back} label="Users" />
        <h1 className="text-2xl font-semibold">
          {person.fullName ?? "No name"}
        </h1>
        <p className="mt-1 break-all text-sm text-muted-foreground">
          {person.email ?? "No email, so they can't sign in"}
          {" · "}
          {person.sapIds.length}{" "}
          {person.sapIds.length === 1 ? "SAP ID" : "SAP IDs"}
        </p>
      </div>

      {actionData && <Banner {...actionData} />}

      <Card className="gap-4">
        <CardHeader>
          <CardTitle>Details</CardTitle>
        </CardHeader>
        <CardContent>
          <Form method="POST" action={selfPath} className="space-y-4">
            <input type="hidden" name="intent" value="save" />
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="fullName">Full name</Label>
                <Input
                  id="fullName"
                  name="fullName"
                  required
                  maxLength={255}
                  defaultValue={person.fullName ?? ""}
                  autoComplete="off"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  maxLength={255}
                  defaultValue={person.email ?? ""}
                  placeholder="name@africanunion.org"
                  autoComplete="off"
                />
                <p className="text-xs text-muted-foreground">
                  The address they sign in to Microsoft with. Changes apply to
                  all their SAP IDs
                  {person.email
                    ? "; leaving it empty means they can't sign in."
                    : "."}
                </p>
              </div>
            </div>
            <StatusButton
              type="submit"
              status={pendingIntent === "save" ? "pending" : "idle"}
              disabled={pendingIntent !== null}
            >
              <Save />
              Save
            </StatusButton>
          </Form>
        </CardContent>
      </Card>

      <Card className="gap-4 overflow-hidden pb-0">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Layers className="size-4 text-muted-foreground" />
            SAP IDs
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            {person.email
              ? "Signing in opens the most recently active one first, with a switcher for the others."
              : "Add an email above so they can sign in; then you can add more SAP IDs."}
          </p>
        </CardHeader>
        <CardContent className="border-t p-0">
          {person.sapIds.length > 0 && (
            <Table>
              <TableHeader className={tableHeaderClass}>
                <TableRow>
                  <TableHead className="w-32">SAP ID</TableHead>
                  <TableHead>Office</TableHead>
                  <TableHead>Period</TableHead>
                  <TableHead className="text-right">Contributions</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className={cn(tableBodyClass, "[&_td]:align-top")}>
                {person.sapIds.map((item) => (
                  <TableRow key={item.sapId}>
                    <TableCell>
                      <Link
                        to={`/statement?sapId=${item.sapId}`}
                        className="font-medium text-primary hover:underline"
                      >
                        {item.sapId}
                      </Link>
                      <div className="mt-1 flex flex-col items-start gap-1">
                        {hasDuplicates(item) && (
                          <Badge className={badgeTone.warning}>
                            {item.ownRows + item.blankRows} rows
                          </Badge>
                        )}
                        {item.otherEmails.length > 0 && (
                          <Badge
                            className={cn(badgeTone.info, "whitespace-normal")}
                          >
                            Also {item.otherEmails.join(", ")}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>{item.office ?? "—"}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      {periodRange(item.firstPeriod, item.lastPeriod)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {item.contributions.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      ${formatAmount(item.total)}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        {hasDuplicates(item) && (
                          <Form method="POST" action={selfPath}>
                            <input
                              type="hidden"
                              name="intent"
                              value="remove-duplicates"
                            />
                            <input
                              type="hidden"
                              name="sapId"
                              value={item.sapId}
                            />
                            <StatusButton
                              type="submit"
                              size="sm"
                              variant="ghost"
                              status={
                                pendingIntent === "remove-duplicates" &&
                                pendingSapId === String(item.sapId)
                                  ? "pending"
                                  : "idle"
                              }
                              disabled={pendingIntent !== null}
                              title="Keep one row for this SAP ID"
                            >
                              <Copy />
                              Remove duplicates
                            </StatusButton>
                          </Form>
                        )}
                        {canRemove && (
                          <ConfirmDialog
                            title={`Remove SAP ID ${item.sapId}?`}
                            trigger={(open) => (
                              <StatusButton
                                type="button"
                                size="sm"
                                variant="ghost"
                                className="text-destructive hover:text-destructive"
                                status={
                                  pendingIntent === "remove" &&
                                  pendingSapId === String(item.sapId)
                                    ? "pending"
                                    : "idle"
                                }
                                disabled={pendingIntent !== null}
                                onClick={open}
                              >
                                <X />
                                Remove
                              </StatusButton>
                            )}
                            confirm={(close) => (
                              <Form
                                method="POST"
                                action={selfPath}
                                onSubmit={close}
                              >
                                <input
                                  type="hidden"
                                  name="intent"
                                  value="remove"
                                />
                                <input
                                  type="hidden"
                                  name="sapId"
                                  value={item.sapId}
                                />
                                <Button
                                  type="submit"
                                  variant="destructive"
                                  className="w-full"
                                >
                                  Remove
                                </Button>
                              </Form>
                            )}
                          >
                            <p>
                              Signing in with {person.email} will no longer
                              open SAP ID {item.sapId}.{" "}
                              {item.blankRows > 0 ||
                              item.otherEmails.length > 0
                                ? "The SAP ID's other row stays in Users."
                                : "The SAP ID stays in Users without an email, so its statement and contributions are kept."}
                            </p>
                          </ConfirmDialog>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
        {person.email && (
          <CardContent className="border-t py-4">
            <Form
              method="POST"
              action={selfPath}
              // Empty again after each SAP ID is added
              key={actionData?.ok ? actionData.message : "add"}
              className="flex flex-col gap-3 sm:flex-row sm:items-end"
            >
              <input type="hidden" name="intent" value="add-sap-id" />
              <div className="space-y-2 sm:flex-1">
                <Label htmlFor="newSapId">Add a SAP ID</Label>
                <Input
                  id="newSapId"
                  name="sapId"
                  inputMode="numeric"
                  required
                  placeholder="SAP ID"
                  autoComplete="off"
                />
              </div>
              <StatusButton
                type="submit"
                status={pendingIntent === "add-sap-id" ? "pending" : "idle"}
                disabled={pendingIntent !== null}
              >
                <Plus />
                Add SAP ID
              </StatusButton>
            </Form>
          </CardContent>
        )}
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            Delete this user and all their rows from the users table.
          </p>
          <DeleteUserDialog
            personRef={person.ref}
            name={person.fullName}
            back={back}
            trigger={(open) => (
              <Button
                type="button"
                variant="outline"
                className="self-start text-destructive hover:text-destructive"
                onClick={open}
              >
                <Trash2 />
                Delete user
              </Button>
            )}
          />
        </CardContent>
      </Card>
    </div>
  );
}
