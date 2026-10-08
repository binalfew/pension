import { BarChart3, Table2 } from "lucide-react";
import { useState } from "react";
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
  AnnualSummaryRow,
  BalanceHistoryData,
  MonthlyBalance,
} from "~/lib/statement-analysis";
import {
  cn,
  formatAmount,
  formatPeriod,
  OPENING_PERIOD_LABEL,
} from "~/lib/utils";

const compactAmount = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumFractionDigits: 1,
});

// Chart drawing area, in SVG units; the SVG scales to the card width
const WIDTH = 640;
const HEIGHT = 260;
const PADDING = { top: 24, right: 32, bottom: 28, left: 56 };
const PLOT_WIDTH = WIDTH - PADDING.left - PADDING.right;
const PLOT_HEIGHT = HEIGHT - PADDING.top - PADDING.bottom;

// Round axis bounds and a step of 1, 2, 2.5 or 5 times a power of ten, so
// the labels read $0, $25K, $50K rather than odd values
function niceTicks(min: number, max: number) {
  const rough = (max - min) / 4 || 1;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const step =
    [1, 2, 2.5, 5, 10]
      .map((factor) => factor * magnitude)
      .find((candidate) => candidate >= rough) ?? rough;
  const ticks: number[] = [];
  for (
    let tick = Math.floor(min / step) * step;
    tick <= Math.ceil(max / step) * step + step / 2;
    tick += step
  ) {
    ticks.push(tick);
  }
  return ticks;
}

// Month labels for short histories, otherwise one label per year (thinned
// out so they don't overlap)
function axisLabels(months: MonthlyBalance[]) {
  const labels =
    months.length <= 18
      ? months.map((month, index) => ({
          index,
          label: formatPeriod(month.period),
        }))
      : months.flatMap((month, index) =>
          month.period % 100 === 1
            ? [{ index, label: String(Math.floor(month.period / 100)) }]
            : []
        );
  const maxLabels = months.length <= 18 ? 6 : 8;
  const step = Math.ceil(labels.length / maxLabels);
  return labels.filter((_, index) => index % step === 0);
}

function BalanceChart({
  months,
  interestThrough,
}: {
  months: MonthlyBalance[];
  interestThrough: number | null;
}) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const values = months.flatMap((month) => [
    month.contributionsToDate,
    month.balance,
  ]);
  const ticks = niceTicks(Math.min(0, ...values), Math.max(1, ...values));
  const minValue = ticks[0];
  const maxValue = ticks[ticks.length - 1];

  const x = (index: number) =>
    PADDING.left + (PLOT_WIDTH * index) / (months.length - 1);
  const y = (value: number) =>
    PADDING.top +
    PLOT_HEIGHT -
    ((value - minValue) / (maxValue - minValue)) * PLOT_HEIGHT;

  const line = (pick: (month: MonthlyBalance) => number) =>
    months.map((month, index) => `${x(index)},${y(pick(month))}`);
  const contributionsLine = line((month) => month.contributionsToDate);
  const balanceLine = line((month) => month.balance);
  const baseline = [`${x(months.length - 1)},${y(0)}`, `${x(0)},${y(0)}`];

  // Mark where interest stops, if contributions carry on after it
  const interestEndIndex =
    interestThrough !== null &&
    interestThrough < months[months.length - 1].period
      ? months.findIndex((month) => month.period === interestThrough)
      : -1;

  // Nearest month to the pointer
  const handlePointer = (event: React.PointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const svgX = ((event.clientX - rect.left) / rect.width) * WIDTH;
    const index = Math.round(
      ((svgX - PADDING.left) / PLOT_WIDTH) * (months.length - 1)
    );
    setActiveIndex(Math.min(months.length - 1, Math.max(0, index)));
  };

  const lastIndex = months.length - 1;
  const active = activeIndex !== null ? months[activeIndex] : null;
  const activeOnRight = activeIndex !== null && activeIndex > lastIndex / 2;

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="w-full h-auto touch-pan-y select-none"
        role="img"
        aria-label="Balance at the end of each month"
        onPointerMove={handlePointer}
        onPointerDown={handlePointer}
        onPointerLeave={() => setActiveIndex(null)}
      >
        {ticks.map((tick) => (
          <g key={tick}>
            <line
              x1={PADDING.left}
              x2={WIDTH - PADDING.right}
              y1={y(tick)}
              y2={y(tick)}
              className="stroke-border"
            />
            <text
              x={PADDING.left - 8}
              y={y(tick)}
              textAnchor="end"
              dominantBaseline="middle"
              className="fill-muted-foreground text-[11px]"
            >
              {compactAmount.format(tick)}
            </text>
          </g>
        ))}

        <polygon
          points={[...contributionsLine, ...baseline].join(" ")}
          className="fill-primary/20"
        />
        <polygon
          points={[...balanceLine, ...[...contributionsLine].reverse()].join(
            " "
          )}
          className="fill-emerald-500/30"
        />
        <polyline
          points={balanceLine.join(" ")}
          fill="none"
          strokeWidth={2}
          strokeLinejoin="round"
          className="stroke-primary"
        />

        {interestEndIndex >= 0 && (
          <g>
            <line
              x1={x(interestEndIndex)}
              x2={x(interestEndIndex)}
              y1={PADDING.top}
              y2={PADDING.top + PLOT_HEIGHT}
              strokeDasharray="4 4"
              className="stroke-emerald-600 dark:stroke-emerald-400"
            />
            <text
              x={
                x(interestEndIndex) +
                (interestEndIndex > lastIndex / 2 ? -6 : 6)
              }
              y={PADDING.top - 8}
              textAnchor={interestEndIndex > lastIndex / 2 ? "end" : "start"}
              className="fill-emerald-700 dark:fill-emerald-400 text-[11px]"
            >
              {`Interest computed to ${formatPeriod(interestThrough!)}`}
            </text>
          </g>
        )}

        {axisLabels(months).map(({ index, label }) => (
          <text
            key={index}
            x={x(index)}
            y={HEIGHT - 8}
            textAnchor="middle"
            className="fill-muted-foreground text-[11px]"
          >
            {label}
          </text>
        ))}

        {active && activeIndex !== null ? (
          <g>
            <line
              x1={x(activeIndex)}
              x2={x(activeIndex)}
              y1={PADDING.top}
              y2={PADDING.top + PLOT_HEIGHT}
              className="stroke-muted-foreground/60"
            />
            <circle
              cx={x(activeIndex)}
              cy={y(active.contributionsToDate)}
              r={3.5}
              className="fill-background stroke-primary/60"
              strokeWidth={2}
            />
            <circle
              cx={x(activeIndex)}
              cy={y(active.balance)}
              r={4.5}
              className="fill-background stroke-primary"
              strokeWidth={2}
            />
          </g>
        ) : (
          <circle
            cx={x(lastIndex)}
            cy={y(months[lastIndex].balance)}
            r={4}
            className="fill-primary"
          />
        )}
      </svg>

      {active && activeIndex !== null && (
        <div
          className={cn(
            "pointer-events-none absolute top-6 w-52 rounded-md border bg-popover px-3 py-2 text-xs shadow-md",
            activeOnRight ? "-translate-x-full -ml-3" : "ml-3"
          )}
          style={{ left: `${(x(activeIndex) / WIDTH) * 100}%` }}
        >
          <div className="mb-1.5 font-semibold text-foreground">
            {formatPeriod(active.period)}
          </div>
          <dl className="space-y-1">
            <TooltipRow label="Balance" value={active.balance} strong />
            <TooltipRow
              label="Contributions"
              value={active.contributionsToDate}
            />
            <TooltipRow label="Interest" value={active.interestToDate} />
            <TooltipRow
              label="Added this month"
              value={active.contributed + active.interest}
              signed
            />
          </dl>
        </div>
      )}
    </div>
  );
}

function TooltipRow({
  label,
  value,
  strong,
  signed,
}: {
  label: string;
  value: number;
  strong?: boolean;
  signed?: boolean;
}) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          "tabular-nums",
          strong && "font-semibold text-foreground",
          value < 0 && "text-destructive"
        )}
      >
        {signed && value > 0 ? "+" : ""}${formatAmount(value)}
      </dd>
    </div>
  );
}

function Amount({ value, className }: { value: number; className?: string }) {
  return (
    <TableCell
      className={cn(
        "text-right tabular-nums",
        value < 0 && "text-destructive",
        className
      )}
    >
      {value === 0 ? "—" : `$${formatAmount(value)}`}
    </TableCell>
  );
}

function AnnualTable({ rows }: { rows: AnnualSummaryRow[] }) {
  // Only show columns that have something in them
  const showVoluntary = rows.some((row) => row.voluntary !== 0);
  const showOther = rows.some((row) => row.other !== 0);

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Year</TableHead>
          <TableHead className="text-right">Employee</TableHead>
          <TableHead className="text-right">Employer</TableHead>
          {showVoluntary && (
            <TableHead className="text-right">Voluntary</TableHead>
          )}
          {showOther && (
            <TableHead
              className="text-right"
              title="Other accounts, such as arrears for 2015–2017"
            >
              Other
            </TableHead>
          )}
          <TableHead className="text-right">Interest</TableHead>
          <TableHead className="text-right">Added</TableHead>
          <TableHead className="text-right">Closing balance</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {/* Most recent year first */}
        {[...rows].reverse().map((row) => (
          <TableRow key={row.year}>
            <TableCell className="font-medium">{row.label}</TableCell>
            <Amount value={row.employee} />
            <Amount value={row.employer} />
            {showVoluntary && <Amount value={row.voluntary} />}
            {showOther && <Amount value={row.other} />}
            <Amount value={row.interest} />
            <Amount value={row.netChange} />
            <Amount value={row.closingBalance} className="font-semibold" />
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function ViewToggle({
  view,
  onChange,
}: {
  view: "chart" | "table";
  onChange: (view: "chart" | "table") => void;
}) {
  const options = [
    { value: "chart", label: "Chart", icon: BarChart3 },
    { value: "table", label: "Yearly table", icon: Table2 },
  ] as const;
  return (
    <div className="inline-flex rounded-md border bg-muted/40 p-0.5">
      {options.map(({ value, label, icon: Icon }) => (
        <button
          key={value}
          type="button"
          aria-pressed={view === value}
          onClick={() => onChange(value)}
          className={cn(
            "flex items-center gap-1.5 rounded px-2.5 py-1 text-sm font-medium transition-colors cursor-pointer",
            view === value
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <Icon className="w-3.5 h-3.5" />
          {label}
        </button>
      ))}
    </div>
  );
}

export function BalanceHistory({
  rows,
  history,
}: {
  rows: AnnualSummaryRow[];
  history: BalanceHistoryData;
}) {
  const [view, setView] = useState<"chart" | "table">("chart");
  const { opening, months, interestThrough } = history;

  if (rows.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="text-lg">Balance over time</CardTitle>
          <ViewToggle view={view} onChange={setView} />
        </div>
      </CardHeader>
      <CardContent>
        {view === "table" ? (
          <div className="-mx-6 border-t">
            <AnnualTable rows={rows} />
          </div>
        ) : months.length < 2 ? (
          <div className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">
            Not enough history to chart yet.
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-sm bg-primary/20 border border-primary/40" />
                Contributions
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-sm bg-emerald-500/30 border border-emerald-500/50" />
                Interest
              </span>
              {opening !== 0 && (
                <span>
                  Starts with ${formatAmount(opening)} of arrears for{" "}
                  {OPENING_PERIOD_LABEL}
                </span>
              )}
            </div>
            <BalanceChart months={months} interestThrough={interestThrough} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
