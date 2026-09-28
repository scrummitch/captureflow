import { resolveDeviceToken, revokeDeviceToken } from "@/lib/device-tokens";
export async function POST(req: Request) {
  const raw = /^Bearer ([^\s]+)$/i.exec(
    req.headers.get("authorization") ?? "",
  )?.[1];
  const token = raw ? await resolveDeviceToken(raw) : null;
  if (!token) return Response.json({ error: "Unauthorized" }, { status: 401 });
  await revokeDeviceToken(token.userId, token.id);
  return Response.json(
    { ok: true },
    { headers: { "cache-control": "no-store" } },
  );
}
