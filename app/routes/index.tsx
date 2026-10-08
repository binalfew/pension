import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Clock,
  KeyRound,
  Percent,
  ShieldCheck,
  Upload,
  Users,
  Wallet,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { useState } from "react";
import { Link, redirect } from "react-router";
import {
  badgeTone,
  iconTone,
  type BadgeTone,
} from "~/components/table-styles";
import { formatUploadTime, STATUS } from "~/components/upload-history";
import { Badge } from "~/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { getUserEmail } from "~/lib/auth.server";
import { getUploadHistory } from "~/lib/contribution-upload.server";
import { getSystemOverview, resolveUserByEmail } from "~/lib/db.server";
import {
  monthlySeries,
  monthsBetween,
  type SeriesMonth,
} from "~/lib/overview";
import { cn, formatAmount, formatPeriod } from "~/lib/utils";
import type { Route } from "./+types/index";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Overview | AU Pension" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const userEmail = await getUserEmail(request);
  const resolvedUser = userEmail ? await resolveUserByEmail(userEmail) : null;

  // Only admins (the pension office) can see system-wide figures
  if (resolvedUser?.role !== "Admin") {
    throw redirect("/statement");
  }

  const [overview, [lastUpload]] = await Promise.all([
    getSystemOverview(),
    getUploadHistory(1),
  ]);
  return { overview, lastUpload: lastUpload ?? null };
}

const compactAmount = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumFractionDigits: 1,
});

// Interest this many months behind the latest payroll is expected (the job
// runs after the month closes); more is worth chasing
const INTEREST_LAG_OK = 2;
const INTEREST_LAG_WARNING = 6;

function StatTile({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <div className="flex items-center gap-4 rounded-xl border bg-card p-4 shadow-sm sm:p-5">
      <div
        className={cn(
          "hidden size-11 shrink-0 items-center justify-center rounded-lg sm:flex",
          iconTone.success
        )}
      >
        <Icon className="size-5" />
      </div>
      <div className="min-w-0">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="text-2xl font-semibold tabular-nums">{value}</p>
        {detail && <p className="text-xs text-muted-foreground">{detail}</p>}
      </div>
    </div>
  );
}

const toneIcon: Record<BadgeTone, LucideIcon> = {
  success: CheckCircle2,
  info: Clock,
  warning: AlertTriangle,
  danger: XCircle,
  neutral: Clock,
};

function StatusRow({
  icon: Icon,
  title,
  value,
  tone,
  badge,
  children,
}: {
  icon: LucideIcon;
  title: string;
  value: string;
  tone: BadgeTone;
  badge: string;
  children: React.ReactNode;
}) {
  const BadgeIcon = toneIcon[tone];
  return (
    <li className="flex gap-4 px-4 py-3 sm:px-6">
      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="text-sm text-muted-foreground">{title}</span>
          <span className="font-semibold">{value}</span>
          <Badge className={badgeTone[tone]}>
            <BadgeIcon />
            {badge}
          </Badge>
        </div>
        <div className="text-sm text-muted-foreground">{children}</div>
      </div>
    </li>
  );
}

function PayrollChart({ series }: { series: SeriesMonth[] }) {
  const [selected, setSelected] = useState(series.length - 1);
  const max = Math.max(1, ...series.map((month) => month.total));
  const active = series[selected];

  return (
    <div className="space-y-3">
      <div className="flex h-48 items-end gap-0.5 sm:gap-1">
        {series.map((month, index) => (
          <button
            key={month.period}
            type="button"
            onClick={() => setSelected(index)}
            onMouseEnter={() => setSelected(index)}
            aria-label={`${formatPeriod(month.period)}: ${
              month.missing ? "nothing loaded" : `$${formatAmount(month.total)}`
            }`}
            aria-pressed={index === selected}
            className="group flex h-full min-w-0 flex-1 cursor-pointer items-end"
          >
            <span
              className={cn(
                "w-full rounded-t-sm transition-colors",
                month.missing
                  ? "h-full border border-dashed border-destructive/60 bg-destructive/5"
                  : month.drop
                  ? "bg-amber-400 group-hover:bg-amber-500"
                  : index === selected
                  ? "bg-primary"
                  : "bg-primary/40 group-hover:bg-primary/60"
              )}
              style={
                month.missing
                  ? undefined
                  : { height: `${Math.max(2, (month.total / max) * 100)}%` }
              }
            />
          </button>
        ))}
      </div>
      <div className="flex h-4 gap-0.5 text-[11px] text-muted-foreground sm:gap-1">
        {series.map((month) => {
          const monthNumber = month.period % 100;
          return (
            <span key={month.period} className="relative min-w-0 flex-1">
              {/* Every quarter on wider screens, every half year on phones */}
              <span
                className={cn(
                  "absolute left-1/2 -translate-x-1/2 whitespace-nowrap",
                  monthNumber % 3 !== 1 && "invisible",
                  monthNumber % 6 !== 1 && "max-sm:invisible"
                )}
              >
                {formatPeriod(month.period).replace(/ (\d\d)(\d\d)$/, " ’$2")}
              </span>
            </span>
          );
        })}
      </div>
      {active && (
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 rounded-lg border bg-muted/30 px-4 py-2.5 text-sm">
          <span className="font-semibold">{formatPeriod(active.period)}</span>
          {active.missing ? (
            <span className="text-destructive">
              Nothing loaded for this payroll month.
            </span>
          ) : (
            <>
              <span className="tabular-nums">${formatAmount(active.total)}</span>
              <span className="text-muted-foreground">
                {active.people.toLocaleString()} people ·{" "}
                {active.entries.toLocaleString()} entries
              </span>
              {active.drop && (
                <Badge className={badgeTone.warning}>
                  <AlertTriangle />
                  Fewer people than the month before
                </Badge>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default function Overview({ loaderData }: Route.ComponentProps) {
  const { overview, lastUpload } = loaderData;
  const series = monthlySeries(
    overview.latestPayrollMonth,
    overview.payrollMonths
  );
  const missingMonths = series.filter((month) => month.missing);
  const dropMonths = series.filter((month) => month.drop);
  const latestMonth = series[series.length - 1];

  const interestLag =
    overview.latestInterestMonth !== null &&
    overview.latestPayrollMonth !== null
      ? monthsBetween(overview.latestInterestMonth, overview.latestPayrollMonth)
      : null;
  const interestTone: BadgeTone =
    interestLag === null
      ? "danger"
      : interestLag <= INTEREST_LAG_OK
      ? "success"
      : interestLag <= INTEREST_LAG_WARNING
      ? "warning"
      : "danger";

  const signInShare =
    overview.pensioners > 0
      ? Math.round((overview.pensionersWithEmail / overview.pensioners) * 100)
      : 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Overview</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          The pension database at a glance: how much is recorded, whether every
          payroll month has been loaded, and how far interest has been computed.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatTile
          icon={Users}
          label="Pensioners"
          value={overview.pensioners.toLocaleString()}
          detail={`${overview.admins} admin${overview.admins === 1 ? "" : "s"}`}
        />
        <StatTile
          icon={KeyRound}
          label="Can sign in"
          value={overview.pensionersWithEmail.toLocaleString()}
          detail={`${signInShare}% have an email`}
        />
        <StatTile
          icon={Wallet}
          label="Contributions"
          value={compactAmount.format(overview.contributionTotal)}
          detail={`${overview.contributionRows.toLocaleString()} entries`}
        />
        <StatTile
          icon={Percent}
          label="Interest computed"
          value={compactAmount.format(overview.interestTotal)}
          detail={
            overview.latestInterestMonth !== null
              ? `to ${formatPeriod(overview.latestInterestMonth)}`
              : "none yet"
          }
        />
      </div>

      <Card className="gap-0 overflow-hidden py-0">
        <CardHeader className="border-b py-4 [.border-b]:pb-4">
          <CardTitle className="flex items-center gap-2 text-lg">
            <ShieldCheck className="size-4 text-muted-foreground" />
            Is the data up to date?
          </CardTitle>
        </CardHeader>
        <ul className="divide-y">
          <StatusRow
            icon={BarChart3}
            title="Latest payroll loaded"
            value={
              overview.latestPayrollMonth !== null
                ? formatPeriod(overview.latestPayrollMonth)
                : "None"
            }
            tone={missingMonths.length > 0 ? "warning" : "success"}
            badge={
              missingMonths.length > 0
                ? `${missingMonths.length} month${missingMonths.length === 1 ? "" : "s"} missing`
                : "No gaps"
            }
          >
            {latestMonth && !latestMonth.missing
              ? `${latestMonth.people.toLocaleString()} people paid. `
              : ""}
            {missingMonths.length > 0
              ? `Nothing loaded for ${missingMonths
                  .map((month) => formatPeriod(month.period))
                  .join(", ")} in the last ${series.length} months.`
              : `Every payroll month in the last ${series.length} months has contributions.`}
          </StatusRow>

          <StatusRow
            icon={Percent}
            title="Interest computed to"
            value={
              overview.latestInterestMonth !== null
                ? formatPeriod(overview.latestInterestMonth)
                : "Never"
            }
            tone={interestTone}
            badge={
              interestLag === null
                ? "Not computed"
                : interestLag <= 0
                ? "Up to date"
                : `${interestLag} month${interestLag === 1 ? "" : "s"} behind`
            }
          >
            {interestLag === null
              ? "No interest has been computed yet."
              : interestLag <= INTEREST_LAG_OK
              ? `Computed for ${overview.latestInterestPeople.toLocaleString()} people; in step with the payroll.`
              : `Computed for ${overview.latestInterestPeople.toLocaleString()} people. Statements show no interest after ${formatPeriod(
                  overview.latestInterestMonth!
                )}, so balances are understated until the interest computation is run.`}
          </StatusRow>

          <StatusRow
            icon={Upload}
            title="Last upload in the app"
            value={lastUpload ? formatUploadTime(lastUpload.StartedAt) : "None"}
            tone={lastUpload ? STATUS[lastUpload.status].tone : "neutral"}
            badge={lastUpload ? STATUS[lastUpload.status].label : "None yet"}
          >
            {lastUpload ? (
              <>
                {lastUpload.FileName}
                {lastUpload.InPeriods.length > 0 &&
                  ` (${lastUpload.InPeriods.map(formatPeriod).join(", ")})`}{" "}
                by {lastUpload.UploadedBy}.{" "}
              </>
            ) : (
              "Payroll may have been loaded directly into the database. "
            )}
            <Link
              to="/contributions-upload"
              className="font-medium text-primary hover:underline"
            >
              Upload history
            </Link>
          </StatusRow>
        </ul>
      </Card>

      {series.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <BarChart3 className="size-4 text-muted-foreground" />
              Contributions per payroll month
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Total loaded for each payroll month (including arrears for
              earlier months), last {series.length} months. Select a month for
              details.
              {dropMonths.length > 0 &&
                ` Amber months paid noticeably fewer people than the month before: check the upload was complete.`}
            </p>
          </CardHeader>
          <CardContent>
            <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
              <span>{compactAmount.format(Math.max(...series.map((m) => m.total)))}</span>
              <span className="flex items-center gap-3">
                <span className="flex items-center gap-1.5">
                  <span className="size-2.5 rounded-sm bg-primary/40" />
                  Loaded
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="size-2.5 rounded-sm bg-amber-400" />
                  Drop
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="size-2.5 rounded-sm border border-dashed border-destructive/60" />
                  Missing
                </span>
              </span>
            </div>
            <PayrollChart series={series} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
