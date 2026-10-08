import {
  Banknote,
  CheckCircle2,
  Copy,
  Download,
  FileX,
  Hash,
  MailX,
  Percent,
  Tag,
  UserCog,
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
import { cn, formatAmount, formatPeriod } from "~/lib/utils";
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

// Opens the sign-in check for an email, to see what that person gets
function EmailCheckLink({ email }: { email: string | null }) {
  const trimmed = email?.trim();
  if (!trimmed) {
    return <span className="text-muted-foreground">—</span>;
  }
  return (
    <Link
      to={`/sign-in-check?email=${encodeURIComponent(trimmed)}`}
      className="break-all text-primary hover:underline"
    >
      {trimmed}
    </Link>
  );
}

function periodRange(first: number | null, last: number | null) {
  if (first === null || last === null) {
    return "—";
  }
  return first === last
    ? formatPeriod(first)
    : `${formatPeriod(first)} – ${formatPeriod(last)}`;
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
  detail,
}: {
  href: string;
  icon: LucideIcon;
  label: string;
  count: number;
  // Extra line under the count, shown only when there are issues
  detail?: string;
}) {
  return (
    <a
      href={href}
      className="flex items-center gap-4 rounded-xl border bg-card p-4 shadow-sm transition-shadow hover:shadow-md sm:p-5"
    >
      <div
        className={cn(
          "hidden size-11 shrink-0 items-center justify-center rounded-lg sm:flex",
          iconTone[count > 0 ? "warning" : "success"]
        )}
      >
        <Icon className="size-5" />
      </div>
      <div className="min-w-0">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="text-2xl font-semibold">{count.toLocaleString()}</p>
        {detail && count > 0 && (
          <p className="text-xs text-muted-foreground">{detail}</p>
        )}
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
      <CardHeader className="gap-3 sm:grid-cols-[1fr_auto]">
        <div className="space-y-1.5">
          <CardTitle className="flex items-center gap-2">
            <Icon className="size-4 text-muted-foreground" />
            {title}
            <IssueCount count={count} />
          </CardTitle>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        {count > 0 && (
          <Button
            variant="outline"
            size="sm"
            className="justify-self-start"
            onClick={onDownload}
          >
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
  const {
    missingEmail,
    duplicateSapIds,
    orphanContributions,
    orphanInterest,
    unknownTypes,
    adminPensioners,
    missingSapId,
    noContributions,
  } = loaderData;
  const orphanTotal = orphanContributions.reduce(
    (sum, row) => sum + row.Total,
    0
  );
  const unknownTypeTotal = unknownTypes.reduce(
    (sum, row) => sum + row.Total,
    0
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Data quality</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Records in the pension database that stop people from signing in,
          hide money from statements, or show the wrong statement. Fix these at
          the source.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <SummaryTile
          href="#orphan-contributions"
          icon={Banknote}
          label="Contributions with no pensioner"
          count={orphanContributions.length}
          detail={`$${formatAmount(orphanTotal)} on no statement`}
        />
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
        <SummaryTile
          href="#unknown-types"
          icon={Tag}
          label="Unknown contribution types"
          count={unknownTypes.length}
          detail={`$${formatAmount(unknownTypeTotal)} left out of balances`}
        />
        <SummaryTile
          href="#no-contributions"
          icon={FileX}
          label="Pensioners with no contributions"
          count={noContributions.length}
        />
        <SummaryTile
          href="#missing-sap-id"
          icon={Hash}
          label="Records without a SAP ID"
          count={missingSapId.length}
        />
        <SummaryTile
          href="#orphan-interest"
          icon={Percent}
          label="Interest with no pensioner"
          count={orphanInterest.length}
        />
        <SummaryTile
          href="#admin-pensioners"
          icon={UserCog}
          label="Admins who are also pensioners"
          count={adminPensioners.length}
        />
      </div>

      <Section
        id="orphan-contributions"
        icon={Banknote}
        title="Contributions with no pensioner"
        description={`These SAP IDs have contributions but no row in the users table, so $${formatAmount(orphanTotal)} appears on no one's statement. Usually new staff whose payroll was uploaded before they were registered. The CSV has the users table columns to fill in.`}
        count={orphanContributions.length}
        onDownload={() =>
          downloadCsv(
            "contributions-without-pensioner.csv",
            ["SAPID", "PensionID", "FullName", "Email", "Office"],
            orphanContributions.map((row) => [
              row.SAPID,
              "",
              "",
              "",
              row.Office,
            ])
          )
        }
      >
        <Table>
          <TableHeader className={stickyTableHeaderClass}>
            <TableRow>
              <TableHead className="w-32">SAP ID</TableHead>
              <TableHead>Office</TableHead>
              <TableHead>Period</TableHead>
              <TableHead className="w-36 text-right">Contributions</TableHead>
              <TableHead className="w-36 text-right">Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className={tableBodyClass}>
            {orphanContributions.map((row) => (
              <TableRow key={row.SAPID}>
                {/* No statement to link to without a users row */}
                <TableCell className="font-medium">{row.SAPID}</TableCell>
                <TableCell>{row.Office ?? "—"}</TableCell>
                <TableCell className="whitespace-nowrap">
                  {periodRange(row.FirstPeriod, row.LastPeriod)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {row.Contributions.toLocaleString()}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  ${formatAmount(row.Total)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Section>

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
        description="These SAP IDs have more than one row in the users table. Keep one row per SAP ID, the one with the correct email."
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

      <Section
        id="unknown-types"
        icon={Tag}
        title="Unknown contribution types"
        description="These contributions use a type ID that isn't in the contribution types table, so they are left out of every balance. Add the type, or correct the contributions."
        count={unknownTypes.length}
        onDownload={() =>
          downloadCsv(
            "unknown-contribution-types.csv",
            ["ContributionTypeID", "Contributions", "SapIds", "Total"],
            unknownTypes.map((row) => [
              row.ContributionTypeID,
              row.Contributions,
              row.SapIds,
              row.Total,
            ])
          )
        }
      >
        <Table>
          <TableHeader className={stickyTableHeaderClass}>
            <TableRow>
              <TableHead>Type ID</TableHead>
              <TableHead className="text-right">Contributions</TableHead>
              <TableHead className="text-right">SAP IDs</TableHead>
              <TableHead className="text-right">Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className={tableBodyClass}>
            {unknownTypes.map((row) => (
              <TableRow key={row.ContributionTypeID ?? "none"}>
                <TableCell className="font-medium">
                  {row.ContributionTypeID ?? "None"}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {row.Contributions.toLocaleString()}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {row.SapIds.toLocaleString()}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  ${formatAmount(row.Total)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Section>

      <Section
        id="no-contributions"
        icon={FileX}
        title="Pensioners with no contributions"
        description="These pensioners have a SAP ID but no contributions under it, so they see an empty statement. Check the SAP ID is right; new staff may simply not have been paid yet."
        count={noContributions.length}
        onDownload={() =>
          downloadCsv(
            "pensioners-without-contributions.csv",
            ["SAPID", "FullName", "Email"],
            noContributions.map((row) => [
              row.SAPID,
              row.FullName?.trim() || null,
              row.Email?.trim() || null,
            ])
          )
        }
      >
        <Table>
          <TableHeader className={stickyTableHeaderClass}>
            <TableRow>
              <TableHead className="w-32">SAP ID</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className={tableBodyClass}>
            {noContributions.map((row) => (
              <TableRow key={row.SAPID}>
                <TableCell>
                  <SapIdLink sapId={row.SAPID} />
                </TableCell>
                <TableCell>{row.FullName?.trim() || "—"}</TableCell>
                <TableCell>
                  <EmailCheckLink email={row.Email} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Section>

      <Section
        id="missing-sap-id"
        icon={Hash}
        title="Records without a SAP ID"
        description="These pensioner records have no SAP ID, so the person sees “No pension data available”. Set the SAP ID on each row."
        count={missingSapId.length}
        onDownload={() =>
          downloadCsv(
            "records-without-sap-id.csv",
            ["PensionID", "FullName", "Email"],
            missingSapId.map((row) => [
              row.PensionID,
              row.FullName?.trim() || null,
              row.Email?.trim() || null,
            ])
          )
        }
      >
        <Table>
          <TableHeader className={stickyTableHeaderClass}>
            <TableRow>
              <TableHead className="w-32">Pension ID</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className={tableBodyClass}>
            {missingSapId.map((row, index) => (
              <TableRow key={`${row.PensionID}-${row.Email}-${index}`}>
                <TableCell>{row.PensionID ?? "—"}</TableCell>
                <TableCell>{row.FullName?.trim() || "—"}</TableCell>
                <TableCell>
                  <EmailCheckLink email={row.Email} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Section>

      <Section
        id="orphan-interest"
        icon={Percent}
        title="Interest with no pensioner"
        description="Interest has been computed for these SAP IDs, but they have no row in the users table, so it appears on no one's statement."
        count={orphanInterest.length}
        onDownload={() =>
          downloadCsv(
            "interest-without-pensioner.csv",
            ["SAPID", "Months", "Total"],
            orphanInterest.map((row) => [row.SAPID, row.Months, row.Total])
          )
        }
      >
        <Table>
          <TableHeader className={stickyTableHeaderClass}>
            <TableRow>
              <TableHead className="w-32">SAP ID</TableHead>
              <TableHead className="text-right">Months</TableHead>
              <TableHead className="text-right">Total interest</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className={tableBodyClass}>
            {orphanInterest.map((row) => (
              <TableRow key={row.SAPID}>
                <TableCell className="font-medium">{row.SAPID}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {row.Months.toLocaleString()}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  ${formatAmount(row.Total)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Section>

      <Section
        id="admin-pensioners"
        icon={UserCog}
        title="Admins who are also pensioners"
        description="These emails are in both the admin and pensioner tables. They sign in as admins and see their own statement only by searching for it. Fine if intended."
        count={adminPensioners.length}
        onDownload={() =>
          downloadCsv(
            "admins-who-are-pensioners.csv",
            ["Email", "FullName", "SapIds"],
            adminPensioners.map((row) => [
              row.Email,
              row.FullName,
              row.SapIds,
            ])
          )
        }
      >
        <Table>
          <TableHeader className={stickyTableHeaderClass}>
            <TableRow>
              <TableHead>Email</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>SAP IDs</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className={cn(tableBodyClass, "[&_td]:align-top")}>
            {adminPensioners.map((row) => (
              <TableRow key={row.Email}>
                <TableCell>
                  <EmailCheckLink email={row.Email} />
                </TableCell>
                <TableCell>{row.FullName ?? "—"}</TableCell>
                <TableCell>
                  {row.SapIds ? (
                    <ul className="space-y-0.5">
                      {row.SapIds.split(" | ").map((sapId) => (
                        <li key={sapId}>
                          <SapIdLink sapId={Number(sapId)} />
                        </li>
                      ))}
                    </ul>
                  ) : (
                    "—"
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Section>
    </div>
  );
}
