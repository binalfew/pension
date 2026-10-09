import { AlertTriangle, Trash2 } from "lucide-react";
import { Form, Link, redirect, useNavigation } from "react-router";
import { BackLink } from "~/components/back-link";
import { DeleteUserSummary } from "~/components/delete-user";
import { StatusButton } from "~/components/status-button";
import { Button } from "~/components/ui/button";
import { Card, CardContent } from "~/components/ui/card";
import { invalidateOverview } from "~/lib/overview.server";
import {
  deletePerson,
  getPerson,
  parsePersonRef,
  personVersion,
  requireAdminEmail,
  UserChangeRejectedError,
  usersListUrl,
} from "~/lib/user-admin.server";
import { deletePersonPath } from "~/lib/user-links";
import type { Route } from "./+types/users.delete";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Delete user | AU Pension" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireAdminEmail(request);
  const params = new URL(request.url).searchParams;
  const ref = parsePersonRef(params);
  const person = ref ? await getPerson(ref) : null;
  return {
    person,
    // Sent back on confirm, so the delete only goes ahead if the rows are
    // still the ones shown here
    version: person ? personVersion(person) : null,
    back: usersListUrl(params.get("back")),
  };
}

export async function action({ request }: Route.ActionArgs) {
  const adminEmail = await requireAdminEmail(request);
  const params = new URL(request.url).searchParams;
  const ref = parsePersonRef(params);
  const back = params.get("back");
  if (!ref) {
    throw redirect(usersListUrl(back));
  }
  const formData = await request.formData();
  const name = String(formData.get("name") ?? "");

  try {
    await deletePerson(ref, String(formData.get("version") ?? ""), adminEmail);
    invalidateOverview();
    throw redirect(
      usersListUrl(back, {
        deleted:
          name || ("email" in ref ? ref.email : `SAP ID ${ref.sapId}`),
      })
    );
  } catch (error) {
    if (error instanceof UserChangeRejectedError) {
      return { message: error.message };
    }
    throw error;
  }
}

export default function DeleteUser({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const { person, version, back } = loaderData;
  const navigation = useNavigation();
  const isDeleting = navigation.state === "submitting";

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


  return (
    <div className="space-y-6">
      <div>
        <BackLink to={back} label="Users" />
        <h1 className="text-2xl font-semibold">
          Delete {person.fullName ?? "this user"}?
        </h1>
        <p className="mt-1 break-all text-sm text-muted-foreground">
          {person.email ?? "No email"}
        </p>
      </div>

      <Card className="gap-4 overflow-hidden pb-0">
        <CardContent>
          <DeleteUserSummary person={person} back={back} />
        </CardContent>
        <CardContent className="space-y-3 border-t py-4">
          {actionData && (
            <p className="flex gap-2 text-sm text-destructive">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              {actionData.message}
            </p>
          )}
          <Form
            method="POST"
            action={deletePersonPath(person.ref, back)}
            className="flex flex-wrap gap-2"
          >
            <input type="hidden" name="name" value={person.fullName ?? ""} />
            <input type="hidden" name="version" value={version ?? ""} />
            <StatusButton
              type="submit"
              variant="destructive"
              status={isDeleting ? "pending" : "idle"}
              disabled={isDeleting}
            >
              <Trash2 />
              Delete
            </StatusButton>
            <Button asChild variant="outline">
              <Link to={back}>Cancel</Link>
            </Button>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
