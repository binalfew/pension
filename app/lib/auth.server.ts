import { redirect } from "react-router";
import { Authenticator } from "remix-auth";
import { MicrosoftStrategy } from "remix-auth-microsoft";
import type { User } from "~/types/user";
import prisma from "./prisma";
import { authSessionStorage } from "./session.server";

const SESSION_EXPIRATION_TIME = 1000 * 60 * 60 * 24 * 30; // 30 days
export const getSessionExpirationDate = () =>
  new Date(Date.now() + SESSION_EXPIRATION_TIME);

export const userIdKey = "userId";

export type ProviderUser = {
  id: string;
  email: string;
  username: string;
  name?: string;
  imageUrl?: string;
};

export const authenticator = new Authenticator<ProviderUser>();

let microsoftStrategy = new MicrosoftStrategy(
  {
    clientId: process.env.MICROSOFT_CLIENT_ID,
    clientSecret: process.env.MICROSOFT_CLIENT_SECRET,
    tenantId: process.env.MICROSOFT_TENANT_ID,
    redirectURI: process.env.MICROSOFT_REDIRECT_URI,
    scopes: ["openid", "profile", "email"],
    prompt: "login",
  },
  async ({ tokens }) => {
    let accessToken = tokens.accessToken();
    let profile = await MicrosoftStrategy.userProfile(accessToken);
    const email = profile.emails?.[0]?.value.trim().toLowerCase();
    if (!email) {
      throw redirect("/login");
    }

    return {
      id: profile.id,
      email,
      username: profile.displayName,
      name: profile.name.givenName,
    };
  }
);

authenticator.use(microsoftStrategy);

export async function getUserEmail(request: Request) {
  const cookieSession = await authSessionStorage.getSession(
    request.headers.get("cookie")
  );
  const userId = cookieSession.get(userIdKey);

  return userId ?? null;
}

export async function requireUser(request: Request) {
  const userEmail = await getUserEmail(request);

  if (!userEmail) {
    throw logout({ request });
  }

  const users = await prisma.$queryRaw<
    User[]
  >`SELECT * FROM users WHERE Email = ${userEmail}`;

  if (!users || users.length === 0) {
    throw logout({ request });
  }

  return users[0];
}

export async function logout({ request }: { request: Request }) {
  let session = await authSessionStorage.getSession(
    request.headers.get("cookie")
  );
  return redirect("/", {
    headers: { "Set-Cookie": await authSessionStorage.destroySession(session) },
  });
}
