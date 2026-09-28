import { getCloudflareEnv } from "@/lib/recording/cf-env";
import { authorizeMedia, parseByteRange } from "@/lib/media-access";
export const dynamic = "force-dynamic";
export async function GET(
  req: Request,
  { params }: { params: Promise<{ key: string[] }> },
) {
  const key = (await params).key.join("/");
  const denied = () =>
    new Response("Not found", {
      status: 404,
      headers: { "cache-control": "private, no-store" },
    });
  if (!key || key.includes("..") || key.includes("\\")) return denied();
  const env = await getCloudflareEnv();
  if (!env?.DB || !env.BUCKET)
    return new Response("Storage unavailable", { status: 503 });
  if (!(await authorizeMedia(req, key, env.DB))) return denied();
  const head = await env.BUCKET.head(key);
  if (!head) return denied();
  const range = parseByteRange(req.headers.get("range"), head.size);
  if (range === false)
    return new Response(null, {
      status: 416,
      headers: {
        "content-range": `bytes */${head.size}`,
        "cache-control": "no-store",
      },
    });
  const obj = await env.BUCKET.get(key, range ? { range } : undefined);
  if (!obj) return denied();
  const headers = new Headers({
    "content-type": obj.httpMetadata?.contentType ?? "application/octet-stream",
    "cache-control": "private, no-store",
    vary: "Cookie, Authorization",
    "accept-ranges": "bytes",
    "x-content-type-options": "nosniff",
    "content-length": String(range ? range.length : obj.size),
  });
  if (range)
    headers.set(
      "content-range",
      `bytes ${range.offset}-${range.offset + range.length - 1}/${obj.size}`,
    );
  return new Response(obj.body, { status: range ? 206 : 200, headers });
}
