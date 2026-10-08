import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  Form,
  redirect,
  useNavigate,
  useNavigation,
  useRevalidator,
} from "react-router";
import { StatusButton } from "~/components/status-button";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import {
  formatUploadTime,
  UploadHistory,
} from "~/components/upload-history";
import { UploadPreviewDetails } from "~/components/upload-preview";
import { getUserEmail } from "~/lib/auth.server";
import {
  getUploadHistory,
  importContributionUpload,
  previewContributionUpload,
  UploadRejectedError,
  type UploadPreview,
  type UploadResult,
} from "~/lib/contribution-upload.server";
import { resolveUserByEmail } from "~/lib/db.server";
import { invalidateOverview } from "~/lib/overview.server";
import type { Route } from "./+types/contributions-upload";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Upload contributions | AU Pension" }];
}

// Only admins (the pension office) can upload contributions
async function requireAdminEmail(request: Request) {
  const userEmail = await getUserEmail(request);
  const resolvedUser = userEmail ? await resolveUserByEmail(userEmail) : null;
  if (resolvedUser?.role !== "Admin") {
    throw redirect("/statement");
  }
  return userEmail as string;
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireAdminEmail(request);
  return { history: await getUploadHistory() };
}

// How often the page checks on an import that's in progress
const POLL_INTERVAL_MS = 3000;

type ActionData =
  | { intent: "preview"; preview: UploadPreview }
  | { intent: "import"; result: UploadResult }
  | { intent: "error"; message: string };

export async function action({
  request,
}: Route.ActionArgs): Promise<ActionData> {
  const adminEmail = await requireAdminEmail(request);
  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File) || file.size === 0) {
    return { intent: "error", message: "Choose an Excel file to upload." };
  }

  if (formData.get("intent") === "import") {
    try {
      const result = await importContributionUpload(
        file,
        String(formData.get("fileHash") ?? ""),
        String(formData.get("stateHash") ?? ""),
        adminEmail
      );
      // New contributions change the overview's figures
      invalidateOverview();
      console.log(
        `Contribution upload by ${adminEmail}: ${result.fileName}, ` +
          `${result.inserted} inserted, ${result.updated} updated`
      );
      return { intent: "import", result };
    } catch (error) {
      if (error instanceof UploadRejectedError) {
        return { intent: "error", message: error.message };
      }
      throw error;
    }
  }

  return { intent: "preview", preview: await previewContributionUpload(file) };
}

export default function ContributionsUpload({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const { history } = loaderData;
  const navigation = useNavigation();
  const revalidator = useRevalidator();
  const navigate = useNavigate();
  const formRef = useRef<HTMLFormElement>(null);
  const [hasFile, setHasFile] = useState(false);
  const submittingIntent =
    navigation.state === "submitting"
      ? navigation.formData?.get("intent")
      : null;

  const preview = actionData?.intent === "preview" ? actionData.preview : null;
  const result = actionData?.intent === "import" ? actionData.result : null;
  const toImport = preview ? preview.counts.new + preview.counts.changed : 0;
  // Running in another tab, by another admin, or before this page was
  // reloaded
  const runningUpload = history.find((upload) => upload.status === "running");
  const canImport =
    preview !== null &&
    preview.errors.length === 0 &&
    toImport > 0 &&
    !runningUpload;

  // Keep checking until the running import finishes, fails or is
  // interrupted; the history then shows how it ended
  useEffect(() => {
    if (!runningUpload) {
      return;
    }
    const timer = setInterval(() => {
      if (revalidator.state === "idle" && navigation.state === "idle") {
        revalidator.revalidate();
      }
    }, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [runningUpload, revalidator, navigation.state]);

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
        <h1 className="text-2xl font-semibold">Upload contributions</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Upload the monthly payroll Excel file with the columns Employee
          number, FOR-Period, IN-Period, Contributions ID, Amount and Office
          ID. You will see what changes before anything is saved. Rows that
          are already in the database are updated, new rows are added.
        </p>
      </div>

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
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
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

        {runningUpload && submittingIntent !== "import" && (
          <Card className="border-blue-300 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/40">
            <CardContent className="flex items-start gap-3 text-sm">
              <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin text-blue-600" />
              <p>
                <span className="font-medium">Import in progress:</span>{" "}
                {runningUpload.FileName} ({runningUpload.FileRows.toLocaleString()}{" "}
                rows) by {runningUpload.UploadedBy}, started{" "}
                {formatUploadTime(runningUpload.StartedAt)}. This page checks
                every few seconds and the upload history below shows how it
                ends. Another import can start once it has finished.
              </p>
            </CardContent>
          </Card>
        )}

        {actionData?.intent === "error" && (
          <div className="flex gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <p>{actionData.message}</p>
          </div>
        )}

        {result && (
          <Card className="border-primary/40 bg-primary/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle2 className="size-5 text-primary" />
                Imported {result.fileName}
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                {result.rowCount.toLocaleString()} rows processed:{" "}
                {result.inserted.toLocaleString()} added,{" "}
                {result.updated.toLocaleString()} updated.
              </p>
            </CardHeader>
          </Card>
        )}

        {preview ? (
          <>
            <input type="hidden" name="fileHash" value={preview.fileHash} />
            <input type="hidden" name="stateHash" value={preview.stateHash} />
            {/* Fresh filters and paging for each file */}
            <UploadPreviewDetails
              key={preview.fileHash}
              preview={preview}
              actions={
                <>
                  <div className="flex items-center justify-end gap-3">
                    {preview.errors.length === 0 && toImport === 0 && (
                      <span className="text-sm text-muted-foreground">
                        Everything in this file is already loaded.
                      </span>
                    )}
                    {runningUpload && toImport > 0 && (
                      <span className="text-sm text-muted-foreground">
                        Wait for the import in progress to finish.
                      </span>
                    )}
                    <StatusButton
                      type="submit"
                      name="intent"
                      value="import"
                      status={submittingIntent === "import" ? "pending" : "idle"}
                      disabled={!canImport || navigation.state !== "idle"}
                    >
                      Import {toImport.toLocaleString()} rows
                    </StatusButton>
                  </div>
                  <UploadHistory history={history} />
                </>
              }
            />
          </>
        ) : (
          <UploadHistory history={history} />
        )}
      </Form>
    </div>
  );
}
