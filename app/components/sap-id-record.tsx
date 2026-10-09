import { Info } from "lucide-react";
import { badgeTone } from "~/components/table-styles";
import { Badge } from "~/components/ui/badge";
import { formatAmount, formatPeriod } from "~/lib/utils";
import type { SapIdRecord } from "~/types/sap-id-record";

function periodRange(first: number | null, last: number | null) {
  if (first === null || last === null) {
    return "—";
  }
  return first === last
    ? formatPeriod(first)
    : `${formatPeriod(first)} – ${formatPeriod(last)}`;
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium">{children}</dd>
    </div>
  );
}

// A SAP ID's users rows and contributions, on the add, edit and delete user
// pages
export function RecordSummary({ record }: { record: SapIdRecord }) {
  const registered = record.users.find((row) => row.Email);
  const status = registered
    ? { tone: "success" as const, label: "Registered" }
    : record.users.length > 0
    ? { tone: "warning" as const, label: "No email" }
    : { tone: "warning" as const, label: "Not in users table" };

  return (
    <div className="space-y-4 rounded-lg border p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">SAP ID {record.sapId}</span>
        <Badge className={badgeTone[status.tone]}>{status.label}</Badge>
      </div>
      <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Fact label="Contributions">{record.contributions.toLocaleString()}</Fact>
        <Fact label="Total">${formatAmount(record.total)}</Fact>
        <Fact label="Period">
          {periodRange(record.firstPeriod, record.lastPeriod)}
        </Fact>
        <Fact label="Office">{record.office ?? "—"}</Fact>
      </dl>
      {record.users.length > 0 && (
        <ul className="divide-y rounded-md border text-sm">
          {record.users.map((row, index) => (
            <li key={index} className="flex flex-wrap gap-x-4 px-3 py-2">
              <span>{row.FullName || "No name"}</span>
              <span className="break-all text-muted-foreground">
                {row.Email || "No email"}
              </span>
            </li>
          ))}
        </ul>
      )}
      {record.contributions === 0 && (
        <p className="flex gap-2 text-sm text-muted-foreground">
          <Info className="mt-0.5 size-4 shrink-0" />
          No contributions for this SAP ID yet. Check the number; if it's
          right, their statement will be empty until payroll is uploaded.
        </p>
      )}
    </div>
  );
}
