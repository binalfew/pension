import { data } from "react-router";
import { searchUsers } from "~/lib/db.server";
import type { Route } from "./+types/api.search";

export async function loader({ request }: Route.LoaderArgs) {
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
