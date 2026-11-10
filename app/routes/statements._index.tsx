import { ChevronDown, Download, FileDown, Search } from "lucide-react";
import { useState } from "react";
import { Form, Link, useNavigation } from "react-router";
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
  findStatementPeople,
  listOffices,
} from "~/lib/bulk-statements.server";
import { requireAdminEmail } from "~/lib/user-admin.server";
import { cn, formatPeriod } from "~/lib/utils";
import type { Route } from "./+types/statements._index";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Bulk statements | AU Pension" }];
}

const PAGE_SIZE = 100;

export async function loader({ request }: Route.LoaderArgs) {
  await requireAdminEmail(request);

  const params = new URL(request.url).searchParams;
  const filter = {
    query: params.get("q")?.trim() ?? "",
    office: params.get("office") ?? "",
    noEmailOnly: params.get("noEmail") === "1",
  };
  // Nothing is looked up until there is an office or a search to narrow it
  const matching =
    filter.office || filter.query
      ? await findStatementPeople({ filter })
      : null;
  const pages = Math.max(1, Math.ceil((matching?.length ?? 0) / PAGE_SIZE));
  const page = Math.min(
    pages,
    Math.max(1, Math.floor(Number(params.get("page")) || 1))
  );

  return {
    filter,
    offices: await listOffices(),
    rows: matching?.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE) ?? null,
    total: matching?.length ?? 0,
    page,
    pages,
  };
}

export default function BulkStatements({ loaderData }: Route.ComponentProps) {
  const { filter, offices, rows, total, page, pages } = loaderData;
  const navigation = useNavigation();
  const isSearching =
    navigation.state === "loading" &&
    navigation.location.pathname === "/statements";
  // Kept while searching and paging, so people found one at a time can be
  // downloaded together
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const toggle = (key: string, on: boolean) =>
    setSelected((current) => {
      const next = new Set(current);
      if (on) {
        next.add(key);
      } else {
        next.delete(key);
      }
      return next;
    });
  const allOnPage =
    !!rows && rows.length > 0 && rows.every((row) => selected.has(row.key));

  const href = (changes: Record<string, string | number>) => {
    const params = new URLSearchParams();
    const next = {
      q: filter.query,
      office: filter.office,
      noEmail: filter.noEmailOnly ? "1" : "",
      page: 1,
      ...changes,
    };
    if (next.q) params.set("q", String(next.q));
    if (next.office) params.set("office", String(next.office));
    if (next.noEmail) params.set("noEmail", "1");
    if (Number(next.page) > 1) params.set("page", String(next.page));
    const search = params.toString();
    return search ? `/statements?${search}` : "/statements";
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Bulk statements</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Download statement PDFs to email to people who cannot sign in. Each
          person gets one PDF covering all their SAP IDs, and the ZIP includes
          index.csv with their names and emails.
        </p>
      </div>

      <Card className="gap-4 overflow-hidden pb-0">
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <Form method="GET" className="flex flex-col gap-3 lg:contents">
              <Label htmlFor="q" className="sr-only">
                Search
              </Label>
              <Input
                key={filter.query}
                id="q"
                name="q"
                type="search"
                defaultValue={filter.query}
                placeholder="Search by name, email or SAP ID"
                autoComplete="off"
                className="lg:min-w-48 lg:flex-1"
              />
              <div className="relative lg:w-60">
                <Label htmlFor="office" className="sr-only">
                  Office
                </Label>
                <select
                  key={filter.office}
                  id="office"
                  name="office"
                  defaultValue={filter.office}
                  className="h-9 w-full cursor-pointer appearance-none rounded-md border border-input bg-background pr-9 pl-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                >
                  <option value="">Select an office</option>
                  {offices.map((office) => (
                    <option key={office} value={office}>
                      {office}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground" />
              </div>
              <label className="flex h-9 cursor-pointer items-center gap-2 text-sm whitespace-nowrap">
                <input
                  key={String(filter.noEmailOnly)}
                  type="checkbox"
                  name="noEmail"
                  value="1"
                  defaultChecked={filter.noEmailOnly}
                  className="size-4 accent-primary"
                />
                No email only
              </label>
              <StatusButton
                type="submit"
                status={isSearching ? "pending" : "idle"}
                disabled={isSearching}
              >
                <Search />
                Filter
              </StatusButton>
            </Form>
            <div className="flex gap-2">
              {/* Plain forms: the browser downloads the ZIP and stays here */}
              <form method="post" action="/statements/download">
                {[...selected].map((key) => (
                  <input key={key} type="hidden" name="person" value={key} />
                ))}
                <Button
                  type="submit"
                  variant="outline"
                  disabled={selected.size === 0}
                >
                  <FileDown />
                  {selected.size > 0
                    ? `Download ${selected.size.toLocaleString()} selected`
                    : "Download selected"}
                </Button>
              </form>
              {selected.size > 0 && (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setSelected(new Set())}
                >
                  Clear
                </Button>
              )}
              <form method="post" action="/statements/download">
                <input type="hidden" name="scope" value="all" />
                <input type="hidden" name="q" value={filter.query} />
                <input type="hidden" name="office" value={filter.office} />
                {filter.noEmailOnly && (
                  <input type="hidden" name="noEmail" value="1" />
                )}
                <Button
                  type="submit"
                  disabled={!filter.office || total === 0}
                  title={
                    filter.office
                      ? undefined
                      : "Choose an office to download everyone in it"
                  }
                >
                  <Download />
                  {filter.office
                    ? `Download all ${total.toLocaleString()}`
                    : "Download all"}
                </Button>
              </form>
            </div>
          </div>
          {filter.office && total > 300 && (
            <p className="text-xs text-muted-foreground">
              The download starts right away and fills in as statements are
              made. A large office like HQ takes a minute or two.
            </p>
          )}
        </CardContent>

        <CardContent
          className={cn(
            "border-t p-0 transition-opacity",
            isSearching && "opacity-50"
          )}
        >
          {!rows ? (
            <p className="px-6 py-6 text-sm text-muted-foreground">
              Select an office or search for a person to see their statements.
            </p>
          ) : rows.length === 0 ? (
            <p className="px-6 py-6 text-sm text-muted-foreground">
              No one matches.
            </p>
          ) : (
            <Table>
              <TableHeader className={tableHeaderClass}>
                <TableRow>
                  <TableHead className="w-10">
                    <input
                      type="checkbox"
                      aria-label="Select everyone on this page"
                      checked={allOnPage}
                      onChange={(event) =>
                        setSelected((current) => {
                          const next = new Set(current);
                          for (const row of rows ?? []) {
                            if (event.target.checked) {
                              next.add(row.key);
                            } else {
                              next.delete(row.key);
                            }
                          }
                          return next;
                        })
                      }
                      className="size-4 cursor-pointer accent-primary align-middle"
                    />
                  </TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>SAP IDs</TableHead>
                  <TableHead>Office</TableHead>
                  <TableHead className="text-right">Last contribution</TableHead>
                  <TableHead className="w-24 text-right">
                    <span className="sr-only">Download</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className={tableBodyClass}>
                {rows.map((row) => (
                  <TableRow
                    key={row.key}
                    data-state={selected.has(row.key) ? "selected" : undefined}
                  >
                    <TableCell>
                      <input
                        type="checkbox"
                        aria-label={`Select ${row.fullName ?? row.sapIds[0]}`}
                        checked={selected.has(row.key)}
                        onChange={(event) =>
                          toggle(row.key, event.target.checked)
                        }
                        className="size-4 cursor-pointer accent-primary align-middle"
                      />
                    </TableCell>
                    <TableCell className="font-medium">
                      {row.fullName ?? "No name"}
                    </TableCell>
                    <TableCell className="break-all">
                      {row.email ?? (
                        <Badge className={badgeTone.warning}>No email</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1.5">
                        {row.sapIds.map((sapId) => (
                          <Link
                            key={sapId}
                            to={`/statement?sapId=${sapId}`}
                            title="Open statement"
                          >
                            <Badge
                              className={cn("tabular-nums", badgeTone.neutral)}
                            >
                              {sapId}
                            </Badge>
                          </Link>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>{row.office}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.lastPeriod ? formatPeriod(row.lastPeriod) : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button asChild size="sm" variant="ghost">
                        <a
                          href={`/api/pdf?sapId=${row.sapIds[0]}${
                            row.sapIds.length > 1 ? "&view=combined" : ""
                          }`}
                          download
                        >
                          <FileDown />
                          PDF
                        </a>
                      </Button>
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
