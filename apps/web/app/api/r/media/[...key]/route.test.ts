import { beforeEach, expect, test, vi } from "vitest";
const f = vi.hoisted(() => ({
  auth: vi.fn(),
  head: vi.fn(),
  get: vi.fn(),
  first: vi.fn(),
  playlist: vi.fn(),
}));
vi.mock("@/lib/recording/cf-env", () => ({
  getCloudflareEnv: async () => ({
    DB: { prepare: () => ({ bind: () => ({ first: f.first }) }) },
    BUCKET: { head: f.head, get: f.get },
  }),
}));
vi.mock("@/lib/media-access", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/media-access")>()),
  authorizeMedia: f.auth,
}));
vi.mock("@/lib/recording/playback-playlist", () => ({
  createPlaybackPlaylist: f.playlist,
}));
import { GET } from "./route";
const params = { params: Promise.resolve({ key: ["videos", "record.mp4"] }) };
beforeEach(() => {
  vi.clearAllMocks();
  f.auth.mockResolvedValue(true);
  f.head.mockResolvedValue({ size: 100, etag: "version" });
  f.first.mockResolvedValue({ duration_ms: 10000 });
  f.playlist.mockResolvedValue("#EXTM3U\n");
});
test("denies playlist before reading any private media", async () => {
  f.auth.mockResolvedValue(false);
  const r = await GET(
    new Request(
      "https://test.invalid/api/r/media/videos/record.mp4?playlist=1",
    ),
    params,
  );
  expect(r.status).toBe(404);
  expect(f.head).not.toHaveBeenCalled();
  expect(f.playlist).not.toHaveBeenCalled();
});
test("authorized playlist remains non-cacheable and all segment URIs use protected media", async () => {
  const r = await GET(
    new Request(
      "https://test.invalid/api/r/media/videos/record.mp4?playlist=1&v=100",
    ),
    params,
  );
  expect(r.status).toBe(200);
  expect(r.headers.get("cache-control")).toBe("private, no-store");
  expect(f.playlist.mock.calls[0][0].mediaUrl).toBe(
    "/api/r/media/videos/record.mp4?v=100",
  );
});
test("ordinary MP4s can fall back without returning an invalid manifest", async () => {
  f.playlist.mockRejectedValue(new Error("No index"));
  const r = await GET(
    new Request(
      "https://test.invalid/api/r/media/videos/record.mp4?playlist=1",
    ),
    params,
  );
  expect(r.status).toBe(415);
  expect(r.headers.get("cache-control")).toBe("private, no-store");
});
