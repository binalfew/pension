import { getUserEmail } from "~/lib/auth.server";
import { resolveUserByEmail } from "~/lib/db.server";
import { generatePensionStatementPDF } from "~/lib/pdf-generator.server";
import { selectStatement } from "~/lib/statement-access.server";
import type { Route } from "./+types/api.pdf";

export async function loader({ request }: Route.LoaderArgs) {
  const userEmail = await getUserEmail(request);

  if (!userEmail) {
    throw new Response("Unauthorized", { status: 401 });
  }

  // Resolve user from both tables
  const resolvedUser = await resolveUserByEmail(userEmail);

  if (!resolvedUser) {
    throw new Response("User not found", { status: 404 });
  }

  const selection = await selectStatement(
    resolvedUser,
    new URL(request.url).searchParams,
    { fallbackToOwn: false }
  );
  if (selection.status === "none") {
    throw new Response("SAP ID required for admin users", { status: 400 });
  }
  if (selection.status === "error") {
    throw new Response(selection.message, { status: selection.httpStatus });
  }
  const { statementData } = selection;

  try {
    // Generate PDF
    const pdfBuffer = await generatePensionStatementPDF(statementData);

    // Return PDF as response
    return new Response(pdfBuffer as BodyInit, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="pension-statement-${statementData.statement.SapIds.join("-")}.pdf"`,
        "Content-Length": pdfBuffer.length.toString(),
      },
    });
  } catch (error) {
    console.error("Error generating PDF:", error);
    throw new Response("Error generating PDF", { status: 500 });
  }
}
