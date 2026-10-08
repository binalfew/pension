import { AlertTriangle, ChevronDown, Mail } from "lucide-react";
import { useState } from "react";
import {
  discrepancyMailto,
  formatPeriodRange,
  type ContributionGap,
} from "~/lib/statement-analysis";
import { cn } from "~/lib/utils";

// How many gaps to list before "Show all"
const INITIAL_COUNT = 5;

function describeGap(gap: ContributionGap) {
  const months = gap.months === 1 ? "1 month" : `${gap.months} months`;
  return gap.kind === "missing"
    ? `No contributions recorded (${months})`
    : `Employee contribution without an employer share (${months})`;
}

// Months that look incomplete, so the pensioner can spot and report missing
// contributions
export function ContributionGaps({
  gaps,
  fullName,
  showSapId,
  supportEmail,
}: {
  gaps: ContributionGap[];
  fullName: string;
  // Combined statements cover several SAP IDs, so say which one
  showSapId: boolean;
  supportEmail: string | null;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);

  if (gaps.length === 0) {
    return null;
  }

  const visibleGaps = showAll ? gaps : gaps.slice(0, INITIAL_COUNT);

  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        className="flex w-full items-center gap-3 px-4 py-2.5 text-left cursor-pointer"
      >
        <AlertTriangle className="w-4 h-4 flex-shrink-0 text-amber-600 dark:text-amber-400" />
        <span className="flex-1 text-sm font-medium text-foreground">
          {gaps.length === 1
            ? "1 period may be missing contributions"
            : `${gaps.length} periods may be missing contributions`}
        </span>
        <span className="flex items-center gap-1 text-sm font-medium text-amber-700 dark:text-amber-400">
          {isOpen ? "Hide" : "Review"}
          <ChevronDown
            className={cn(
              "w-4 h-4 transition-transform",
              isOpen && "rotate-180"
            )}
          />
        </span>
      </button>

      {isOpen && (
        <>
          <p className="border-t border-amber-200 px-4 py-2 text-sm text-muted-foreground dark:border-amber-900">
            This can be expected, for example during unpaid leave or before a
            late payment is posted. If you think a period is wrong, report it to
            the Pension Office.
          </p>

          <ul className="divide-y divide-amber-200 border-t border-amber-200 dark:divide-amber-900 dark:border-amber-900">
            {visibleGaps.map((gap) => {
              const period = formatPeriodRange(gap.from, gap.to);
              return (
                <li
                  key={`${gap.sapId}-${gap.from}-${gap.kind}`}
                  className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 text-sm"
                >
                  <div>
                    <span className="font-medium">{period}</span>
                    {showSapId && (
                      <span className="text-muted-foreground">
                        {" "}
                        · SAP ID {gap.sapId}
                      </span>
                    )}
                    <div className="text-muted-foreground">
                      {describeGap(gap)}
                    </div>
                  </div>
                  {supportEmail && (
                    <a
                      href={discrepancyMailto({
                        supportEmail,
                        fullName,
                        sapIds: [gap.sapId],
                        period: `${period} – ${describeGap(gap)}`,
                      })}
                      className="flex items-center gap-1 text-primary hover:underline"
                    >
                      <Mail className="w-3.5 h-3.5" />
                      Report
                    </a>
                  )}
                </li>
              );
            })}
          </ul>

          {gaps.length > INITIAL_COUNT && (
            <button
              type="button"
              onClick={() => setShowAll(!showAll)}
              className="w-full px-4 py-2 text-sm font-medium text-primary hover:underline border-t border-amber-200 dark:border-amber-900 cursor-pointer"
            >
              {showAll ? "Show fewer" : `Show all ${gaps.length}`}
            </button>
          )}
        </>
      )}
    </div>
  );
}
