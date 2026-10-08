// Shared look for the admin tables and badges, so the data quality and
// upload pages match

// Soft badge colours: green for good, amber for needs attention, red for
// errors
export const badgeTone = {
  success: "border-transparent bg-primary/10 text-primary",
  warning:
    "border-transparent bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
  danger: "border-transparent bg-destructive/10 text-destructive",
  info: "border-transparent bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200",
  neutral: "border-transparent bg-muted text-muted-foreground",
} as const;

export type BadgeTone = keyof typeof badgeTone;

// Icon tile colours, matching the badges
export const iconTone: Record<BadgeTone, string> = {
  success: "bg-primary/10 text-primary",
  warning:
    "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-200",
  danger: "bg-destructive/10 text-destructive",
  info: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-200",
  neutral: "bg-muted text-muted-foreground",
};

export const tableHeaderClass = "bg-muted [&_th]:px-4";
export const tableBodyClass = "[&_td]:px-4";

// For a table that scrolls inside its card: scroll the table's own container
// so the sticky header works
export const scrollingTableClass =
  "border-t [&_[data-slot=table-container]]:max-h-[480px] [&_[data-slot=table-container]]:overflow-y-auto";
export const stickyTableHeaderClass = `sticky top-0 z-10 ${tableHeaderClass}`;
