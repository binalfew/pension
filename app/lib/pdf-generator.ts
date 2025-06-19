import puppeteer from "puppeteer";

export async function generatePensionStatementPDF(
  statement: any,
  total: any,
  contributions: any[],
  computedInterests: any[]
): Promise<Buffer> {
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    const page = await browser.newPage();

    // Generate HTML content
    const htmlContent = generateHTML(
      statement,
      total,
      contributions,
      computedInterests
    );

    await page.setContent(htmlContent);

    // Generate PDF
    const pdfBuffer = await page.pdf({
      format: "A4",
      margin: {
        top: "20mm",
        right: "20mm",
        bottom: "20mm",
        left: "20mm",
      },
      printBackground: true,
    });

    return Buffer.from(pdfBuffer);
  } finally {
    await browser.close();
  }
}

function generateHTML(
  statement: any,
  total: any,
  contributions: any[],
  computedInterests: any[]
): string {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>Pension Statement</title>
      <style>
        body {
          font-family: Arial, sans-serif;
          margin: 0;
          padding: 20px;
          color: #333;
        }
        .disclaimer {
          background: #fef3c7;
          border: 1px solid #f59e0b;
          border-radius: 8px;
          padding: 15px;
          margin-bottom: 30px;
          font-size: 12px;
          color: #92400e;
        }
        .disclaimer strong {
          color: #78350f;
        }
        .header {
          text-align: center;
          border-bottom: 2px solid #2563eb;
          padding-bottom: 20px;
          margin-bottom: 30px;
        }
        .header h1 {
          color: #2563eb;
          margin: 0;
          font-size: 24px;
        }
        .employee-info {
          background: #f8fafc;
          padding: 15px;
          border-radius: 8px;
          margin-bottom: 30px;
        }
        .employee-info h2 {
          margin: 0 0 10px 0;
          color: #1e293b;
          font-size: 18px;
        }
        .info-row {
          display: flex;
          justify-content: space-between;
          margin-bottom: 5px;
        }
        .section {
          margin-bottom: 30px;
        }
        .section h3 {
          color: #2563eb;
          border-bottom: 1px solid #e2e8f0;
          padding-bottom: 5px;
          margin-bottom: 15px;
        }
        .account-item {
          display: flex;
          justify-content: space-between;
          padding: 8px 0;
          border-bottom: 1px solid #f1f5f9;
        }
        .account-item.total {
          font-weight: bold;
          background: #f8fafc;
          padding: 12px 0;
          border-top: 2px solid #e2e8f0;
        }
        .amount {
          font-weight: 600;
          color: #059669;
        }
        .total-amount {
          font-weight: bold;
          color: #2563eb;
          font-size: 18px;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          margin-top: 10px;
        }
        th, td {
          padding: 8px;
          text-align: left;
          border-bottom: 1px solid #e2e8f0;
        }
        th {
          background: #f8fafc;
          font-weight: 600;
        }
        .page-break {
          page-break-before: always;
        }
        @media print {
          .page-break {
            page-break-before: always;
          }
        }
      </style>
    </head>
    <body>
      <div class="disclaimer">
        <strong>DISCLAIMER:</strong> This summary may contain errors. Please verify all information with the official pension records before making any financial decisions.
      </div>
      
      <div class="header">
        <h1>PENSION STATEMENT</h1>
      </div>
      
      <div class="employee-info">
        <h2>Employee Information</h2>
        <div class="info-row">
          <span><strong>Name:</strong> ${statement.EmployeeFullName}</span>
          <span><strong>SAP ID:</strong> ${statement.EmployeeID}</span>
        </div>
        <div class="info-row">
          <span><strong>As of:</strong> ${new Date().toLocaleDateString()}</span>
        </div>
      </div>
      
      <div class="section">
        <h3>Account Summary</h3>
        ${statement.Accounts.filter((acc: any) => acc.AccountName !== "TOTAL")
          .map(
            (acc: any) => `
          <div class="account-item">
            <span>${acc.AccountName}</span>
            <span class="amount">$${acc.Balance.toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}</span>
          </div>
        `
          )
          .join("")}
        <div class="account-item total">
          <span>TOTAL BALANCE</span>
          <span class="total-amount">$${total.Balance.toLocaleString(
            undefined,
            {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            }
          )}</span>
        </div>
      </div>
      
      ${
        contributions.length > 0
          ? `
        <div class="page-break"></div>
        <div class="section">
          <h3>Recent Contributions</h3>
          <table>
            <thead>
              <tr>
                <th>Period</th>
                <th>Amount</th>
                <th>Type</th>
                <th>Office</th>
              </tr>
            </thead>
            <tbody>
              ${contributions
                .slice(0, 15)
                .map(
                  (cont: any) => `
                <tr>
                  <td>${formatPeriod(cont.ForPeriod)}</td>
                  <td class="amount">$${cont.Amount.toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}</td>
                  <td>${cont.ContributionTypeName}</td>
                  <td>${cont.OfficeName}</td>
                </tr>
              `
                )
                .join("")}
            </tbody>
          </table>
        </div>
      `
          : ""
      }
      
      ${
        computedInterests.length > 0
          ? `
        <div class="page-break"></div>
        <div class="section">
          <h3>Computed Interests</h3>
          <table>
            <thead>
              <tr>
                <th>Year Month</th>
                <th>Interest</th>
              </tr>
            </thead>
            <tbody>
              ${computedInterests
                .slice(0, 20)
                .map(
                  (int: any) => `
                <tr>
                  <td>${formatPeriod(int.YearMonth)}</td>
                  <td class="amount">$${int.Interest.toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}</td>
                </tr>
              `
                )
                .join("")}
            </tbody>
          </table>
        </div>
      `
          : ""
      }
    </body>
    </html>
  `;
}

function formatPeriod(period: number): string {
  const periodStr = period.toString().padStart(6, "0");
  const year = parseInt(periodStr.substring(0, 4));
  const month = parseInt(periodStr.substring(4, 6));

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
