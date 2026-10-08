// The overview page's figures, cached briefly: it is the admin home page, and
// its queries scan the whole contributions and interest tables
import { cached, invalidate } from "./cache.server";
import { getDataQualitySummary, getSystemOverview } from "./db.server";

const OVERVIEW_KEY = "overview";
const QUALITY_KEY = "quality-summary";
const TTL_MS = 2 * 60 * 1000;

export function getCachedOverview() {
  return cached(OVERVIEW_KEY, TTL_MS, getSystemOverview);
}

export function getCachedQualitySummary() {
  return cached(QUALITY_KEY, TTL_MS, getDataQualitySummary);
}

// After the app changes the data
export function invalidateOverview() {
  invalidate(OVERVIEW_KEY, QUALITY_KEY);
}
