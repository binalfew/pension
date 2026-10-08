import PDFDocument from "pdfkit";
import type { PensionStatementData } from "./db.server";
import { getAnnualSummary } from "./statement-analysis";

export function generatePensionStatementPDF(
  data: PensionStatementData
): Promise<Buffer> {
  const doc = new PDFDocument({
    margin: 50,
    size: "A4",
    autoFirstPage: false,
    // Keep pages in memory so the footer can say "Page X of Y"
    bufferPages: true,
  });
  const buffers: Buffer[] = [];

  doc.on("data", buffers.push.bind(buffers));

  return new Promise((resolve, reject) => {
    doc.on("end", () => {
      const pdfData = Buffer.concat(buffers);
      resolve(pdfData);
    });

    doc.on("error", reject);

    // Add the first page manually
    doc.addPage();

    // Header
    doc
      .fillColor("black")
      .fontSize(24)
      .font("Helvetica-Bold")
      .text("African Union", 50, 50, { align: "center" });
    doc
      .fillColor("black")
      .fontSize(18)
      .font("Helvetica")
      .text("Pension Statement", 50, 80, { align: "center" });

    // Draw a line under the title
    doc
      .strokeColor("black")
      .moveTo(50, 100)
      .lineTo(doc.page.width - 50, 100)
      .stroke();

    // Employee details in a box
    const infoBoxY = 120;
    const details: Array<[string, string]> = [
      ["Employee Name:", data.statement.EmployeeFullName],
      [
        data.statement.SapIds.length > 1 ? "SAP IDs:" : "SAP ID:",
        data.statement.SapIds.join(", "),
      ],
      [
        "Contributions as of:",
        formatOptionalPeriod(data.statement.ContributionsThrough),
      ],
      ["Interest as of:", formatOptionalPeriod(data.statement.InterestThrough)],
      [
        "Generated on:",
        new Date().toLocaleDateString("en-US", {
          year: "numeric",
          month: "long",
          day: "numeric",
        }),
      ],
    ];
    const infoBoxHeight = details.length * 20 + 20;

    // Draw info box border
    doc
      .strokeColor("black")
      .rect(50, infoBoxY, doc.page.width - 100, infoBoxHeight)
      .stroke();

    details.forEach(([label, value], index) => {
      const y = infoBoxY + 15 + index * 20;
      doc
        .fillColor("black")
        .fontSize(12)
        .font("Helvetica-Bold")
        .text(label, 60, y);
      doc.fillColor("black").fontSize(12).font("Helvetica").text(value, 210, y);
    });

    // Account Details Table
    const tableY = infoBoxY + infoBoxHeight + 30;
    doc
      .fillColor("black")
      .fontSize(14)
      .font("Helvetica-Bold")
      .text("Account Breakdown", 50, tableY);

    // Table setup
    const tableStartY = tableY + 25;
    const tableWidth = doc.page.width - 100;
    const rowHeight = 25;
    const col1Width = tableWidth * 0.7;
    const col2Width = tableWidth * 0.3;

    // Table header
    doc.fillColor("#e0e0e0").rect(50, tableStartY, col1Width, rowHeight).fill();
    doc
      .fillColor("#e0e0e0")
      .rect(50 + col1Width, tableStartY, col2Width, rowHeight)
      .fill();
    doc
      .strokeColor("black")
      .rect(50, tableStartY, col1Width, rowHeight)
      .stroke();
    doc
      .strokeColor("black")
      .rect(50 + col1Width, tableStartY, col2Width, rowHeight)
      .stroke();

    doc
      .fillColor("black")
      .fontSize(12)
      .font("Helvetica-Bold")
      .text("Account Type", 60, tableStartY + 8);
    doc
      .fillColor("black")
      .fontSize(12)
      .font("Helvetica-Bold")
      .text("Balance (USD)", 50 + col1Width + 10, tableStartY + 8);

    let currentY = tableStartY + rowHeight;

    // Account rows (excluding TOTAL)
    data.statement.Accounts.filter(
      (acc) => acc.AccountName !== "TOTAL"
    ).forEach((account, index) => {
      const fillColor = index % 2 === 0 ? "#ffffff" : "#f9f9f9";

      doc.fillColor(fillColor).rect(50, currentY, col1Width, rowHeight).fill();
      doc
        .fillColor(fillColor)
        .rect(50 + col1Width, currentY, col2Width, rowHeight)
        .fill();
      doc
        .strokeColor("black")
        .rect(50, currentY, col1Width, rowHeight)
        .stroke();
      doc
        .strokeColor("black")
        .rect(50 + col1Width, currentY, col2Width, rowHeight)
        .stroke();

      doc
        .fillColor("black")
        .fontSize(10)
        .font("Helvetica")
        .text(account.AccountName, 60, currentY + 8);
      doc
        .fillColor("black")
        .fontSize(10)
        .font("Helvetica")
        .text(
          `$${account.Balance.toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}`,
          50 + col1Width + 10,
          currentY + 8
        );

      currentY += rowHeight;
    });

    // Total Balance Row
    doc.fillColor("#d4edda").rect(50, currentY, col1Width, rowHeight).fill();
    doc
      .fillColor("#d4edda")
      .rect(50 + col1Width, currentY, col2Width, rowHeight)
      .fill();
    doc.strokeColor("black").rect(50, currentY, col1Width, rowHeight).stroke();
    doc
      .strokeColor("black")
      .rect(50 + col1Width, currentY, col2Width, rowHeight)
      .stroke();

    doc
      .fillColor("black")
      .fontSize(12)
      .font("Helvetica-Bold")
      .text("TOTAL BALANCE", 60, currentY + 8);
    doc
      .fillColor("black")
      .fontSize(12)
      .font("Helvetica-Bold")
      .text(
        `$${(
          data.statement.Accounts.find((acc) => acc.AccountName === "TOTAL")
            ?.Balance ?? 0
        ).toLocaleString(undefined, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}`,
        50 + col1Width + 10,
        currentY + 8
      );

    // Yearly summary
    const rows = getAnnualSummary(data.contributions, data.computedInterests);
    if (rows.length > 0) {
      currentY = drawAnnualSummary(doc, rows, currentY + rowHeight + 30);
    }

    // Notes
    const notes = [
      "All amounts are in US dollars. Contributions are shown in the year they are for.",
    ];
    const { ContributionsThrough, InterestThrough } = data.statement;
    if (
      InterestThrough !== null &&
      ContributionsThrough !== null &&
      InterestThrough < ContributionsThrough
    ) {
      notes.push(
        `Interest has been computed up to ${formatPeriod(
          InterestThrough
        )}. Contributions after that month do not include interest yet.`
      );
    }
    currentY += 20;
    if (currentY > doc.page.height - FOOTER_SPACE - 40) {
      doc.addPage();
      currentY = 50;
    }
    doc.fillColor("#555555").fontSize(9).font("Helvetica");
    notes.forEach((note) => {
      doc.text(note, 50, currentY, { width: doc.page.width - 100 });
      currentY = doc.y + 4;
    });

    drawFooters(doc);

    doc.end();
  });
}

// Room kept free at the bottom of each page for the footer
const FOOTER_SPACE = 60;

const SUMMARY_COLUMNS = [
  { title: "Year", width: 75 },
  { title: "Employee", width: 84 },
  { title: "Employer", width: 84 },
  { title: "Other", width: 84 },
  { title: "Interest", width: 84 },
  { title: "Closing balance", width: 84 },
];

function formatMoney(value: number): string {
  if (value === 0) {
    return "-";
  }
  return `$${value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function drawSummaryRow(
  doc: PDFKit.PDFDocument,
  cells: string[],
  y: number,
  { header, fill }: { header?: boolean; fill: string }
) {
  const rowHeight = 20;
  let x = 50;
  SUMMARY_COLUMNS.forEach((column, index) => {
    doc.fillColor(fill).rect(x, y, column.width, rowHeight).fill();
    doc.strokeColor("#999999").rect(x, y, column.width, rowHeight).stroke();
    doc
      .fillColor("black")
      .fontSize(9)
      .font(header || index === 0 ? "Helvetica-Bold" : "Helvetica")
      .text(cells[index], x + 6, y + 6, {
        width: column.width - 12,
        align: index === 0 ? "left" : "right",
        lineBreak: false,
      });
    x += column.width;
  });
  return y + rowHeight;
}

// Year-by-year table, oldest first, continuing onto new pages as needed.
// Returns the y position below the table.
function drawAnnualSummary(
  doc: PDFKit.PDFDocument,
  rows: ReturnType<typeof getAnnualSummary>,
  startY: number
): number {
  const headerCells = SUMMARY_COLUMNS.map((column) => column.title);
  const bottom = doc.page.height - FOOTER_SPACE;
  let y = startY;

  // Start on a new page if the title, header and a few rows don't fit
  if (y + 25 + 20 * 4 > bottom) {
    doc.addPage();
    y = 50;
  }
  doc
    .fillColor("black")
    .fontSize(14)
    .font("Helvetica-Bold")
    .text("Yearly Summary", 50, y);
  y = drawSummaryRow(doc, headerCells, y + 25, {
    header: true,
    fill: "#e0e0e0",
  });

  rows.forEach((row, index) => {
    if (y + 20 > bottom) {
      doc.addPage();
      y = drawSummaryRow(doc, headerCells, 50, {
        header: true,
        fill: "#e0e0e0",
      });
    }
    y = drawSummaryRow(
      doc,
      [
        row.label,
        formatMoney(row.employee),
        formatMoney(row.employer),
        formatMoney(row.voluntary + row.other),
        formatMoney(row.interest),
        formatMoney(row.closingBalance),
      ],
      y,
      { fill: index % 2 === 0 ? "#ffffff" : "#f9f9f9" }
    );
  });
  return y;
}

// "Page X of Y" and the generation date at the bottom of every page
function drawFooters(doc: PDFKit.PDFDocument) {
  const generatedOn = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const range = doc.bufferedPageRange();
  for (let index = range.start; index < range.start + range.count; index++) {
    doc.switchToPage(index);
    // Writing inside the bottom margin would otherwise start a new page
    const bottomMargin = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    const y = doc.page.height - 40;
    doc
      .strokeColor("#cccccc")
      .moveTo(50, y - 8)
      .lineTo(doc.page.width - 50, y - 8)
      .stroke();
    doc
      .fillColor("#777777")
      .fontSize(8)
      .font("Helvetica")
      .text(
        `African Union Pension Statement · Generated on ${generatedOn}`,
        50,
        y,
        {
          lineBreak: false,
        }
      );
    doc.text(`Page ${index - range.start + 1} of ${range.count}`, 50, y, {
      width: doc.page.width - 100,
      align: "right",
      lineBreak: false,
    });
    doc.page.margins.bottom = bottomMargin;
  }
}

function formatOptionalPeriod(period: number | null): string {
  return period === null ? "None recorded" : formatPeriod(period);
}

function formatPeriod(period: number): string {
  const year = Math.floor(period / 100);
  const month = period % 100;
  const date = new Date(year, month - 1);
  return date.toLocaleDateString("en-US", { year: "numeric", month: "short" });
}
