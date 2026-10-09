import { CheckCircle2, Pencil, Search, Trash2, UserPlus } from "lucide-react";
import { Form, Link, useNavigation } from "react-router";
import { DeleteUserDialog } from "~/components/delete-user";
import { StatusButton } from "~/components/status-button";
import {
  badgeTone,
  tableBodyClass,
  tableHeaderClass,
} from "~/components/table-styles";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card, CardContent } from "~/components/ui/card";
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
import {
  listPeople,
  requireAdminEmail,
  usersListUrl,
  USERS_PAGE_SIZE,
  type PeopleFilter,
} from "~/lib/user-admin.server";
import { personPath } from "~/lib/user-links";
import { cn } from "~/lib/utils";
import type { Route } from "./+types/users._index";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Users | AU Pension" }];
}

const filters: Array<{ value: PeopleFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "no-email", label: "No email" },
  { value: "several", label: "Several SAP IDs" },
  { value: "duplicates", label: "Duplicate rows" },
];

export async function loader({ request }: Route.LoaderArgs) {
  await requireAdminEmail(request);

  const url = new URL(request.url);
  const params = url.searchParams;
  const query = params.get("q")?.trim() ?? "";
  const filter =
    filters.find((option) => option.value === params.get("filter"))?.value ??
    "all";
  let page = Math.max(1, Math.floor(Number(params.get("page")) || 1));
  let { rows, total } = await listPeople({ query, filter, page });
  // Deleting the last person on the last page leaves it empty: show the page
  // before it instead
  if (rows.length === 0 && total > 0 && page > 1) {
    page = Math.ceil(total / USERS_PAGE_SIZE);
    ({ rows, total } = await listPeople({ query, filter, page }));
  }
  // For the person and delete pages to come back to this list as it is
  if (page > 1) {
    params.set("page", String(page));
  } else {
    params.delete("page");
  }
  const back = usersListUrl(`${url.pathname}${url.search}`);

  // Set by the delete page when it sends the admin back here
  const deleted = params.get("deleted");
  const notice = deleted ? `Deleted ${deleted}.` : null;

  const pages = Math.max(1, Math.ceil(total / USERS_PAGE_SIZE));
  return { query, filter, page, pages, rows, total, notice, back };
}

export default function Users({ loaderData }: Route.ComponentProps) {
  const { query, filter, page, pages, rows, total, notice, back } =
    loaderData;
  const navigation = useNavigation();
  const isSearching =
    navigation.state === "loading" &&
    navigation.location.pathname === "/users";

  // Keeps the search and filter when moving between pages and filters
  const href = (changes: Record<string, string | number>) => {
    const params = new URLSearchParams();
    const next = { q: query, filter, page: 1, ...changes };
    if (next.q) params.set("q", String(next.q));
    if (next.filter !== "all") params.set("filter", String(next.filter));
    if (Number(next.page) > 1) params.set("page", String(next.page));
    const search = params.toString();
    return search ? `/users?${search}` : "/users";
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Users</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Everyone who can have a statement. A person signs in with their
            email and sees the statements of all their SAP IDs.
          </p>
        </div>
        <Button asChild className="self-start">
          <Link to="/users/new">
            <UserPlus />
            Add user
          </Link>
        </Button>
      </div>

      {notice && (
        <div className="flex items-center gap-3 rounded-xl border border-primary/40 bg-primary/5 px-4 py-3 text-sm">
          <CheckCircle2 className="size-4 shrink-0 text-primary" />
          <p>{notice}</p>
        </div>
      )}

      <Card className="gap-4 overflow-hidden pb-0">
        <CardContent className="space-y-4">
          <Form method="GET" className="flex flex-col gap-3 sm:flex-row">
            <Label htmlFor="q" className="sr-only">
              Search
            </Label>
            <Input
              // Fresh input when moving between searches with back and forward
              key={query}
              id="q"
              name="q"
              type="search"
              defaultValue={query}
              placeholder="Search by name, email or SAP ID"
              autoComplete="off"
              className="sm:flex-1"
            />
            {filter !== "all" && (
              <input type="hidden" name="filter" value={filter} />
            )}
            <StatusButton
              type="submit"
              status={isSearching ? "pending" : "idle"}
              disabled={isSearching}
            >
              <Search />
              Search
            </StatusButton>
          </Form>

          <div className="flex flex-wrap items-center gap-2">
            {filters.map((option) => (
              <Button
                key={option.value}
                asChild
                size="sm"
                variant={option.value === filter ? "default" : "outline"}
              >
                <Link to={href({ filter: option.value })}>{option.label}</Link>
              </Button>
            ))}
            <span className="ml-auto text-sm text-muted-foreground">
              {total.toLocaleString()} {total === 1 ? "person" : "people"}
            </span>
          </div>
        </CardContent>

        <CardContent
          className={cn(
            "border-t p-0 transition-opacity",
            isSearching && "opacity-50"
          )}
        >
          {rows.length === 0 ? (
            <p className="px-6 py-6 text-sm text-muted-foreground">
              No users match.{" "}
              {query && (
                <>
                  If they're missing,{" "}
                  <Link
                    to={
                      /^\d+$/.test(query)
                        ? `/users/new?sapId=${query}`
                        : "/users/new"
                    }
                    className="font-medium text-primary hover:underline"
                  >
                    add them
                  </Link>
                  .
                </>
              )}
            </p>
          ) : (
            <Table>
              <TableHeader className={tableHeaderClass}>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>SAP IDs</TableHead>
                  <TableHead className="w-32 text-right">
                    Contributions
                  </TableHead>
                  <TableHead className="w-40 text-right">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className={tableBodyClass}>
                {rows.map((row) => (
                  <TableRow key={row.email ?? `sap-${row.sapIds[0]?.sapId}`}>
                    <TableCell>
                      <Link
                        to={personPath(row.ref, back)}
                        className="font-medium hover:underline"
                      >
                        {row.fullName ?? "No name"}
                      </Link>
                    </TableCell>
                    <TableCell className="break-all">
                      {row.email ?? (
                        <Badge className={badgeTone.warning}>No email</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1.5">
                        {row.sapIds.map(({ sapId, duplicate }) => (
                          <Link
                            key={sapId}
                            to={`/statement?sapId=${sapId}`}
                            title={
                              duplicate
                                ? "This SAP ID has more than one row; open the user to remove the duplicates"
                                : "Open statement"
                            }
                          >
                            <Badge
                              className={cn(
                                "tabular-nums",
                                badgeTone[duplicate ? "warning" : "neutral"]
                              )}
                            >
                              {sapId}
                            </Badge>
                          </Link>
                        ))}
                        {row.sapIds.some((item) => item.duplicate) && (
                          <Badge className={badgeTone.warning}>
                            Duplicate rows
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.contributions.toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Button asChild size="sm" variant="ghost">
                          <Link to={personPath(row.ref, back)}>
                            <Pencil />
                            Edit
                          </Link>
                        </Button>
                        <DeleteUserDialog
                          personRef={row.ref}
                          name={row.fullName}
                          back={back}
                          trigger={(open) => (
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="text-destructive hover:text-destructive"
                              onClick={open}
                            >
                              <Trash2 />
                              Delete
                            </Button>
                          )}
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>

        {pages > 1 && (
          <CardContent className="flex items-center justify-between border-t py-3 text-sm">
            <span className="text-muted-foreground">
              Page {page} of {pages}
            </span>
            <div className="flex gap-2">
              <Button
                asChild={page > 1}
                size="sm"
                variant="outline"
                disabled={page <= 1}
              >
                {page > 1 ? (
                  <Link to={href({ page: page - 1 })}>Previous</Link>
                ) : (
                  "Previous"
                )}
              </Button>
              <Button
                asChild={page < pages}
                size="sm"
                variant="outline"
                disabled={page >= pages}
              >
                {page < pages ? (
                  <Link to={href({ page: page + 1 })}>Next</Link>
                ) : (
                  "Next"
                )}
              </Button>
            </div>
          </CardContent>
        )}
      </Card>
    </div>
  );
}
