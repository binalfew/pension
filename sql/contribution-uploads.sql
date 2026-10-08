-- Upload history for the "Upload contributions" page.
-- Run once on each database (production included) before deploying the
-- version of the app that uses it. Safe to run again: it does nothing if
-- the table already exists.

IF OBJECT_ID('dbo.ContributionUploads', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.ContributionUploads (
    ID int IDENTITY(1, 1) NOT NULL PRIMARY KEY,
    FileName nvarchar(255) NOT NULL,
    -- SHA-256 of the uploaded file
    FileHash char(64) NOT NULL,
    UploadedBy nvarchar(255) NOT NULL,
    StartedAt datetime2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
    FinishedAt datetime2(0) NULL,
    -- running, succeeded, rejected (nothing changed, e.g. stale preview)
    -- or failed (unexpected error, nothing changed)
    Status varchar(20) NOT NULL,
    -- IN periods in the file, e.g. '202607'
    InPeriods nvarchar(200) NULL,
    FileRows int NOT NULL,
    Inserted int NULL,
    Updated int NULL,
    Message nvarchar(1000) NULL
  );

  CREATE INDEX IX_ContributionUploads_StartedAt
    ON dbo.ContributionUploads (StartedAt DESC);
END
