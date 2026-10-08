import { Badge } from "~/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import type {
  UploadHistoryEntry,
  UploadHistoryStatus,
} from "~/lib/contribution-upload.server";
import { cn, formatPeriod } from "~/lib/utils";

// A fixed time zone, so the server and the browser render the same text.
// The pension office is at AU headquarters in Addis Ababa.
const dateTimeFormat = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Africa/Addis_Ababa",
});

export function formatUploadTime(iso: string) {
  return dateTimeFormat.format(new Date(iso));
}

const STATUS: Record<
  UploadHistoryStatus,
  { label: string; className: string }
> = {
  running: {
    label: "In progress",
    className: "border-blue-500 text-blue-700 dark:text-blue-400",
  },
  succeeded: {
    label: "Done",
    className: "border-green-600 text-green-700 dark:text-green-400",
  },
  rejected: {
    label: "Refused",
    className: "border-amber-500 text-amber-700 dark:text-amber-400",
  },
  failed: {
    label: "Failed",
    className: "border-destructive text-destructive",
  },
  interrupted: {
    label: "Interrupted",
    className: "border-destructive text-destructive",
  },
};

function Count({ value }: { value: number | null }) {
  return (
    <TableCell className="text-right tabular-nums">
      {value === null ? (
        <span className="text-muted-foreground">—</span>
      ) : (
        value.toLocaleString()
      )}
    </TableCell>
  );
}

export function UploadHistory({ history }: { history: UploadHistoryEntry[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Upload history</CardTitle>
        <p className="text-sm text-muted-foreground">
          The latest {history.length > 0 ? history.length : ""} imports,
          newest first. Times are Addis Ababa time. Refused, failed and
          interrupted imports changed nothing.
        </p>
      </CardHeader>
      <CardContent className="p-0">
        {history.length === 0 ? (
          <p className="px-6 pb-6 text-sm text-muted-foreground">
            No uploads yet.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Started</TableHead>
                <TableHead>By</TableHead>
                <TableHead>File</TableHead>
                <TableHead>IN period</TableHead>
                <TableHead className="text-right">Rows</TableHead>
                <TableHead className="text-right">Added</TableHead>
                <TableHead className="text-right">Updated</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {history.map((upload) => (
                <TableRow key={upload.ID}>
                  <TableCell>{formatUploadTime(upload.StartedAt)}</TableCell>
                  <TableCell>{upload.UploadedBy}</TableCell>
                  <TableCell className="max-w-48 truncate" title={upload.FileName}>
                    {upload.FileName}
                  </TableCell>
                  <TableCell>
                    {upload.InPeriods.map(formatPeriod).join(", ") || "—"}
                  </TableCell>
                  <Count value={upload.FileRows} />
                  <Count value={upload.Inserted} />
                  <Count value={upload.Updated} />
                  <TableCell className="whitespace-normal">
                    <Badge
                      variant="outline"
                      className={cn(STATUS[upload.status].className)}
                    >
                      {STATUS[upload.status].label}
                    </Badge>
                    {upload.Message && (
                      <div className="mt-1 max-w-xs text-xs text-muted-foreground">
                        {upload.Message}
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
