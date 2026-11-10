import { format } from "date-fns";
import {
  findStatementPeople,
  statementsZipStream,
} from "~/lib/bulk-statements.server";
import { requireAdminEmail } from "~/lib/user-admin.server";
import type { Route } from "./+types/statements.download";

// Sends a ZIP of statement PDFs: either the people ticked on the Statements
// page, or everyone matching its filter
export async function action({ request }: Route.ActionArgs) {
  const adminEmail = await requireAdminEmail(request);
  const form = await request.formData();

  const filter = {
    query: String(form.get("q") ?? ""),
    office: String(form.get("office") ?? ""),
    noEmailOnly: form.get("noEmail") === "1",
  };
  let chosen;
  let label;
  if (form.get("scope") === "all") {
    // Everyone at once is too much to send out by mistake: whole downloads
    // are one office at a time
    if (!filter.office) {
      throw new Response("Choose an office to download", { status: 400 });
    }
    chosen = await findStatementPeople({ filter });
    label = filter.office;
  } else {
    const keys = form.getAll("person").map(String);
    chosen = keys.length > 0 ? await findStatementPeople({ keys }) : [];
    label = chosen.length === 1 ? chosen[0].sapIds[0] : "selected";
  }
  if (chosen.length === 0) {
    throw new Response("No statements to download", { status: 400 });
  }

  console.log(
    `[statements] ${adminEmail} downloaded ${chosen.length} statement(s) (${label})`
  );

  const slug = String(label)
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  const fileName = `pension-statements-${slug || "office"}-${format(
    new Date(),
    "yyyy-MM-dd"
  )}.zip`;
  return new Response(statementsZipStream(chosen, request.signal), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Cache-Control": "no-store",
    },
  });
}
