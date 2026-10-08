import { Layers, Loader2 } from "lucide-react";
import { Link, useNavigation } from "react-router";
import { useSpinDelay } from "spin-delay";
import { cn, formatAmount, formatPeriod } from "~/lib/utils";
import type { SapIdSummary } from "~/types/sap-id-summary";

function formatPeriodRange(summary: SapIdSummary) {
  if (summary.FirstPeriod === null || summary.LastPeriod === null) {
    return "No dated contributions";
  }
  const first = formatPeriod(summary.FirstPeriod);
  const last = formatPeriod(summary.LastPeriod);
  return first === last ? first : `${first} – ${last}`;
}

// Lets a person with multiple SAP IDs switch between their statements, or
// see all of them combined. Renders only the children when there is a single
// SAP ID.
export function SapIdSwitcher({
  summaries,
  currentSapId,
  isCombined,
  children,
}: {
  summaries: SapIdSummary[];
  currentSapId: number;
  // Whether the combined statement for all SAP IDs is showing
  isCombined: boolean;
  children: React.ReactNode;
}) {
  // SAP ID (or combined view) being switched to, while its statement is
  // loading
  const navigation = useNavigation();
  const pendingParams =
    navigation.state === "loading" && navigation.location.pathname === "/"
      ? new URLSearchParams(navigation.location.search)
      : null;
  const pendingCombined = pendingParams?.get("view") === "combined";
  const pendingSapId = pendingCombined
    ? null
    : Number(pendingParams?.get("sapId")) || null;
  const isCombinedSelected = pendingParams ? pendingCombined : isCombined;
  const isSwitching = useSpinDelay(pendingSapId !== null || pendingCombined, {
    delay: 150,
    minDuration: 300,
  });

  const combinedBalance = summaries.reduce(
    (sum, summary) => sum + summary.Balance,
    0
  );

  return (
    <>
      {summaries.length > 1 && (
        <div className="rounded-lg border border-border bg-card shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-border">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Layers className="w-4 h-4 text-primary" />
              {summaries.length} SAP IDs registered to this person
            </div>
            <div className="text-sm text-muted-foreground">
              Combined balance{" "}
              <span className="font-bold text-primary">
                ${formatAmount(combinedBalance)}
              </span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 p-3">
            {summaries.map((summary) => {
              const isSelected = pendingParams
                ? summary.SAPID === pendingSapId
                : !isCombined && summary.SAPID === currentSapId;
              return (
                <Link
                  key={summary.SAPID}
                  to={`?sapId=${summary.SAPID}`}
                  aria-current={isSelected ? "page" : undefined}
                  className={cn(
                    "flex flex-1 basis-48 items-center justify-between gap-3 px-3 py-2 rounded-md border transition-colors",
                    isSelected
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background border-border hover:bg-muted/50"
                  )}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 text-sm font-semibold">
                      {isSwitching && summary.SAPID === pendingSapId && (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      )}
                      {summary.SAPID}
                    </div>
                    <div
                      className={cn(
                        "text-xs",
                        isSelected
                          ? "text-primary-foreground/80"
                          : "text-muted-foreground"
                      )}
                    >
                      {formatPeriodRange(summary)}
                    </div>
                  </div>
                  <div className="text-sm font-semibold flex-shrink-0">
                    ${formatAmount(summary.Balance)}
                  </div>
                </Link>
              );
            })}
            <Link
              to={`?sapId=${summaries[0].SAPID}&view=combined`}
              aria-current={isCombinedSelected ? "page" : undefined}
              className={cn(
                "flex flex-1 basis-48 items-center justify-between gap-3 px-3 py-2 rounded-md border transition-colors",
                isCombinedSelected
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background border-border hover:bg-muted/50"
              )}
            >
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 text-sm font-semibold">
                  {isSwitching && pendingCombined ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Layers className="w-3.5 h-3.5" />
                  )}
                  All combined
                </div>
                <div
                  className={cn(
                    "text-xs",
                    isCombinedSelected
                      ? "text-primary-foreground/80"
                      : "text-muted-foreground"
                  )}
                >
                  {summaries.length} SAP IDs
                </div>
              </div>
              <div className="text-sm font-semibold flex-shrink-0">
                ${formatAmount(combinedBalance)}
              </div>
            </Link>
          </div>
        </div>
      )}

      <div
        aria-busy={isSwitching}
        className={cn(
          "space-y-6 transition-opacity",
          isSwitching && "opacity-50 pointer-events-none"
        )}
      >
        {children}
      </div>
    </>
  );
}
