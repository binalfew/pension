import { data, redirect } from "react-router";
import { authenticator, userIdKey, type ProviderUser } from "~/lib/auth.server";
import { authSessionStorage } from "~/lib/session.server";
import type { Route } from "./+types/auth.$provider.callback";

export async function loader({ request, params }: Route.LoaderArgs) {
  const provider = params.provider;

  let user = await authenticator
    .authenticate(provider, request)
    .catch((error) => {
      if (error instanceof Error) {
        return data({
          error: error.message,
        });
      }

      throw error;
    });

  if ("error" in user) {
    return data({ error: user.error });
  }

  const providerUser = user as ProviderUser;
  let session = await authSessionStorage.getSession(
    request.headers.get("cookie")
  );

  session.set(userIdKey, providerUser.email);

  return redirect("/", {
    headers: {
      "Set-Cookie": await authSessionStorage.commitSession(session),
    },
  });
}
