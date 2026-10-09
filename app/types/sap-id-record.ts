// What the database holds for a SAP ID: its users rows and contributions
export type SapIdRecord = {
  sapId: number;
  users: Array<{ FullName: string | null; Email: string | null }>;
  contributions: number;
  total: number;
  firstPeriod: number | null;
  lastPeriod: number | null;
  office: string | null;
};
