import { AlertTriangle, Loader2 } from "lucide-react";
import { useEffect, useRef } from "react";
import { Link, useFetcher } from "react-router";
import { ConfirmDialog } from "~/components/confirm-dialog";
import {
  badgeTone,
  tableBodyClass,
  tableHeaderClass,
} from "~/components/table-styles";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import type { Person, PersonSapId } from "~/lib/user-admin.server";
import { deletePersonPath, personPath, type PersonRef } from "~/lib/user-links";
import { formatAmount } from "~/lib/utils";
import type { action, loader } from "~/routes/users.delete";

// Whether the SAP ID is still in the users table after this person's rows
// go: it is if someone else (or a row without an email) still has it
function keptBy(item: PersonSapId) {
  if (item.otherEmails.length > 0) {
    return `Stays, under ${item.otherEmails.join(", ")}`;
  }
  if (item.blankRows > 0) {
    return "Stays, as a row without an email";
  }
  return null;
}

// What deleting a person does, SAP ID by SAP ID: on the delete dialog and
// the delete page
export function DeleteUserSummary({
  person,
  back,
}: {
  person: Person;
  back: string;
}) {
  const lost = person.sapIds.filter((item) => !keptBy(item));
  const lostContributions = lost.reduce(
    (sum, item) => sum + item.contributions,
    0
  );
  const lostTotal = lost.reduce((sum, item) => sum + item.total, 0);

  return (
    <div className="space-y-3">
      <div className="flex gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
        <AlertTriangle className="mt-0.5 size-4 shrink-0" />
        <p>
          {person.email &&
            `${person.email} will no longer open any statement. `}
          {lost.length > 0
            ? `${lostContributions.toLocaleString()} contributions ($${formatAmount(lostTotal)}) will be on no one's statement and will show under Quality as contributions with no pensioner.`
            : "Every SAP ID stays in the users table, so no money leaves a statement."}{" "}
          This can't be undone here.
        </p>
      </div>
      {person.email && (
        <p className="text-sm text-muted-foreground">
          To stop them signing in but keep their statements, clear the email on{" "}
          <Link
            to={personPath(person.ref, back)}
            className="font-medium text-primary hover:underline"
          >
            their page
          </Link>{" "}
          instead.
        </p>
      )}
      {person.sapIds.length > 0 && (
        <div className="overflow-hidden rounded-lg border">
          <Table>
            <TableHeader className={tableHeaderClass}>
              <TableRow>
                <TableHead>SAP ID</TableHead>
                <TableHead className="text-right">Contributions</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Afterwards</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className={tableBodyClass}>
              {person.sapIds.map((item) => {
                const kept = keptBy(item);
                return (
                  <TableRow key={item.sapId}>
                    <TableCell className="font-medium text-foreground">
                      {item.sapId}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {item.contributions.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      ${formatAmount(item.total)}
                    </TableCell>
                    <TableCell>
                      <Badge
                        className={
                          badgeTone[
                            kept
                              ? "neutral"
                              : item.contributions > 0
                              ? "danger"
                              : "warning"
                          ]
                        }
                      >
                        {kept ??
                          (item.contributions > 0
                            ? "Off every statement"
                            : "Removed")}
                      </Badge>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

// Closes the dialog once a delete has gone through. A successful delete
// redirects, which leaves the fetcher with no data; a refused one returns a
// message and the dialog stays open to show it
function CloseWhenDeleted({
  fetcher,
  close,
}: {
  fetcher: ReturnType<typeof useFetcher<typeof action>>;
  close: () => void;
}) {
  const wasSubmitting = useRef(false);
  useEffect(() => {
    if (fetcher.state === "submitting") {
      wasSubmitting.current = true;
    } else if (fetcher.state === "idle" && wasSubmitting.current) {
      wasSubmitting.current = false;
      if (!fetcher.data?.message) {
        close();
      }
    }
  }, [fetcher.state, fetcher.data, close]);
  return null;
}

// Delete button that asks in a dialog first. The dialog loads what will be
// deleted when it opens, and the delete only goes ahead if that is still
// what's in the database (see deletePerson)
export function DeleteUserDialog({
  personRef,
  name,
  back,
  trigger,
}: {
  personRef: PersonRef;
  name: string | null;
  back: string;
  trigger: (open: () => void) => React.ReactNode;
}) {
  const preview = useFetcher<typeof loader>();
  const deletion = useFetcher<typeof action>();
  const path = deletePersonPath(personRef, back);
  const person = preview.data?.person;
  const isDeleting = deletion.state !== "idle";

  // A refused delete means the rows changed: show them as they are now
  useEffect(() => {
    if (deletion.state === "idle" && deletion.data?.message) {
      preview.load(path);
    }
    // Only when a delete comes back, not when the preview reloads
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deletion.state, deletion.data]);

  return (
    <ConfirmDialog
      title={`Delete ${name ?? "this user"}?`}
      className="max-w-2xl"
      onOpen={() => preview.load(path)}
      trigger={trigger}
      confirm={(close) => (
        <deletion.Form method="POST" action={path}>
          <CloseWhenDeleted fetcher={deletion} close={close} />
          <input type="hidden" name="name" value={name ?? ""} />
          <input
            type="hidden"
            name="version"
            value={preview.data?.version ?? ""}
          />
          <Button
            type="submit"
            variant="destructive"
            className="w-full"
            disabled={!person || preview.state !== "idle" || isDeleting}
          >
            {isDeleting && <Loader2 className="animate-spin" />}
            Delete
          </Button>
        </deletion.Form>
      )}
    >
      <div className="space-y-3">
        {deletion.data?.message && (
          <p className="flex gap-2 text-destructive">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            {deletion.data.message}
          </p>
        )}
        {person ? (
          <DeleteUserSummary person={person} back={back} />
        ) : preview.state !== "idle" ? (
          <p className="flex items-center gap-2">
            <Loader2 className="size-4 animate-spin" />
            Checking what will be deleted…
          </p>
        ) : (
          <p>
            No one in the users table matches this user any more; someone may
            have changed or deleted them.
          </p>
        )}
      </div>
    </ConfirmDialog>
  );
}
