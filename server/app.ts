import "react-router";
import { createRequestHandler } from "@react-router/express";
import express from "express";

declare module "react-router" {
  interface AppLoadContext {
    // Set per request in server.js, for the Content-Security-Policy
    cspNonce: string;
  }
}

export const app = express();
app.disable("x-powered-by");

app.use(
  createRequestHandler({
    build: () => import("virtual:react-router/server-build"),
    getLoadContext(_req, res) {
      return {
        cspNonce: res.locals.cspNonce,
      };
    },
  }),
);
