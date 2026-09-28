import { resolveDeviceToken } from "./device-tokens";
import { verifySessionOrNull } from "./recording/verify-session";
import { canViewResource } from "./visibility";
import { getAppWebEnv } from "./cf-env";

export async function canReadResource(
  req: Request,
  row: {
    visibility: string;
    userId: string | null;
    workspaceId: string | null;
  },
) {
  const visitor = await verifySessionOrNull(req.headers.get("cookie"));
  return canViewResource(visitor, row);
}

export async function canMutateResource(
  req: Request,
  row: { userId: string | null },
) {
  if (!row.userId) return false;
  const authorization = req.headers.get("authorization");
  if (authorization) {
    const match = /^Bearer ([^\s]+)$/i.exec(authorization);
    if (!match) return false;
    const token = await resolveDeviceToken(match[1]);
    return token?.userId === row.userId;
  }
  // Cookie-authenticated mutations must originate at this app. Native clients use bearer tokens.
  if (req.headers.get("origin") !== new URL(req.url).origin) return false;
  const visitor = await verifySessionOrNull(req.headers.get("cookie"));
  return visitor?.userId === row.userId;
}

export async function canPublishResource(workspaceId: string | null) {
  if (!workspaceId) return true;
  const env = await getAppWebEnv();
  const row = await env?.DB?.prepare(
    "SELECT allow_public_links FROM workspace WHERE id = ?1",
  )
    .bind(workspaceId)
    .first<{ allow_public_links: number }>();
  return row?.allow_public_links === 1;
}
