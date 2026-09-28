import { timingSafeEqual } from "node:crypto";
/// <reference types="@cloudflare/workers-types" />

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — resolved after the OpenNext Cloudflare build runs.
import openNextWorker from "./.open-next/worker.js";
import {
  runDailyRetentionSweep,
  runHourlyMultipartGc,
} from "./lib/recording/cron";

type Env = {
  DB: D1Database;
  BUCKET: R2Bucket;
  BOOTSTRAP_SECRET?: string;
  ALLOW_REGISTRATION?: string;
};

const handler: ExportedHandler<Env> = {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (
      url.pathname.startsWith("/api/auth/sign-up") ||
      url.pathname === "/api/auth/sign-up/email"
    ) {
      const supplied = request.headers.get("x-bootstrap-secret");
      if (
        !env.BOOTSTRAP_SECRET ||
        !supplied ||
        new TextEncoder().encode(supplied).length !==
          new TextEncoder().encode(env.BOOTSTRAP_SECRET).length ||
        !timingSafeEqual(
          new TextEncoder().encode(supplied),
          new TextEncoder().encode(env.BOOTSTRAP_SECRET),
        )
      )
        return Response.json(
          { error: "Registration disabled" },
          { status: 403 },
        );
    }
    const response = await openNextWorker.fetch(request, env, ctx);
    const secured = new Response(response.body, response);
    secured.headers.set("Referrer-Policy", "no-referrer");
    secured.headers.set("X-Content-Type-Options", "nosniff");
    secured.headers.set("X-Robots-Tag", "noindex, nofollow");
    if (!url.pathname.startsWith("/_next/static/"))
      secured.headers.set("Cache-Control", "private, no-store");
    return secured;
  },

  async scheduled(
    event: ScheduledController,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<void> {
    switch (event.cron) {
      case "0 * * * *":
        ctx.waitUntil(runHourlyMultipartGc(env));
        break;
      case "0 4 * * *":
        ctx.waitUntil(runDailyRetentionSweep(env));
        break;
      default:
        console.warn(`[cron] unknown schedule: ${event.cron}`);
    }
  },
};

export default handler;
