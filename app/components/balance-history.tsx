import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import type { AnnualSummaryRow } from "~/lib/statement-analysis";
import { cn, formatAmount } from "~/lib/utils";

const compactAmount = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumFractionDigits: 1,
});

// Chart drawing area, in SVG units; the SVG scales to the card width
const WIDTH = 640;
const HEIGHT = 240;
const PADDING = { top: 12, right: 16, bottom: 28, left: 56 };

// Running balance at the end of each year, split into contributions and the
// interest earned on top of them
function BalanceChart({ rows }: { rows: AnnualSummaryRow[] }) {
  const plotWidth = WIDTH - PADDING.left - PADDING.right;
  const plotHeight = HEIGHT - PADDING.top - PADDING.bottom;

  const values = rows.flatMap((row) => [
    row.contributionsToDate,
    row.closingBalance,
  ]);
  const minValue = Math.min(0, ...values);
  const maxValue = Math.max(1, ...values);
  const ticks = [0, 1, 2, 3, 4].map(
    (index) => minValue + ((maxValue - minValue) * index) / 4
  );

  const x = (index: number) =>
    PADDING.left +
    (rows.length === 1 ? plotWidth / 2 : (plotWidth * index) / (rows.length - 1));
  const y = (value: number) =>
    PADDING.top +
    plotHeight -
    ((value - minValue) / (maxValue - minValue)) * plotHeight;

  const line = (pick: (row: AnnualSummaryRow) => number) =>
    rows.map((row, index) => `${x(index)},${y(pick(row))}`);
  const contributionsLine = line((row) => row.contributionsToDate);
  const balanceLine = line((row) => row.closingBalance);
  const baseline = [`${x(rows.length - 1)},${y(0)}`, `${x(0)},${y(0)}`];

  // Label every year when they fit, otherwise every other one
  const labelEvery = rows.length > 10 ? 2 : 1;

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      className="w-full h-auto"
      role="img"
      aria-label="Balance at the end of each year"
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
        points={[...balanceLine, ...[...contributionsLine].reverse()].join(" ")}
        className="fill-emerald-500/30"
      />
      <polyline
        points={balanceLine.join(" ")}
        fill="none"
        strokeWidth={2}
        className="stroke-primary"
      />

      {rows.map((row, index) => (
        <g key={row.year}>
          <circle
            cx={x(index)}
            cy={y(row.closingBalance)}
            r={4}
            className="fill-background stroke-primary"
            strokeWidth={2}
          >
            <title>
              {`${row.label}: $${formatAmount(row.closingBalance)} (contributions $${formatAmount(row.contributionsToDate)}, interest $${formatAmount(row.interestToDate)})`}
            </title>
          </circle>
          {(index % labelEvery === 0 || index === rows.length - 1) && (
            <text
              x={x(index)}
              y={HEIGHT - 8}
              textAnchor="middle"
              className="fill-muted-foreground text-[11px]"
            >
              {row.label}
            </text>
          )}
        </g>
      ))}
    </svg>
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

export function BalanceHistory({ rows }: { rows: AnnualSummaryRow[] }) {
  if (rows.length === 0) {
    return null;
  }

  // Only show columns that have something in them
  const showVoluntary = rows.some((row) => row.voluntary !== 0);
  const showOther = rows.some((row) => row.other !== 0);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg">Balance over time</CardTitle>
        <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-primary/20 border border-primary/40" />
            Contributions
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-emerald-500/30 border border-emerald-500/50" />
            Interest
          </span>
          <span>Balance at the end of each year. Hover a point for details.</span>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <BalanceChart rows={rows} />

        <div className="-mx-6 border-t">
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
                  <Amount
                    value={row.closingBalance}
                    className="font-semibold"
                  />
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
