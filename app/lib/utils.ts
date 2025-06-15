import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Formats a period number (YYYYMM) into a readable date string (e.g., "Jan 2024")
 * @param period - The period number in YYYYMM format
 * @returns A formatted string like "Jan 2024" or the original input if invalid
 */
export function formatPeriod(period: number): string {
  // Convert to string and ensure it's 6 digits
  const periodStr = period.toString().padStart(6, "0");

  // Extract year and month
  const year = parseInt(periodStr.substring(0, 4));
  const month = parseInt(periodStr.substring(4, 6));

  // If month is not valid (1-12), return original input
  if (month < 1 || month > 12) {
    return period.toString();
  }

  const monthNames = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];

  return `${monthNames[month - 1]} ${year}`;
}
