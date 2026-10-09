import { AlertTriangle, CheckCircle2, Download, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Form, Link, useNavigate, useNavigation } from "react-router";
import { BackLink } from "~/components/back-link";
import { StatusButton } from "~/components/status-button";
import {
  badgeTone,
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
import { downloadCsv } from "~/lib/csv";
import { USER_UPLOAD_COLUMNS } from "~/lib/user-upload";
import { invalidateOverview } from "~/lib/overview.server";
import {
  requireAdminEmail,
  UserChangeRejectedError,
} from "~/lib/user-admin.server";
import {
  importUserUpload,
  previewUserUpload,
  type UserUploadPreview,
  type UserUploadResult,
  type UserUploadStatus,
} from "~/lib/user-upload.server";
import { cn } from "~/lib/utils";
import type { Route } from "./+types/users.upload";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Upload users | AU Pension" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireAdminEmail(request);
  return null;
}

type ActionData =
  | { intent: "preview"; preview: UserUploadPreview }
  | { intent: "import"; result: UserUploadResult }
  | { intent: "error"; message: string };

export async function action({
  request,
}: Route.ActionArgs): Promise<ActionData> {
  const adminEmail = await requireAdminEmail(request);
  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File) || file.size === 0) {
    return { intent: "error", message: "Choose an Excel or CSV file to upload." };
  }

  if (formData.get("intent") === "import") {
    try {
      const result = await importUserUpload(
        file,
        String(formData.get("fileHash") ?? ""),
        String(formData.get("outcomesHash") ?? ""),
        adminEmail
      );
      // New pensioners change the overview's figures and quality counts
      invalidateOverview();
      return { intent: "import", result };
    } catch (error) {
      if (error instanceof UserChangeRejectedError) {
        return { intent: "error", message: error.message };
      }
      throw error;
    }
  }

  return { intent: "preview", preview: await previewUserUpload(file) };
}

const STATUS: Record<UserUploadStatus, { label: string; tone: BadgeTone }> = {
  new: { label: "New", tone: "success" },
  emailAdded: { label: "Email added", tone: "info" },
  unchanged: { label: "Already registered", tone: "neutral" },
  error: { label: "Rejected", tone: "danger" },
};

const FIELDS = [
  {
    column: USER_UPLOAD_COLUMNS.sapId,
    required: true,
    help: "The SAP ID (employee number) on the payroll, a whole number like 12345. Each SAP ID once in the file.",
  },
  {
    column: USER_UPLOAD_COLUMNS.fullName,
    required: true,
    help: "The person's full name, up to 255 characters. For a SAP ID that's already in Users, it must be the name it has there (case and spacing don't matter).",
  },
  {
    column: USER_UPLOAD_COLUMNS.email,
    required: false,
    help: "The address they sign in to Microsoft with. Leave empty to add them without sign-in; they're still on the statement search. Can't be an admin's email. Several SAP IDs with the same email belong to one person.",
  },
];

const FILTERS: Array<UserUploadStatus | "all"> = [
  "all",
  "error",
  "new",
  "emailAdded",
  "unchanged",
];

function ErrorAlert({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
      <AlertTriangle className="mt-0.5 size-4 shrink-0" />
      <div>{children}</div>
    </div>
  );
}

function PreviewTable({ preview }: { preview: UserUploadPreview }) {
  // Rejected rows first when there are any, since they block the import
  const [filter, setFilter] = useState<UserUploadStatus | "all">(
    preview.counts.error > 0 ? "error" : "all"
  );
  const rows =
    filter === "all"
      ? preview.rows
      : preview.rows.filter((row) => row.status === filter);

  return (
    <Card className="gap-4 overflow-hidden pb-0">
      <CardHeader>
        <CardTitle className="text-lg">{preview.fileName}</CardTitle>
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((option) => {
            const count =
              option === "all" ? preview.rows.length : preview.counts[option];
            if (option !== "all" && count === 0) {
              return null;
            }
            return (
              <Button
                key={option}
                type="button"
                size="sm"
                variant={option === filter ? "default" : "outline"}
                onClick={() => setFilter(option)}
              >
                {option === "all" ? "All rows" : STATUS[option].label}{" "}
                <span className="tabular-nums">{count.toLocaleString()}</span>
              </Button>
            );
          })}
        </div>
      </CardHeader>
      <CardContent className={cn("p-0", scrollingTableClass)}>
        <Table>
          <TableHeader className={stickyTableHeaderClass}>
            <TableRow>
              <TableHead className="w-16">Row</TableHead>
              <TableHead className="w-28">SAP ID</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead className="w-32">Status</TableHead>
              <TableHead>Notes</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className={tableBodyClass}>
            {rows.map((row) => (
              <TableRow key={row.excelRow}>
                <TableCell className="tabular-nums text-muted-foreground">
                  {row.excelRow}
                </TableCell>
                <TableCell className="tabular-nums">{row.sapId}</TableCell>
                <TableCell>{row.fullName}</TableCell>
                <TableCell className="break-all">
                  {row.email || (
                    <span className="text-muted-foreground">No email</span>
                  )}
                </TableCell>
                <TableCell>
                  <Badge className={badgeTone[STATUS[row.status].tone]}>
                    {STATUS[row.status].label}
                  </Badge>
                </TableCell>
                <TableCell
                  className={cn(
                    "whitespace-normal text-sm",
                    row.status === "error"
                      ? "text-destructive"
                      : "text-muted-foreground"
                  )}
                >
                  {row.message}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

export default function UploadUsers({ actionData }: Route.ComponentProps) {
  const navigation = useNavigation();
  const navigate = useNavigate();
  const formRef = useRef<HTMLFormElement>(null);
  const [hasFile, setHasFile] = useState(false);
  const submittingIntent =
    navigation.state === "submitting"
      ? navigation.formData?.get("intent")
      : null;

  const preview = actionData?.intent === "preview" ? actionData.preview : null;
  const result = actionData?.intent === "import" ? actionData.result : null;
  const toImport = preview
    ? preview.counts.new + preview.counts.emailAdded
    : 0;
  const canImport =
    preview !== null &&
    preview.fileErrors.length === 0 &&
    preview.counts.error === 0 &&
    toImport > 0;

  // Start over with an empty form once an import is done
  useEffect(() => {
    if (result) {
      formRef.current?.reset();
      setHasFile(false);
    }
  }, [result]);

  // Empty the file input and navigate to the page again, which drops the
  // preview, result or error shown from the last submit
  function clearUpload() {
    formRef.current?.reset();
    setHasFile(false);
    navigate(".", { replace: true });
  }

  return (
    <div className="space-y-6">
      <div>
        <BackLink to="/users" label="Users" />
        <h1 className="text-2xl font-semibold">Upload users</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Add many pensioners at once from an Excel or CSV file. The upload
          only adds users and fills in missing emails; a row that would change
          an existing user's name or email is rejected, so edit them instead. You will see what each row does before anything is
          saved.
        </p>
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="text-lg">File format</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              One row per SAP ID, at most 500 rows, under a header row with
              these columns. Other columns are ignored, so the{" "}
              <Link
                to="/data-quality"
                className="font-medium text-primary hover:underline"
              >
                Quality
              </Link>{" "}
              page's downloads of contributions with no pensioner and
              pensioners without an email can be filled in and uploaded as
              they are.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            className="self-start"
            onClick={() =>
              downloadCsv(
                "users-template.csv",
                Object.values(USER_UPLOAD_COLUMNS),
                []
              )
            }
          >
            <Download />
            Download template
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader className={tableHeaderClass}>
              <TableRow>
                <TableHead className="w-32">Column</TableHead>
                <TableHead className="w-28">Required</TableHead>
                <TableHead>What to enter</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className={tableBodyClass}>
              {FIELDS.map((field) => (
                <TableRow key={field.column}>
                  <TableCell className="font-mono text-sm">
                    {field.column}
                  </TableCell>
                  <TableCell>{field.required ? "Yes" : "No"}</TableCell>
                  <TableCell className="whitespace-normal text-sm text-muted-foreground">
                    {field.help}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Form
        ref={formRef}
        method="POST"
        encType="multipart/form-data"
        className="space-y-6"
      >
        <Card>
          <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Input
              type="file"
              name="file"
              accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              required
              className="sm:flex-1"
              onChange={(event) =>
                setHasFile((event.currentTarget.files?.length ?? 0) > 0)
              }
            />
            <StatusButton
              type="submit"
              name="intent"
              value="preview"
              variant="outline"
              status={submittingIntent === "preview" ? "pending" : "idle"}
              disabled={navigation.state !== "idle"}
            >
              Preview
            </StatusButton>
            {(hasFile || actionData) && (
              <Button
                type="button"
                variant="ghost"
                onClick={clearUpload}
                disabled={navigation.state !== "idle"}
              >
                Clear
              </Button>
            )}
          </CardContent>
        </Card>

        {actionData?.intent === "error" && (
          <ErrorAlert>{actionData.message}</ErrorAlert>
        )}

        {result && (
          <Card className="border-primary/40 bg-primary/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle2 className="size-5 text-primary" />
                Imported {result.fileName}
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                {result.added.toLocaleString()} users added,{" "}
                {result.emailsAdded.toLocaleString()} emails filled in,{" "}
                {result.skipped.toLocaleString()} rows already there.
              </p>
            </CardHeader>
            <CardContent>
              <Button asChild size="sm" variant="outline">
                <Link to="/users">Open Users</Link>
              </Button>
            </CardContent>
          </Card>
        )}

        {preview && preview.fileErrors.length > 0 && (
          <ErrorAlert>
            <p className="font-medium">{preview.fileName} can't be imported:</p>
            <ul className="mt-1 list-disc pl-5">
              {preview.fileErrors.map((message) => (
                <li key={message}>{message}</li>
              ))}
            </ul>
          </ErrorAlert>
        )}

        {preview && preview.fileErrors.length === 0 && (
          <>
            <input type="hidden" name="fileHash" value={preview.fileHash} />
            <input type="hidden" name="outcomesHash" value={preview.outcomesHash} />
            {/* Fresh filter for each file */}
            <PreviewTable key={preview.fileHash} preview={preview} />
            <div className="flex items-center justify-end gap-3">
              {preview.counts.error > 0 ? (
                <span className="text-sm text-destructive">
                  Fix the rejected rows in the file and preview it again.
                </span>
              ) : (
                toImport === 0 && (
                  <span className="text-sm text-muted-foreground">
                    Everyone in this file is already in Users.
                  </span>
                )
              )}
              <StatusButton
                type="submit"
                name="intent"
                value="import"
                status={submittingIntent === "import" ? "pending" : "idle"}
                disabled={!canImport || navigation.state !== "idle"}
              >
                <Upload />
                Import {toImport.toLocaleString()}{" "}
                {toImport === 1 ? "row" : "rows"}
              </StatusButton>
            </div>
          </>
        )}
      </Form>
    </div>
  );
}
