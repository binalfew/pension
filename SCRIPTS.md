# SQL Diagnostic Scripts

A collection of SQL Server scripts for diagnosing, inspecting, and troubleshooting the AU Pension system database.

Run these against the database referenced by `DATABASE_URL` in `.env`. All scripts target Microsoft SQL Server syntax.

---

## Table of contents

1. [Login & user resolution](#1-login--user-resolution)
2. [Pension data inspection (by SAPID)](#2-pension-data-inspection-by-sapid)
3. [Data integrity checks](#3-data-integrity-checks)
4. [Admin users](#4-admin-users)
5. [System-wide statistics](#5-system-wide-statistics)
6. [Search & exploration](#6-search--exploration)

---

## Schema reference

| Table / View         | Purpose                                                          | Key columns                                                                              |
| -------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `users`              | Pensioner identities; the bridge from email to `SAPID`           | `PensionID`, `FullName`, `Email`, `SAPID`                                                |
| `adminUsers`         | Administrator emails; bypass the SAPID lookup                    | `ID`, `Email`                                                                            |
| `contributionTypes` | Lookup table for contribution categories (Employee, Employer, …) | `ID`, `ContributionTypeName`                                                             |
| `contributions`      | Raw monthly contribution rows                                    | `SAPID`, `ContributionTypeID`, `Amount`, `ForPeriod`, `InPeriod`, `OfficeName`           |
| `ContributionView`   | Denormalized view used by the UI's monthly transactions table    | `SAPID`, `ForPeriod`, `InPeriod`, `Amount`, `OfficeName`, `ContributionTypeName`         |
| `ComputedInterests`  | Pre-computed monthly interest per pensioner                      | `ID`, `SAPID`, `YearMonth`, `Interest`                                                   |

The full resolution chain the app walks on every login:

```
Microsoft email → cookie → users / adminUsers → SAPID → contributions / ContributionView / ComputedInterests
```

---

## 1. Login & user resolution

### 1.1 Is an email recognized?

Mirrors `resolveUserByEmail()` in `app/lib/db.server.ts`. Returns rows from both tables so you can see which role (if any) the email would resolve to.

```sql
DECLARE @Email NVARCHAR(255) = 'binalfewk@africanunion.org';

-- Admin path
SELECT 'adminUsers' AS Source, ID, Email
FROM adminUsers
WHERE LOWER(LTRIM(RTRIM(Email))) = LOWER(LTRIM(RTRIM(@Email)));

-- Pensioner path
SELECT 'users' AS Source, PensionID, SAPID, FullName, Email
FROM users
WHERE LOWER(LTRIM(RTRIM(Email))) = LOWER(LTRIM(RTRIM(@Email)));
```

**Expected output**

- Both queries return rows → impossible in normal operation; investigate duplicate identity.
- Only `adminUsers` row → user lands on the admin search screen.
- Only `users` rows → user lands on their own pension statement (if `SAPID` is not NULL). Several rows with different SAP IDs is normal: the app opens the most recently active SAP ID and shows a switcher for the others (see [3.1](#31-emails-linked-to-several-sap-ids-and-duplicate-sap-id-rows)).
- Both empty → app shows the "No pension record found" card.

The `LOWER(LTRIM(RTRIM(...)))` wrap reproduces the app's `.trim().toLowerCase()` normalisation. SQL Server's default collation is case-insensitive, but case-sensitive collations exist; this wrap is portable.

---

### 1.2 Full diagnostic chain for one email

End-to-end trace: email → row → SAPID → contributions → interests. Run this when a specific user reports the "No pension record" screen or an empty statement.

```sql
DECLARE @Email NVARCHAR(255) = 'binalfewk@africanunion.org';

-- Step 1: admin lookup
SELECT 'Step 1: adminUsers' AS Step, ID, Email FROM adminUsers
WHERE LOWER(LTRIM(RTRIM(Email))) = LOWER(LTRIM(RTRIM(@Email)));

-- Step 2: pensioner lookup
SELECT 'Step 2: users' AS Step, PensionID, SAPID, FullName, Email FROM users
WHERE LOWER(LTRIM(RTRIM(Email))) = LOWER(LTRIM(RTRIM(@Email)));

-- Step 3: resolve SAPID the way the app does when an email has several:
-- most recent contribution first (ignoring the 20152017 opening-balance
-- row), then the highest SAP ID
DECLARE @SapId INT = (
  SELECT TOP 1 u.SAPID FROM users u
  WHERE LOWER(LTRIM(RTRIM(u.Email))) = LOWER(LTRIM(RTRIM(@Email)))
  ORDER BY
    (SELECT MAX(c.ForPeriod) FROM contributions c
     WHERE c.SAPID = u.SAPID AND c.ForPeriod <= 999912) DESC,
    u.SAPID DESC
);
SELECT 'Step 3: SAPID' AS Step, @SapId AS SAPID;

-- Step 4: contribution rows
SELECT 'Step 4: contributions' AS Step,
       COUNT(*)    AS NumRows,
       SUM(Amount) AS TotalAmount
FROM contributions WHERE SAPID = @SapId;

-- Step 5: ContributionView rows (drives the transactions table)
SELECT 'Step 5: ContributionView' AS Step, COUNT(*) AS NumRows
FROM ContributionView WHERE SAPID = @SapId;

-- Step 6: computed interests
SELECT 'Step 6: ComputedInterests' AS Step,
       COUNT(*)      AS NumRows,
       SUM(Interest) AS TotalInterest
FROM ComputedInterests WHERE SAPID = @SapId;
```

**Where the chain typically breaks**

| First empty step | Diagnosis                                                                                  | Fix                                                                       |
| ---------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| Step 1 & 2       | Email unknown                                                                              | Insert the user (see [4](#4-admin-users) or pensioner insert in [3.5](#35-insert-a-pensioner)) |
| Step 3 (NULL)    | `users` row exists, `SAPID` is NULL                                                        | Set the SAPID; UI shows "No pension data available" until then            |
| Step 4 (0)       | SAPID set, no contribution rows                                                            | Data load issue — check the contributions ETL                              |
| Step 5 (0)       | `contributions` has rows, view returns none                                                | Inspect the `ContributionView` definition; likely a JOIN mismatch          |
| Step 6 (0)       | Interest job hasn't run for this user                                                      | Run / backfill the interest computation                                    |

---

### 1.3 Fuzzy lookup when the email isn't matching

When a user swears they should be in the system but step 1.1 returns nothing — try matching by name fragment or partial email.

```sql
DECLARE @Fragment NVARCHAR(100) = 'binalfew';

SELECT 'users' AS Source, PensionID, SAPID, FullName, Email
FROM users
WHERE Email    LIKE '%' + @Fragment + '%'
   OR FullName LIKE '%' + @Fragment + '%';

SELECT 'adminUsers' AS Source, ID, Email
FROM adminUsers
WHERE Email LIKE '%' + @Fragment + '%';
```

**Expected output**

If a row appears with an email different from the one the user signed in with, the record exists under a different address (e.g. `@au.int` vs `@africanunion.org`). Either update the `Email` column or have the user sign in with the matching address.

---

## 2. Pension data inspection (by SAPID)

### 2.1 Full statement for a SAPID

Replicates exactly what `generatePensionStatement()` in `app/lib/db.server.ts` returns.

```sql
DECLARE @SapId INT = 12345;

-- Per-account balances (one row per contribution type)
SELECT ct.ContributionTypeName       AS AccountName,
       COUNT(c.ID)                   AS Entries,
       ISNULL(SUM(c.Amount), 0)      AS Balance
FROM contributionTypes ct
LEFT JOIN contributions c
  ON c.ContributionTypeID = ct.ID
 AND c.SAPID              = @SapId
GROUP BY ct.ContributionTypeName
ORDER BY ct.ContributionTypeName;

-- Cumulative interest
SELECT 'CUMULATIVE INTERESTS' AS AccountName,
       ISNULL(SUM(Interest), 0) AS Balance
FROM ComputedInterests
WHERE SAPID = @SapId;

-- Grand total
SELECT ISNULL(SUM(c.Amount), 0) + ISNULL(
  (SELECT SUM(Interest) FROM ComputedInterests WHERE SAPID = @SapId), 0
) AS TotalBalance
FROM contributions c
WHERE c.SAPID = @SapId;
```

**Expected output**

Three result sets that should match the three rows the UI renders on the statement card: per-account balances, the cumulative interest line, and the TOTAL row.

---

### 2.2 Monthly transactions

Drives the "Monthly Transactions" table in the UI.

```sql
DECLARE @SapId INT = 12345;

SELECT TOP 100 *
FROM ContributionView
WHERE SAPID = @SapId
ORDER BY ForPeriod DESC;
```

**Expected output**

One row per contribution for the SAPID. `ForPeriod` and `InPeriod` are encoded as `YYYYMM` integers (see `formatPeriod` in `app/lib/utils.ts`). `EMPLOYER ACCOUNT` rows are highlighted in the UI.

---

### 2.3 Monthly interests

Drives the "Computed Interests" table in the UI.

```sql
DECLARE @SapId INT = 12345;

SELECT *
FROM ComputedInterests
WHERE SAPID = @SapId
ORDER BY YearMonth DESC;
```

**Expected output**

One row per month with `YearMonth` (encoded `YYYYMM`) and the computed `Interest` amount.

---

### 2.4 Contribution breakdown by office

Sometimes the question is "which office paid which contributions". Useful when a user changes duty stations.

```sql
DECLARE @SapId INT = 12345;

SELECT OfficeName,
       ContributionTypeName,
       COUNT(*)    AS Entries,
       SUM(Amount) AS Total
FROM ContributionView
WHERE SAPID = @SapId
GROUP BY OfficeName, ContributionTypeName
ORDER BY OfficeName, ContributionTypeName;
```

**Expected output**

A matrix of office × contribution type. Empty result means no contributions exist for that SAPID yet.

---

## 3. Data integrity checks

### 3.1 Emails linked to several SAP IDs, and duplicate SAP ID rows

One person can legitimately have several SAP IDs under the same email (for example after a change of contract). The app supports this: at login it loads every SAP ID for the email, opens the most recently active one (latest contribution, then highest SAP ID), and lets the person switch between them or see them combined. **These links are not errors — don't remove them during cleanup.**

Emails linked to more than one SAP ID (informational):

```sql
SELECT Email,
       COUNT(DISTINCT SAPID)                                          AS SapIds,
       STRING_AGG(CAST(SAPID AS VARCHAR(20)), ', ')
         WITHIN GROUP (ORDER BY SAPID)                                 AS SapIdList
FROM (SELECT DISTINCT Email, SAPID
      FROM users
      WHERE Email IS NOT NULL AND SAPID IS NOT NULL) AS links
GROUP BY Email
HAVING COUNT(DISTINCT SAPID) > 1
ORDER BY SapIds DESC, Email;
```

**Expected output**

Rows here are normal. Only check one if the SAP IDs plainly belong to different people (different names); that's a wrong email on one record, not a reason to unlink the others.

The real integrity problem is the same SAP ID appearing in more than one `users` row. This matches the "Duplicate SAP IDs" list on the app's Data quality page:

```sql
SELECT SAPID,
       COUNT(*)                                     AS UserRows,
       STRING_AGG(ISNULL(FullName, '(no name)'), ' | ') AS Names,
       STRING_AGG(ISNULL(Email, '(no email)'), ' | ')   AS Emails
FROM users
WHERE SAPID IS NOT NULL
GROUP BY SAPID
HAVING COUNT(*) > 1
ORDER BY UserRows DESC, SAPID;
```

**Expected output**

Empty is healthy. The app copes with these (it prefers the row that has an email), but each one should be reduced to a single row. When merging, keep the row with the correct email so the person keeps access to all of their SAP IDs.

---

### 3.2 Duplicate emails in `adminUsers`

```sql
SELECT Email, COUNT(*) AS Duplicates
FROM adminUsers
GROUP BY Email
HAVING COUNT(*) > 1;
```

---

### 3.3 Email present in both `users` and `adminUsers`

Should never happen — the role becomes ambiguous (app prefers Admin).

```sql
SELECT u.Email
FROM users u
INNER JOIN adminUsers a
  ON LOWER(LTRIM(RTRIM(u.Email))) = LOWER(LTRIM(RTRIM(a.Email)));
```

**Expected output**

Empty. Any row should be reconciled — decide whether the person is admin or pensioner.

---

### 3.4 Pensioner rows missing critical fields

These users will hit the "No pension data available" branch even though they're in `users`.

```sql
SELECT PensionID, SAPID, FullName, Email
FROM users
WHERE SAPID IS NULL
   OR Email IS NULL
   OR LTRIM(RTRIM(Email)) = '';
```

**Expected output**

Empty in a clean dataset. Each row returned is a user who can authenticate but cannot see any pension data.

---

### 3.5 Insert a pensioner

Template — adjust values to match your data. **Run inside a transaction first** to verify before committing.

```sql
BEGIN TRANSACTION;

INSERT INTO users (PensionID, SAPID, FullName, Email)
VALUES (1001, 555555, 'Last, First Middle', 'first.last@africanunion.org');

-- Verify
SELECT * FROM users WHERE SAPID = 555555;

-- ROLLBACK; -- to undo
-- COMMIT;   -- to keep
```

---

### 3.6 Orphan contributions (no matching user)

Contribution rows whose `SAPID` doesn't exist in `users`.

```sql
SELECT c.SAPID, COUNT(*) AS OrphanRows, SUM(c.Amount) AS TotalAmount
FROM contributions c
LEFT JOIN users u ON u.SAPID = c.SAPID
WHERE u.SAPID IS NULL
GROUP BY c.SAPID
ORDER BY OrphanRows DESC;
```

**Expected output**

Empty in a clean dataset. Rows indicate ETL drift — contributions exist for a SAPID that isn't in the user master table, so those amounts never show up on any statement.

---

### 3.7 Orphan computed interests

```sql
SELECT ci.SAPID, COUNT(*) AS OrphanRows, SUM(ci.Interest) AS TotalInterest
FROM ComputedInterests ci
LEFT JOIN users u ON u.SAPID = ci.SAPID
WHERE u.SAPID IS NULL
GROUP BY ci.SAPID
ORDER BY OrphanRows DESC;
```

---

### 3.8 SAPID values used in `contributions` but no contribution type lookup

```sql
SELECT DISTINCT c.ContributionTypeID
FROM contributions c
LEFT JOIN contributionTypes ct ON ct.ID = c.ContributionTypeID
WHERE ct.ID IS NULL;
```

**Expected output**

Empty. Any row is a contribution attributed to an unknown type — it will be silently excluded from the per-account balances.

---

## 4. Admin users

### 4.1 List all admins

```sql
SELECT ID, Email
FROM adminUsers
ORDER BY Email;
```

---

### 4.2 Grant admin

```sql
INSERT INTO adminUsers (Email) VALUES ('admin.email@africanunion.org');

SELECT * FROM adminUsers WHERE Email = 'admin.email@africanunion.org';
```

**Expected output**

The newly inserted row. On next login the user will land on the admin search screen instead of a pensioner statement.

---

### 4.3 Revoke admin

```sql
DELETE FROM adminUsers WHERE Email = 'admin.email@africanunion.org';
```

---

## 5. System-wide statistics

### 5.1 Headline counts

```sql
SELECT
  (SELECT COUNT(*) FROM users)              AS Pensioners,
  (SELECT COUNT(*) FROM adminUsers)         AS Admins,
  (SELECT COUNT(*) FROM contributionTypes)  AS ContributionTypeCount,
  (SELECT COUNT(*) FROM contributions)      AS ContributionRows,
  (SELECT COUNT(*) FROM ComputedInterests)  AS InterestRows,
  (SELECT COUNT(DISTINCT SAPID) FROM contributions) AS DistinctContributors;
```

**Expected output**

A single row of system-wide totals. `DistinctContributors` should be `<=` `Pensioners` — if greater, there are orphan contributions (see [3.6](#36-orphan-contributions-no-matching-user)).

---

### 5.2 Pensioners with no contributions at all

```sql
SELECT u.PensionID, u.SAPID, u.FullName, u.Email
FROM users u
LEFT JOIN contributions c ON c.SAPID = u.SAPID
WHERE u.SAPID IS NOT NULL
  AND c.ID IS NULL;
```

**Expected output**

Each row is a registered pensioner with no contribution history — they will see an empty statement on login.

---

### 5.3 Contributions per period (system-wide)

```sql
SELECT TOP 24 ForPeriod,
       COUNT(*)    AS Entries,
       SUM(Amount) AS Total
FROM contributions
GROUP BY ForPeriod
ORDER BY ForPeriod DESC;
```

**Expected output**

Two-year rolling view of contribution volume by month. Sudden drops or zero months suggest a missed ETL run.

---

### 5.4 Latest interest computation date per SAPID

```sql
SELECT TOP 50 SAPID, MAX(YearMonth) AS LatestInterestMonth
FROM ComputedInterests
GROUP BY SAPID
ORDER BY LatestInterestMonth DESC;
```

**Expected output**

Top-50 most recently processed pensioners. If your latest period is months behind today's date, the interest job hasn't run.

---

## 6. Search & exploration

### 6.1 Search by partial name or SAP ID

Mirrors the autocomplete used by the admin search box (`searchUsers` in `app/lib/db.server.ts`).

```sql
DECLARE @Query NVARCHAR(100) = 'binalfew';

SELECT TOP 10 SAPID, FullName, Email
FROM users
WHERE CAST(SAPID AS VARCHAR) LIKE '%' + @Query + '%'
   OR FullName              LIKE '%' + @Query + '%'
   OR Email                 LIKE '%' + @Query + '%'
ORDER BY
  CASE
    WHEN CAST(SAPID AS VARCHAR) = @Query           THEN 1
    WHEN CAST(SAPID AS VARCHAR) LIKE @Query + '%'  THEN 2
    WHEN FullName              LIKE @Query + '%'  THEN 3
    ELSE 4
  END,
  FullName;
```

---

### 6.2 Most recent contributions across the whole system

```sql
SELECT TOP 50 *
FROM ContributionView
ORDER BY ForPeriod DESC, SAPID;
```

**Expected output**

Useful sanity check after an ETL run — confirms the most recent period actually loaded.

---

### 6.3 Find every contribution type a SAPID has used

```sql
DECLARE @SapId INT = 12345;

SELECT DISTINCT ContributionTypeName
FROM ContributionView
WHERE SAPID = @SapId;
```

---

## Conventions used in this file

- All `@Email` / `@SapId` / `@Query` / `@Fragment` declarations are placeholders — substitute real values before running.
- Avoid the reserved aliases `RowCount` and `Rows` (SQL Server tooling intermittently rejects them). The scripts above use `NumRows`, `Entries`, `Duplicates`, `OrphanRows`, etc.
- Inserts and deletes wrap a `BEGIN TRANSACTION` only where shown. Run modifying queries against a non-production environment first or wrap them yourself.
- Period columns (`ForPeriod`, `InPeriod`, `YearMonth`) are integers in `YYYYMM` form (e.g. `202503` = March 2025). The UI formats them via `formatPeriod()` in `app/lib/utils.ts`.
