import { getCloudflareEnv } from "@/lib/recording/cf-env";
import { authorizeMedia, parseByteRange } from "@/lib/media-access";
import { createPlaybackPlaylist } from "@/lib/recording/playback-playlist";
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
  if (new URL(req.url).searchParams.get("playlist") === "1") {
    const row = await env.DB.prepare(
      "SELECT duration_ms FROM recordings WHERE storage_key = ?1 AND state = 'ready'",
    )
      .bind(key)
      .first<{ duration_ms: number | null }>();
    if (!row?.duration_ms || !key.endsWith(".mp4"))
      return new Response("Streaming unavailable", {
        status: 415,
        headers: { "cache-control": "private, no-store" },
      });
    try {
      const media = new URL(req.url);
      media.searchParams.delete("playlist");
      const playlist = await createPlaybackPlaylist({
        size: head.size,
        durationSeconds: row.duration_ms / 1000,
        mediaUrl: media.pathname + media.search,
        read: async (offset, length) => {
          const part = await env.BUCKET!.get(key, {
            range: { offset, length },
            onlyIf: { etagMatches: head.etag },
          });
          if (!part || !("body" in part)) throw new Error("Media changed");
          return new Uint8Array(await part.arrayBuffer());
        },
      });
      return new Response(playlist, {
        headers: {
          "content-type": "application/vnd.apple.mpegurl",
          "cache-control": "private, no-store",
          vary: "Cookie, Authorization",
        },
      });
    } catch {
      return new Response("Streaming unavailable", {
        status: 415,
        headers: { "cache-control": "private, no-store" },
      });
    }
  }
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
