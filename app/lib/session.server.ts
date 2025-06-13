import { createCookieSessionStorage } from "react-router";

export const authSessionStorage = createCookieSessionStorage({
  cookie: {
    name: "authSession",
    sameSite: "lax",
    path: "/",
    httpOnly: true,
    maxAge: 60 * 10,
    secrets: process.env.SESSION_SECRET.split(","),
    secure: process.env.NODE_ENV === "production",
  },
});
