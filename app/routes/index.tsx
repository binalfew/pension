import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  ClipboardCheck,
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
import { Fragment, Suspense, useRef, useState } from "react";
import { Await, Link, redirect } from "react-router";
import { PensionerSearch } from "~/components/pensioner-search";
import {
  badgeTone,
  iconTone,
  type BadgeTone,
} from "~/components/table-styles";
import { formatUploadTime, STATUS } from "~/components/upload-history";
import { Badge } from "~/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { getUserEmail } from "~/lib/auth.server";
import { getUploadHistory } from "~/lib/contribution-upload.server";
import { resolveUserByEmail } from "~/lib/db.server";
import {
  describeChange,
  monthlySeries,
  monthsBetween,
  type QualityCheckCount,
  type SeriesMonth,
} from "~/lib/overview";
import {
  getCachedOverview,
  getCachedQualitySummary,
} from "~/lib/overview.server";
import { cn, formatAmount, formatPeriod } from "~/lib/utils";
import type { Route } from "./+types/index";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Overview | AU Pension" }];
}

// Only admins (the pension office) can see system-wide figures
async function requireAdmin(request: Request) {
  const userEmail = await getUserEmail(request);
  const resolvedUser = userEmail ? await resolveUserByEmail(userEmail) : null;
  if (resolvedUser?.role !== "Admin") {
    throw redirect("/statement");
  }
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireAdmin(request);

  const [{ value: overview }, [lastUpload]] = await Promise.all([
    getCachedOverview(),
    getUploadHistory(1),
  ]);
  // Streamed in after the page: the full quality report is the slowest part
  const quality = getCachedQualitySummary().then(({ value }) => value);
  return { overview, lastUpload: lastUpload ?? null, quality };
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

function plural(count: number, word: string) {
  return `${count.toLocaleString()} ${word}${count === 1 ? "" : "s"}`;
}

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

function QualityRow({ checks }: { checks: QualityCheckCount[] }) {
  const failing = checks.filter((check) => check.count > 0);
  const issues = failing.reduce((sum, check) => sum + check.count, 0);
  return (
    <StatusRow
      icon={ClipboardCheck}
      title="Data quality"
      value={issues > 0 ? plural(issues, "issue") : "No issues"}
      tone={failing.length > 0 ? "warning" : "success"}
      badge={
        failing.length > 0
          ? `${failing.length} of ${checks.length} checks`
          : "All clear"
      }
    >
      {failing.length > 0 ? (
        <>
          {failing.map((check, index) => (
            <Fragment key={check.id}>
              {index > 0 && ", "}
              <Link
                to={`/data-quality#${check.id}`}
                className="hover:text-foreground hover:underline"
              >
                {check.label} ({check.count.toLocaleString()})
              </Link>
            </Fragment>
          ))}
          .{" "}
        </>
      ) : (
        "Every data-quality check passes. "
      )}
      <Link
        to="/data-quality"
        className="font-medium text-primary hover:underline"
      >
        Data quality report
      </Link>
    </StatusRow>
  );
}

const CHART_HEIGHT = "h-48";

function PayrollChart({ series }: { series: SeriesMonth[] }) {
  // Clicked or keyboard-chosen month; hovering previews another one
  const [selected, setSelected] = useState(series.length - 1);
  const [hovered, setHovered] = useState<number | null>(null);
  const barRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const max = Math.max(1, ...series.map((month) => month.total));
  const activeIndex = hovered ?? selected;
  const active = series[activeIndex];
  const previous = activeIndex > 0 ? series[activeIndex - 1] : undefined;

  function select(index: number) {
    const next = Math.min(series.length - 1, Math.max(0, index));
    setSelected(next);
    barRefs.current[next]?.focus();
  }

  const keyMoves: Record<string, (index: number) => number> = {
    ArrowLeft: (index) => index - 1,
    ArrowRight: (index) => index + 1,
    Home: () => 0,
    End: () => series.length - 1,
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        {/* Value axis */}
        <div
          className={cn(
            "relative w-12 shrink-0 text-right text-[11px] text-muted-foreground tabular-nums",
            CHART_HEIGHT
          )}
          aria-hidden
        >
          <span className="absolute top-0 right-0 -translate-y-1/2">
            {compactAmount.format(max)}
          </span>
          <span className="absolute top-1/2 right-0 -translate-y-1/2">
            {compactAmount.format(max / 2)}
          </span>
          <span className="absolute right-0 bottom-0 translate-y-1/2">$0</span>
        </div>
        <div
          role="group"
          aria-label="Contributions per payroll month. Use the arrow keys to move between months."
          className={cn(
            "relative flex min-w-0 flex-1 items-end gap-0.5 border-b border-border sm:gap-1",
            CHART_HEIGHT
          )}
          onMouseLeave={() => setHovered(null)}
        >
          <span
            className="pointer-events-none absolute inset-x-0 top-0 border-t border-dashed border-border"
            aria-hidden
          />
          <span
            className="pointer-events-none absolute inset-x-0 top-1/2 border-t border-dashed border-border"
            aria-hidden
          />
          {series.map((month, index) => (
            <button
              key={month.period}
              ref={(element) => {
                barRefs.current[index] = element;
              }}
              type="button"
              tabIndex={index === selected ? 0 : -1}
              onClick={() => select(index)}
              onMouseEnter={() => setHovered(index)}
              onKeyDown={(event) => {
                const move = keyMoves[event.key];
                if (move) {
                  event.preventDefault();
                  setHovered(null);
                  select(move(index));
                }
              }}
              aria-label={`${formatPeriod(month.period)}: ${
                month.missing
                  ? "nothing loaded"
                  : `$${formatAmount(month.total)}`
              }`}
              aria-pressed={index === selected}
              className="group relative flex h-full min-w-0 flex-1 cursor-pointer items-end rounded-t-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <span
                className={cn(
                  "w-full rounded-t-sm transition-colors",
                  month.missing
                    ? "h-full border border-dashed border-destructive/60 bg-destructive/5"
                    : month.peopleDrop || month.amountDrop
                    ? "bg-amber-400 group-hover:bg-amber-500"
                    : index === activeIndex
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
      </div>
      <div className="flex gap-2">
        <div className="w-12 shrink-0" />
        <div className="flex h-4 min-w-0 flex-1 gap-0.5 text-[11px] text-muted-foreground sm:gap-1">
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
                  {formatPeriod(month.period).replace(
                    / (\d\d)(\d\d)$/,
                    " ’$2"
                  )}
                </span>
              </span>
            );
          })}
        </div>
      </div>
      {active && (
        <div
          className="flex flex-wrap items-baseline gap-x-4 gap-y-1 rounded-lg border bg-muted/30 px-4 py-2.5 text-sm"
          aria-live="polite"
        >
          <span className="font-semibold">{formatPeriod(active.period)}</span>
          {active.missing ? (
            <span className="text-destructive">
              Nothing loaded for this payroll month.
            </span>
          ) : (
            <>
              <span className="tabular-nums">
                ${formatAmount(active.total)}
              </span>
              <span className="text-muted-foreground">
                {active.people.toLocaleString()} people ·{" "}
                {active.entries.toLocaleString()} entries
              </span>
              {previous && !previous.missing && (
                <span className="text-muted-foreground">
                  vs {formatPeriod(previous.period)}: people{" "}
                  {describeChange(active.people, previous.people)}, amount{" "}
                  {describeChange(active.total, previous.total)}
                </span>
              )}
              {active.peopleDrop && (
                <Badge className={badgeTone.warning}>
                  <AlertTriangle />
                  Fewer people than the month before
                </Badge>
              )}
              {active.amountDrop && (
                <Badge className={badgeTone.warning}>
                  <AlertTriangle />
                  Less money than the month before
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
  const { overview, lastUpload, quality } = loaderData;

  const series = monthlySeries(
    overview.latestPayrollMonth,
    overview.payrollMonths
  );
  const missingMonths = series.filter((month) => month.missing);
  const dropMonths = series.filter(
    (month) => month.peopleDrop || month.amountDrop
  );
  const latestMonth = series[series.length - 1];
  const monthBefore = series[series.length - 2];
  const latestDropped =
    !!latestMonth && (latestMonth.peopleDrop || latestMonth.amountDrop);

  const interestLag =
    overview.latestInterestMonth !== null &&
    overview.latestPayrollMonth !== null
      ? monthsBetween(overview.latestInterestMonth, overview.latestPayrollMonth)
      : null;
  const lagTone: BadgeTone =
    interestLag === null
      ? "danger"
      : interestLag <= INTEREST_LAG_OK
      ? "success"
      : interestLag <= INTEREST_LAG_WARNING
      ? "warning"
      : "danger";
  // People left out of the computation are worth chasing even when it's on time
  const interestTone: BadgeTone =
    lagTone === "success" && overview.interestMissingPeople > 0
      ? "warning"
      : lagTone;

  const emailShare =
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

      <PensionerSearch />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatTile
          icon={Users}
          label="Pensioners"
          value={overview.pensioners.toLocaleString()}
          detail={plural(overview.admins, "admin")}
        />
        <StatTile
          icon={KeyRound}
          label="Have an email"
          value={overview.pensionersWithEmail.toLocaleString()}
          detail={`${emailShare}% of pensioners`}
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
            tone={
              missingMonths.length > 0 || latestDropped ? "warning" : "success"
            }
            badge={
              missingMonths.length > 0
                ? `${plural(missingMonths.length, "month")} missing`
                : latestDropped
                ? "Smaller than the month before"
                : "No gaps"
            }
          >
            {latestMonth && !latestMonth.missing && (
              <>
                {latestMonth.people.toLocaleString()} people paid{" "}
                {compactAmount.format(latestMonth.total)}
                {monthBefore && !monthBefore.missing
                  ? ` (people ${describeChange(
                      latestMonth.people,
                      monthBefore.people
                    )}, amount ${describeChange(
                      latestMonth.total,
                      monthBefore.total
                    )} on ${formatPeriod(monthBefore.period)}). `
                  : ". "}
              </>
            )}
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
                : interestLag > INTEREST_LAG_OK
                ? `${plural(interestLag, "month")} behind`
                : overview.interestMissingPeople > 0
                ? `${overview.interestMissingPeople.toLocaleString()} left out`
                : "Up to date"
            }
          >
            {interestLag === null
              ? "No interest has been computed yet."
              : `Computed for ${overview.latestInterestPeople.toLocaleString()} people${
                  interestLag <= INTEREST_LAG_OK
                    ? "; in step with the payroll."
                    : `. Statements show no interest after ${formatPeriod(
                        overview.latestInterestMonth!
                      )}, so balances are understated until the interest computation is run.`
                }`}
            {overview.interestMissingPeople > 0 &&
              ` ${plural(
                overview.interestMissingPeople,
                "pensioner"
              )} paid by ${formatPeriod(
                overview.latestInterestMonth!
              )} ${
                overview.interestMissingPeople === 1 ? "has" : "have"
              } no interest for it, so their balances are understated.`}
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

          <Suspense
            fallback={
              <StatusRow
                icon={ClipboardCheck}
                title="Data quality"
                value="Checking…"
                tone="neutral"
                badge="Running checks"
              >
                Running the data-quality checks.
              </StatusRow>
            }
          >
            <Await
              resolve={quality}
              errorElement={
                <StatusRow
                  icon={ClipboardCheck}
                  title="Data quality"
                  value="Unknown"
                  tone="danger"
                  badge="Checks failed"
                >
                  The data-quality checks couldn't be run.{" "}
                  <Link
                    to="/data-quality"
                    className="font-medium text-primary hover:underline"
                  >
                    Try the full report
                  </Link>
                </StatusRow>
              }
            >
              {(checks) => <QualityRow checks={checks} />}
            </Await>
          </Suspense>
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
                ` Amber months paid noticeably fewer people or less money than the month before: check the upload was complete.`}
            </p>
          </CardHeader>
          <CardContent>
            <div className="mb-3 flex justify-end gap-3 text-xs text-muted-foreground">
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
            </div>
            <PayrollChart series={series} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
