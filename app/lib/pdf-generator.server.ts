import PDFDocument from "pdfkit";
import type { ComputedInterest } from "~/types/computed-interest";
import type { ContributionView } from "~/types/contribution-view";
import type { Account, Statement } from "~/types/statement";

interface PensionStatementData {
  statement: Statement;
  total: Account;
  contributions: ContributionView[];
  computedInterests: ComputedInterest[];
}

export function generatePensionStatementPDF(
  data: PensionStatementData
): Promise<Buffer> {
  const doc = new PDFDocument({
    margin: 50,
    size: "A4",
    autoFirstPage: false,
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
    const infoBoxHeight = 80;

    // Draw info box border
    doc
      .strokeColor("black")
      .rect(50, infoBoxY, doc.page.width - 100, infoBoxHeight)
      .stroke();

    doc
      .fillColor("black")
      .fontSize(12)
      .font("Helvetica-Bold")
      .text("Employee Name:", 60, infoBoxY + 15);
    doc
      .fillColor("black")
      .fontSize(12)
      .font("Helvetica")
      .text(data.statement.EmployeeFullName, 200, infoBoxY + 15);

    doc
      .fillColor("black")
      .fontSize(12)
      .font("Helvetica-Bold")
      .text("SAP ID:", 60, infoBoxY + 35);
    doc
      .fillColor("black")
      .fontSize(12)
      .font("Helvetica")
      .text(data.statement.EmployeeID.toString(), 200, infoBoxY + 35);

    doc
      .fillColor("black")
      .fontSize(12)
      .font("Helvetica-Bold")
      .text("Statement Date:", 60, infoBoxY + 55);
    doc
      .fillColor("black")
      .fontSize(12)
      .font("Helvetica")
      .text(data.statement.AsOfMonth.toLocaleDateString(), 200, infoBoxY + 55);

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

    doc.end();
  });
}

function formatPeriod(period: number): string {
  const year = Math.floor(period / 100);
  const month = period % 100;
  const date = new Date(year, month - 1);
  return date.toLocaleDateString("en-US", { year: "numeric", month: "short" });
}
