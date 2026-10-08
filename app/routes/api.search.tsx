import { data } from "react-router";
import { getUserEmail } from "~/lib/auth.server";
import { resolveUserByEmail, searchUsers } from "~/lib/db.server";
import type { Route } from "./+types/api.search";

export async function loader({ request }: Route.LoaderArgs) {
  // Search exposes every pensioner's name and email, so it is admin-only
  const userEmail = await getUserEmail(request);
  const resolvedUser = userEmail ? await resolveUserByEmail(userEmail) : null;
  if (resolvedUser?.role !== "Admin") {
    throw new Response("Forbidden", { status: 403 });
  }

  const url = new URL(request.url);
  const query = url.searchParams.get("q");

  if (!query || query.trim().length < 2) {
    return data({ suggestions: [] });
  }

  try {
    const suggestions = await searchUsers(query);
    return data({ suggestions });
  } catch (error) {
    console.error("Search error:", error);
    return data({ suggestions: [] });
  }
}
