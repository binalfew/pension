import { Link, redirect } from "react-router";
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
import { getUserEmail } from "~/lib/auth.server";
import { getDataQualityReport, resolveUserByEmail } from "~/lib/db.server";
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

function Section({
  title,
  description,
  count,
  children,
}: {
  title: string;
  description: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {title}
          <Badge variant={count > 0 ? "destructive" : "secondary"}>
            {count}
          </Badge>
        </CardTitle>
        <p className="text-sm text-muted-foreground">{description}</p>
      </CardHeader>
      <CardContent className="p-0">
        {count === 0 ? (
          <p className="px-6 pb-6 text-sm text-muted-foreground">
            No issues found.
          </p>
        ) : (
          <div className="max-h-[480px] overflow-y-auto">{children}</div>
        )}
      </CardContent>
    </Card>
  );
}

export default function DataQuality({ loaderData }: Route.ComponentProps) {
  const { missingEmail, duplicateSapIds } = loaderData;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Data quality</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Records in the pension database that stop people from signing in or
          seeing the right statement. Fix these at the source.
        </p>
      </div>

      <Section
        title="Pensioners without an email"
        description="These pensioners have contributions but no email address, so they cannot sign in to see their statement."
        count={missingEmail.length}
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>SAP ID</TableHead>
              <TableHead>Name</TableHead>
              <TableHead className="text-right">Contributions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {missingEmail.map((row) => (
              <TableRow key={row.SAPID}>
                <TableCell>
                  <SapIdLink sapId={row.SAPID} />
                </TableCell>
                <TableCell>{row.FullName?.trim() || "—"}</TableCell>
                <TableCell className="text-right">
                  {row.ContributionCount}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Section>

      <Section
        title="Duplicate SAP IDs"
        description="These SAP IDs have more than one row in the users table. Keep one row per SAP ID."
        count={duplicateSapIds.length}
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>SAP ID</TableHead>
              <TableHead className="text-right">Count</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {duplicateSapIds.map((row) => (
              <TableRow key={row.SAPID}>
                <TableCell>
                  <SapIdLink sapId={row.SAPID} />
                </TableCell>
                <TableCell className="text-right">{row.Rows}</TableCell>
                <TableCell className="whitespace-normal">
                  {row.FullNames ?? "—"}
                </TableCell>
                <TableCell className="whitespace-normal">
                  {row.Emails ?? "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Section>
    </div>
  );
}
