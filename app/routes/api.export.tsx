import { generatePensionStatementBySapId } from "~/lib/db.server";
import { generatePensionStatementPDF } from "~/lib/pdf-generator";
import type { Route } from "./+types/api.export";

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const sapId = url.searchParams.get("sapId");

  if (!sapId) {
    throw new Error("SAP ID is required");
  }

  const sapIdNum = parseInt(sapId);
  if (isNaN(sapIdNum)) {
    throw new Error("Invalid SAP ID");
  }

  const statementData = await generatePensionStatementBySapId(sapIdNum);
  if (!statementData) {
    throw new Error("Pension statement not found");
  }

  const { statement, total, contributions, computedInterests } = statementData;

  // Generate PDF content
  const pdfBuffer = await generatePensionStatementPDF(
    statement,
    total,
    contributions,
    computedInterests
  );

  return new Response(pdfBuffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="pension-statement-${sapId}.pdf"`,
    },
  });
}
