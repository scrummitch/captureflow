import { redeemLoginCode } from "@/lib/desktop-login";
export async function POST(req: Request) {
  let body: { code?: unknown; verifier?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }
  if (
    typeof body.code !== "string" ||
    !/^[a-f0-9]{64}$/.test(body.code) ||
    typeof body.verifier !== "string" ||
    !/^[A-Za-z0-9_-]{43,128}$/.test(body.verifier)
  )
    return Response.json({ error: "Invalid request" }, { status: 400 });
  const token = await redeemLoginCode(body.code, body.verifier);
  return Response.json(token ?? { error: "Invalid or expired code" }, {
    status: token ? 200 : 401,
    headers: { "cache-control": "no-store" },
  });
}
