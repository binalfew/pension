import {
  AlertTriangle,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  Download,
  FileSpreadsheet,
  PencilLine,
  Plus,
  Rows3,
  Search,
  UserX,
  type LucideIcon,
} from "lucide-react";
import { useState } from "react";
import {
  badgeTone,
  iconTone,
  scrollingTableClass,
  stickyTableHeaderClass,
  tableBodyClass,
  tableHeaderClass,
  type BadgeTone,
} from "~/components/table-styles";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import type {
  PreviewRowStatus,
  UploadPreview,
} from "~/lib/contribution-upload.server";
import { downloadCsv } from "~/lib/csv";
import { cn, formatAmount, formatPeriod } from "~/lib/utils";

const PAGE_SIZE = 50;

type Filter = PreviewRowStatus | "all" | "missing-user";

// Valid rows and rejected rows in one list, in Excel order
type DisplayRow = {
  excelRow: number;
  status: PreviewRowStatus;
  sapId: string;
  inUsers: boolean;
  forPeriod: string;
  inPeriod: string;
  type: string;
  office: string;
  oldOffice: string | null;
  amount: string;
  oldAmount: string | null;
  message: string | null;
};

const STATUS: Record<PreviewRowStatus, { label: string; tone: BadgeTone }> = {
  new: { label: "New", tone: "success" },
  changed: { label: "Changed", tone: "warning" },
  unchanged: { label: "Already loaded", tone: "neutral" },
  error: { label: "Error", tone: "danger" },
};

function StatusBadge({ status }: { status: PreviewRowStatus }) {
  return (
    <Badge className={badgeTone[STATUS[status].tone]}>
      {STATUS[status].label}
    </Badge>
  );
}

function ErrorAlert({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
      <AlertTriangle className="mt-0.5 size-4 shrink-0" />
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function toDisplayRows(preview: UploadPreview): DisplayRow[] {
  const { contributionTypes, offices } = preview;
  const typeName = (id: number) => contributionTypes[id] ?? String(id);
  const officeName = (id: number | null) =>
    id === null ? "—" : (offices[id] ?? String(id));

  const valid: DisplayRow[] = preview.rows.map((row) => ({
    excelRow: row.excelRow,
    status: row.status,
    sapId: String(row.SAPID),
    inUsers: row.inUsers,
    forPeriod: formatPeriod(row.ForPeriod),
    inPeriod: formatPeriod(row.InPeriod),
    type: typeName(row.ContributionTypeID),
    office: officeName(row.OfficeID),
    oldOffice:
      row.status === "changed" && row.OldOfficeID !== row.OfficeID
        ? officeName(row.OldOfficeID)
        : null,
    amount: formatAmount(row.Amount),
    oldAmount:
      row.OldAmount !== null && row.OldAmount !== row.Amount
        ? formatAmount(row.OldAmount)
        : null,
    message: null,
  }));

  const rejected: DisplayRow[] = preview.errors.flatMap((error) =>
    error.raw && error.excelRow !== null
      ? [
          {
            excelRow: error.excelRow,
            status: "error" as const,
            sapId: error.raw.SAPID,
            inUsers: true,
            forPeriod: error.raw.ForPeriod,
            inPeriod: error.raw.InPeriod,
            type: error.raw.ContributionTypeID,
            office: error.raw.OfficeID,
            oldOffice: null,
            amount: error.raw.Amount,
            oldAmount: null,
            message: error.message,
          },
        ]
      : []
  );

  return [...valid, ...rejected].sort((a, b) => a.excelRow - b.excelRow);
}

function FilterButton({
  active,
  label,
  count,
  unit,
  onClick,
}: {
  active: boolean;
  label: string;
  count: number;
  // Shown after the count, e.g. "rows"
  unit?: string;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      variant={active ? "default" : "outline"}
      size="sm"
      className="cursor-pointer"
      onClick={onClick}
    >
      {label}
      <span
        className={cn(
          "tabular-nums",
          active ? "opacity-80" : "text-muted-foreground"
        )}
      >
        {count.toLocaleString()}
        {unit && ` ${unit}`}
      </span>
    </Button>
  );
}

function RowsTable({ preview }: { preview: UploadPreview }) {
  const rows = toDisplayRows(preview);
  const { counts } = preview;
  const missingUserRows = rows.filter(
    (row) => row.status !== "error" && !row.inUsers
  ).length;

  // Open on whatever needs attention first
  const [filter, setFilter] = useState<Filter>(
    counts.error > 0 ? "error" : counts.changed > 0 ? "changed" : "all"
  );
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);

  const search = query.trim().toLowerCase();
  const filtered = rows.filter(
    (row) =>
      (filter === "all" ||
        (filter === "missing-user"
          ? row.status !== "error" && !row.inUsers
          : row.status === filter)) &&
      (search === "" || row.sapId.includes(search))
  );
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const pageRows = filtered.slice(
    currentPage * PAGE_SIZE,
    (currentPage + 1) * PAGE_SIZE
  );

  const filters: Array<{
    value: Filter;
    label: string;
    count: number;
    unit?: string;
  }> = [
    { value: "all", label: "All", count: rows.length },
    { value: "new", label: "New", count: counts.new },
    { value: "changed", label: "Changed", count: counts.changed },
    { value: "unchanged", label: "Already loaded", count: counts.unchanged },
    { value: "error", label: "Errors", count: counts.error },
    {
      value: "missing-user",
      label: "Not in users",
      count: missingUserRows,
      // Not the same as the number of employees: most have several rows
      unit: missingUserRows === 1 ? "row" : "rows",
    },
  ];

  return (
    <Card className="overflow-hidden pb-0">
      <CardHeader className="gap-4">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Rows3 className="size-4 text-muted-foreground" />
          Rows in the file
        </CardTitle>
        <div className="flex flex-wrap items-center gap-2">
          {filters
            .filter((option) => option.value === "all" || option.count > 0)
            .map((option) => (
              <FilterButton
                key={option.value}
                active={filter === option.value}
                label={option.label}
                count={option.count}
                unit={option.unit}
                onClick={() => {
                  setFilter(option.value);
                  setPage(0);
                }}
              />
            ))}
          <div className="relative ml-auto w-full sm:w-64">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setPage(0);
              }}
              placeholder="Search SAP ID"
              aria-label="Search SAP ID"
              className="pl-9"
            />
          </div>
        </div>
      </CardHeader>
      <CardContent className="border-t p-0">
        <Table>
          <TableHeader className={tableHeaderClass}>
            <TableRow>
              <TableHead className="w-16">Row</TableHead>
              <TableHead>SAP ID</TableHead>
              <TableHead>FOR</TableHead>
              <TableHead>IN</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Office</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className={tableBodyClass}>
            {pageRows.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={8}
                  className="py-6 text-center text-muted-foreground"
                >
                  No rows match.
                </TableCell>
              </TableRow>
            )}
            {pageRows.map((row) => (
              <TableRow
                key={row.excelRow}
                className={cn(row.status === "error" && "bg-destructive/5")}
              >
                <TableCell className="text-muted-foreground tabular-nums">
                  {row.excelRow}
                </TableCell>
                <TableCell className="tabular-nums">{row.sapId}</TableCell>
                <TableCell>{row.forPeriod}</TableCell>
                <TableCell>{row.inPeriod}</TableCell>
                <TableCell>{row.type}</TableCell>
                <TableCell>
                  {row.oldOffice !== null && (
                    <span className="mr-1 text-muted-foreground line-through">
                      {row.oldOffice}
                    </span>
                  )}
                  {row.office}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {row.oldAmount !== null && (
                    <span className="mr-1 text-muted-foreground line-through">
                      {row.oldAmount}
                    </span>
                  )}
                  {row.amount}
                </TableCell>
                <TableCell className="whitespace-normal">
                  <StatusBadge status={row.status} />
                  {row.message && (
                    <div className="mt-1 max-w-xs text-xs text-destructive">
                      {row.message}
                    </div>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        <div className="flex items-center justify-between gap-2 border-t px-4 py-3 text-sm">
          <span className="text-muted-foreground">
            {filtered.length === 0
              ? "0 rows"
              : `Rows ${(currentPage * PAGE_SIZE + 1).toLocaleString()}–${(
                  currentPage * PAGE_SIZE + pageRows.length
                ).toLocaleString()} of ${filtered.length.toLocaleString()}`}
          </span>
          {pageCount > 1 && (
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="cursor-pointer"
                disabled={currentPage === 0}
                onClick={() => setPage(currentPage - 1)}
              >
                <ChevronLeft />
                Previous
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="cursor-pointer"
                disabled={currentPage >= pageCount - 1}
                onClick={() => setPage(currentPage + 1)}
              >
                Next
                <ChevronRight />
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// Same columns as UsersStaging, ready for the pension office to fill in the
// missing names and emails, plus the office to help find each person
function downloadMissingUsers(preview: UploadPreview) {
  downloadCsv(
    `missing-users-${preview.fileName.replace(/\.xlsx$/i, "")}.csv`,
    ["SAPID", "PensionID", "FullName", "Email", "Office"],
    preview.missingUsers.map((user) => [
      user.SAPID,
      "",
      "",
      "",
      preview.offices[user.OfficeID] ?? user.OfficeID,
    ])
  );
}

function MissingUsers({ preview }: { preview: UploadPreview }) {
  const { missingUsers, offices } = preview;

  return (
    <Card className="overflow-hidden pb-0">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1.5">
            <CardTitle className="flex items-center gap-2 text-lg">
              <UserX className="size-4 text-muted-foreground" />
              Employees missing from the users table
              <Badge className={badgeTone.warning}>
                {missingUsers.length.toLocaleString()}{" "}
                {missingUsers.length === 1 ? "employee" : "employees"}
              </Badge>
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Their contributions will be imported, but nobody can sign in to
              see them until a users row with their SAP ID, name and email is
              added. Download the list to fill in their names and emails.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="cursor-pointer"
            onClick={() => downloadMissingUsers(preview)}
          >
            <Download />
            Download CSV
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className={scrollingTableClass}>
          <Table>
            <TableHeader className={stickyTableHeaderClass}>
              <TableRow>
                <TableHead className="w-32">SAP ID</TableHead>
                <TableHead>Office</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className={tableBodyClass}>
              {missingUsers.map((user) => (
                <TableRow key={user.SAPID}>
                  <TableCell className="tabular-nums">{user.SAPID}</TableCell>
                  <TableCell>{offices[user.OfficeID] ?? user.OfficeID}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

export function UploadPreviewDetails({
  preview,
  actions,
}: {
  preview: UploadPreview;
  // Shown right under the summary, above the row details
  actions?: React.ReactNode;
}) {
  const { counts } = preview;
  // Problems with the file itself rather than a row, e.g. a missing column
  const fileErrors = preview.errors.filter((error) => !error.raw);
  const total =
    counts.new + counts.changed + counts.unchanged + counts.error;
  const stats: Array<{
    label: string;
    value: number;
    icon: LucideIcon;
    // Colour when the count isn't zero
    tone: BadgeTone;
  }> = [
    { label: "Rows", value: total, icon: Rows3, tone: "neutral" },
    { label: "New", value: counts.new, icon: Plus, tone: "success" },
    { label: "Changed", value: counts.changed, icon: PencilLine, tone: "warning" },
    {
      label: "Already loaded",
      value: counts.unchanged,
      icon: CheckCheck,
      tone: "neutral",
    },
    {
      label: "Errors",
      value: counts.error + fileErrors.length,
      icon: AlertTriangle,
      tone: "danger",
    },
  ];

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <FileSpreadsheet className="size-4 text-muted-foreground" />
            {preview.fileName}
          </CardTitle>
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            IN period:
            {preview.inPeriods.length === 0
              ? " —"
              : preview.inPeriods.map(({ period, rows }) => (
                  <Badge key={period} className={badgeTone.neutral}>
                    {formatPeriod(period)} · {rows.toLocaleString()} rows
                  </Badge>
                ))}
          </div>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {stats.map(({ label, value, icon: Icon, tone }) => (
            <div
              key={label}
              className="flex items-center gap-3 rounded-lg border p-3"
            >
              <div
                className={cn(
                  "flex size-9 shrink-0 items-center justify-center rounded-lg",
                  iconTone[value > 0 ? tone : "neutral"]
                )}
              >
                <Icon className="size-4" />
              </div>
              <div>
                <div className="text-sm text-muted-foreground">{label}</div>
                <div className="text-xl font-semibold tabular-nums">
                  {value.toLocaleString()}
                </div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {fileErrors.length > 0 && (
        <ErrorAlert>
          {fileErrors.map((error, index) => (
            <p key={index}>{error.message}</p>
          ))}
        </ErrorAlert>
      )}
      {counts.error > 0 && (
        <ErrorAlert>
          {counts.error.toLocaleString()}{" "}
          {counts.error === 1 ? "row has" : "rows have"} errors. Nothing can be
          imported until they are fixed in the Excel file.
        </ErrorAlert>
      )}

      {actions}

      {total > 0 && <RowsTable preview={preview} />}
      {preview.missingUsers.length > 0 && <MissingUsers preview={preview} />}
    </>
  );
}
