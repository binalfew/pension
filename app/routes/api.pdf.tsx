import { getUserEmail } from "~/lib/auth.server";
import {
  generatePensionStatement,
  generatePensionStatementBySapId,
  resolveUserByEmail,
} from "~/lib/db.server";
import { generatePensionStatementPDF } from "~/lib/pdf-generator.server";
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

  const { user, role } = resolvedUser;
  const url = new URL(request.url);
  const selectedSapId = url.searchParams.get("sapId");

  let statementData;

  // For admin users
  if (role === "Admin") {
    if (selectedSapId) {
      const sapId = parseInt(selectedSapId);
      if (isNaN(sapId)) {
        throw new Response("Invalid SAP ID", { status: 400 });
      }

      statementData = await generatePensionStatementBySapId(sapId);
      if (!statementData) {
        throw new Response(`Pension statement not found for SAP ID ${sapId}`, {
          status: 404,
        });
      }
    } else {
      throw new Response("SAP ID required for admin users", { status: 400 });
    }
  } else {
    // For pensioner users - they can only view their own statement
    if (role === "Pensioner" && "SAPID" in user && user.SAPID) {
      statementData = await generatePensionStatement(user);
    } else {
      throw new Response("No pension data available", { status: 404 });
    }
  }

  if (!statementData) {
    throw new Response("No statement data available", { status: 404 });
  }

  try {
    // Generate PDF
    const pdfBuffer = await generatePensionStatementPDF(statementData);

    // Return PDF as response
    return new Response(pdfBuffer as BodyInit, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="pension-statement-${statementData.statement.EmployeeID}.pdf"`,
        "Content-Length": pdfBuffer.length.toString(),
      },
    });
  } catch (error) {
    console.error("Error generating PDF:", error);
    throw new Response("Error generating PDF", { status: 500 });
  }
}
