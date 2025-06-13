import { redirect } from "react-router";
import { Authenticator } from "remix-auth";
import { MicrosoftStrategy } from "remix-auth-microsoft";

const SESSION_EXPIRATION_TIME = 1000 * 60 * 60 * 24 * 30; // 30 days
export const getSessionExpirationDate = () =>
  new Date(Date.now() + SESSION_EXPIRATION_TIME);

export const userIdKey = "userId";

type ProviderUser = {
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
    redirectURI: "http://localhost:3000/auth/microsoft/callback",
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
