import {
  CheckCircle2,
  Copy,
  Download,
  MailX,
  type LucideIcon,
} from "lucide-react";
import { Link, redirect } from "react-router";
import {
  badgeTone,
  iconTone,
  scrollingTableClass,
  stickyTableHeaderClass,
  tableBodyClass,
} from "~/components/table-styles";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { getUserEmail } from "~/lib/auth.server";
import { downloadCsv } from "~/lib/csv";
import { getDataQualityReport, resolveUserByEmail } from "~/lib/db.server";
import { cn } from "~/lib/utils";
import type { Route } from "./+types/data-quality";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Data Quality | AU Pension" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const userEmail = await getUserEmail(request);
  const resolvedUser = userEmail ? await resolveUserByEmail(userEmail) : null;

  // Only admins (the pension office) can see this report
  if (resolvedUser?.role !== "Admin") {
    throw redirect("/");
  }

  return getDataQualityReport();
}

function SapIdLink({ sapId }: { sapId: number | null }) {
  if (sapId === null) {
    return <span className="text-muted-foreground">—</span>;
  }
  return (
    <Link
      to={`/?sapId=${sapId}`}
      className="font-medium text-primary hover:underline"
    >
      {sapId}
    </Link>
  );
}

// The report joins the distinct names and emails of a duplicate SAP ID with
// " | "; show each on its own line
function StackedValues({ values }: { values: string | null }) {
  if (!values) {
    return <span className="text-muted-foreground">—</span>;
  }
  return (
    <ul className="space-y-0.5">
      {values.split(" | ").map((value) => (
        <li key={value} className="break-all">
          {value}
        </li>
      ))}
    </ul>
  );
}

// Amber for open issues, green once a list is empty
function IssueCount({ count }: { count: number }) {
  return (
    <Badge className={badgeTone[count > 0 ? "warning" : "success"]}>
      {count.toLocaleString()}
    </Badge>
  );
}

function SummaryTile({
  href,
  icon: Icon,
  label,
  count,
}: {
  href: string;
  icon: LucideIcon;
  label: string;
  count: number;
}) {
  return (
    <a
      href={href}
      className="flex items-center gap-4 rounded-xl border bg-card p-5 shadow-sm transition-shadow hover:shadow-md"
    >
      <div
        className={cn(
          "flex size-11 shrink-0 items-center justify-center rounded-lg",
          iconTone[count > 0 ? "warning" : "success"]
        )}
      >
        <Icon className="size-5" />
      </div>
      <div>
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="text-2xl font-semibold">{count.toLocaleString()}</p>
      </div>
    </a>
  );
}

function Section({
  id,
  icon: Icon,
  title,
  description,
  count,
  onDownload,
  children,
}: {
  id: string;
  icon: LucideIcon;
  title: string;
  description: string;
  count: number;
  onDownload: () => void;
  children: React.ReactNode;
}) {
  return (
    <Card
      id={id}
      className={cn("scroll-mt-6 gap-4", count > 0 && "overflow-hidden pb-0")}
    >
      <CardHeader className="grid-cols-[1fr_auto]">
        <div className="space-y-1.5">
          <CardTitle className="flex items-center gap-2">
            <Icon className="size-4 text-muted-foreground" />
            {title}
            <IssueCount count={count} />
          </CardTitle>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        {count > 0 && (
          <Button variant="outline" size="sm" onClick={onDownload}>
            <Download />
            Download CSV
          </Button>
        )}
      </CardHeader>
      <CardContent className="p-0">
        {count === 0 ? (
          <p className="flex items-center gap-2 px-6 pb-2 text-sm text-primary">
            <CheckCircle2 className="size-4" />
            No issues found.
          </p>
        ) : (
          <div className={scrollingTableClass}>{children}</div>
        )}
      </CardContent>
    </Card>
  );
}

export default function DataQuality({ loaderData }: Route.ComponentProps) {
  const { missingEmail, duplicateSapIds } = loaderData;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Data quality</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Records in the pension database that stop people from signing in or
          seeing the right statement. Fix these at the source.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <SummaryTile
          href="#missing-email"
          icon={MailX}
          label="Pensioners without an email"
          count={missingEmail.length}
        />
        <SummaryTile
          href="#duplicate-sap-ids"
          icon={Copy}
          label="Duplicate SAP IDs"
          count={duplicateSapIds.length}
        />
      </div>

      <Section
        id="missing-email"
        icon={MailX}
        title="Pensioners without an email"
        description="These pensioners have contributions but no email address, so they cannot sign in to see their statement."
        count={missingEmail.length}
        onDownload={() =>
          downloadCsv(
            "pensioners-without-email.csv",
            ["SAPID", "FullName", "Contributions"],
            missingEmail.map((row) => [
              row.SAPID,
              row.FullName?.trim() || null,
              row.ContributionCount,
            ])
          )
        }
      >
        <Table>
          <TableHeader className={stickyTableHeaderClass}>
            <TableRow>
              <TableHead className="w-32">SAP ID</TableHead>
              <TableHead>Name</TableHead>
              <TableHead className="w-36 text-right">Contributions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className={tableBodyClass}>
            {missingEmail.map((row) => (
              <TableRow key={row.SAPID}>
                <TableCell>
                  <SapIdLink sapId={row.SAPID} />
                </TableCell>
                <TableCell>{row.FullName?.trim() || "—"}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {row.ContributionCount.toLocaleString()}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Section>

      <Section
        id="duplicate-sap-ids"
        icon={Copy}
        title="Duplicate SAP IDs"
        description="These SAP IDs have more than one row in the users table. Keep one row per SAP ID."
        count={duplicateSapIds.length}
        onDownload={() =>
          downloadCsv(
            "duplicate-sap-ids.csv",
            ["SAPID", "Rows", "FullNames", "Emails"],
            duplicateSapIds.map((row) => [
              row.SAPID,
              row.Rows,
              row.FullNames,
              row.Emails,
            ])
          )
        }
      >
        <Table>
          <TableHeader className={stickyTableHeaderClass}>
            <TableRow>
              <TableHead className="w-32">SAP ID</TableHead>
              <TableHead className="w-24 text-right">Rows</TableHead>
              <TableHead>Names</TableHead>
              <TableHead>Emails</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className={cn(tableBodyClass, "[&_td]:align-top")}>
            {duplicateSapIds.map((row) => (
              <TableRow key={row.SAPID}>
                <TableCell>
                  <SapIdLink sapId={row.SAPID} />
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {row.Rows}
                </TableCell>
                <TableCell className="whitespace-normal">
                  <StackedValues values={row.FullNames} />
                </TableCell>
                <TableCell className="whitespace-normal">
                  <StackedValues values={row.Emails} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Section>
    </div>
  );
}
