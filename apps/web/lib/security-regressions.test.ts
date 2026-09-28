import { beforeEach, expect, test, vi } from "vitest";
import { NextRequest } from "next/server";
const f = vi.hoisted(() => ({
  recording: vi.fn(),
  screenshot: vi.fn(),
  bytes: vi.fn(),
  update: vi.fn(),
  visitor: vi.fn(),
  comments: vi.fn(),
  addComment: vi.fn(),
  summary: vi.fn(),
  complete: vi.fn(),
  cap: vi.fn(),
  deleteRecording: vi.fn(),
  deleteObject: vi.fn(),
  token: vi.fn(),
  head: vi.fn(),
  publish: vi.fn(),
}));
vi.mock("@/lib/device-tokens", () => ({ resolveDeviceToken: f.token }));
vi.mock("@/lib/cf-env", () => ({
  getAppWebEnv: async () => ({
    DB: { prepare: () => ({ bind: () => ({ first: f.publish }) }) },
  }),
}));
vi.mock("@/lib/recording/db", () => ({
  getRecording: f.recording,
  updateRecording: f.update,
  listComments: f.comments,
  countComments: async () => 0,
  addComment: f.addComment,
  deleteRecording: f.deleteRecording,
}));
vi.mock("@/lib/screenshot/db", () => ({ getScreenshot: f.screenshot }));
vi.mock("@/lib/screenshot/r2", () => ({ getScreenshotBody: f.bytes }));
vi.mock("@/lib/recording/cf-env", () => ({
  getCloudflareEnv: async () => ({ BUCKET: { get: f.bytes } }),
}));
vi.mock("@/lib/recording/verify-session", () => ({
  verifySessionOrNull: f.visitor,
}));
vi.mock("@/lib/recording/summary-chapters", () => ({
  loadSummaryChapters: f.summary,
}));
vi.mock("@/lib/recording/r2", () => ({
  completeMultipartUpload: f.complete,
  headObject: f.head,
  deleteObject: f.deleteObject,
  abortMultipartUpload: async () => {},
}));
vi.mock("@/lib/recording/quota", () => ({ exceedsStorage: f.cap }));
vi.mock("@/lib/site", () => ({
  viewUrlForRequest: (_r: any, s: string) => `https://audit.invalid/r/${s}`,
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
import { GET as screenshotDownload } from "../app/api/s/download/route";
import { GET as recordingDownload } from "../app/api/r/download/route";
import { GET as summaryGet } from "../app/api/r/summary-chapters/[id]/route";
import {
  GET as commentsGet,
  POST as commentsPost,
} from "../app/api/r/comments/route";
import { POST as visibilityPost } from "../app/api/r/visibility/route";
import { DELETE as recordingDelete } from "../app/api/r/[id]/route";
import { POST as finalizePost } from "../app/api/r/finalize/route";
const slug = "Abcdef2345";
const base = () => ({
  slug,
  state: "ready",
  visibility: "private",
  userId: "owner",
  workspaceId: "team",
  deviceId: "known-install-id-1234",
  storageKey: `videos/${slug}.mp4`,
  uploadId: null,
});
const req = (
  path: string,
  body?: unknown,
  headers: Record<string, string> = {},
) =>
  new NextRequest(
    `https://audit.invalid${path}`,
    body === undefined
      ? undefined
      : {
          method: "POST",
          headers: { "content-type": "application/json", ...headers },
          body: JSON.stringify(body),
        },
  );
beforeEach(() => {
  vi.clearAllMocks();
  f.recording.mockResolvedValue(base());
  f.screenshot.mockResolvedValue({ ...base(), id: slug });
  f.bytes.mockResolvedValue({ body: new Uint8Array([1, 2, 3]), size: 3 });
  f.visitor.mockResolvedValue(null);
  f.comments.mockResolvedValue([
    { body: "Synthetic confidential comment", userName: "Synthetic owner" },
  ]);
  f.summary.mockResolvedValue({
    summary: "Synthetic confidential summary",
    chapters: [],
  });
  f.cap.mockImplementation(
    async (_d: any, _r: any, claimed: number) => claimed > 100,
  );
  f.complete.mockResolvedValue(undefined);
  f.addComment.mockImplementation(async (x: any) => x);
  f.token.mockResolvedValue(null);
  f.head.mockResolvedValue({ size: 150 });
  f.publish.mockResolvedValue({ allow_public_links: 1 });
});
test("F2: deny anonymous download of private screenshot", async () => {
  const r = await screenshotDownload(req(`/api/s/download?id=${slug}`));
  expect(r.status).toBe(404);
  expect(f.bytes).not.toHaveBeenCalled();
});
test("F2: deny anonymous download of workspace-only video", async () => {
  f.recording.mockResolvedValue({ ...base(), visibility: "workspace" });
  const r = await recordingDownload(req(`/api/r/download?slug=${slug}`));
  expect(r.status).toBe(404);
  expect(f.bytes).not.toHaveBeenCalled();
});
test("control: video download rejects private video", async () => {
  expect(
    (await recordingDownload(req(`/api/r/download?slug=${slug}`))).status,
  ).toBe(404);
  expect(f.bytes).not.toHaveBeenCalled();
});
test("F3: deny anonymous read of private recording summary", async () => {
  const r = await summaryGet(req(`/api/r/summary-chapters/${slug}`), {
    params: Promise.resolve({ id: slug }),
  });
  expect(r.status).toBe(404);
  expect(f.summary).not.toHaveBeenCalled();
});
test("F3: deny anonymous read of recording comments without loading visibility", async () => {
  const r = await commentsGet(req(`/api/r/comments?slug=${slug}`));
  expect(r.status).toBe(404);
  expect(f.comments).not.toHaveBeenCalled();
});
test("F3: deny outsider write of comment on private recording", async () => {
  f.visitor.mockResolvedValue({
    userId: "outsider",
    workspaceIds: [],
    name: "Outsider",
    email: "outsider@example.invalid",
  });
  const r = await commentsPost(
    req(
      `/api/r/comments?slug=${slug}`,
      { body: "Synthetic unauthorized comment" },
      { origin: "https://audit.invalid" },
    ),
  );
  expect(r.status).toBe(404);
  expect(f.addComment).not.toHaveBeenCalled();
});
test("F4: device ID alone cannot change private recording to public without a token", async () => {
  const r = await visibilityPost(
    req(
      `/api/r/visibility?slug=${slug}`,
      { value: "public" },
      { "x-captureflow-device": base().deviceId },
    ),
  );
  expect(r.status).toBe(403);
  expect(f.update).not.toHaveBeenCalled();
});
test("F4: device ID alone cannot delete recording without a token", async () => {
  const r = await recordingDelete(
    new NextRequest(`https://audit.invalid/api/r/${slug}`, {
      method: "DELETE",
      headers: { "x-captureflow-device": base().deviceId },
    }),
    { params: Promise.resolve({ id: slug }) },
  );
  expect(r.status).toBe(403);
  expect(f.deleteObject).not.toHaveBeenCalled();
});
test("control: incorrect device ID is rejected", async () => {
  const r = await visibilityPost(
    req(
      `/api/r/visibility?slug=${slug}`,
      { value: "public" },
      { "x-captureflow-device": "wrong-install-id" },
    ),
  );
  expect(r.status).toBe(403);
  expect(f.update).not.toHaveBeenCalled();
});
test("F6: actual R2 size overrides a claimed single byte", async () => {
  f.recording.mockResolvedValue({
    ...base(),
    state: "pending",
    uploadId: "synthetic-upload",
  });
  f.token.mockResolvedValue({ userId: "owner" });
  const r = await finalizePost(
    req(
      "/api/r/finalize",
      {
        slug,
        parts: [{ partNumber: 1, etag: "synthetic-etag" }],
        sizeBytes: 1,
      },
      {
        "x-captureflow-device": base().deviceId,
        authorization: "Bearer valid",
      },
    ),
  );
  expect(r.status).toBe(413);
  expect(f.cap).toHaveBeenCalledWith(base().deviceId, expect.anything(), 150);
  expect(f.deleteObject).toHaveBeenCalledWith(base().storageKey);
  expect(f.update).not.toHaveBeenCalledWith(
    slug,
    expect.objectContaining({ state: "ready" }),
  );
});

for (const visibility of ["private", "workspace", "public"]) {
  test(`authorized owner can download ${visibility} screenshots`, async () => {
    f.screenshot.mockResolvedValue({ ...base(), id: slug, visibility });
    f.visitor.mockResolvedValue({ userId: "owner", workspaceIds: ["team"] });
    expect(
      (await screenshotDownload(req(`/api/s/download?id=${slug}`))).status,
    ).toBe(200);
  });
}
test("workspace member can download workspace video", async () => {
  f.recording.mockResolvedValue({ ...base(), visibility: "workspace" });
  f.visitor.mockResolvedValue({ userId: "member", workspaceIds: ["team"] });
  expect(
    (await recordingDownload(req(`/api/r/download?slug=${slug}`))).status,
  ).toBe(200);
});
test("anonymous public video remains shareable", async () => {
  f.recording.mockResolvedValue({ ...base(), visibility: "public" });
  expect(
    (await recordingDownload(req(`/api/r/download?slug=${slug}`))).status,
  ).toBe(200);
});
test("revoked bearer cannot mutate even with correct device ID", async () => {
  f.token.mockResolvedValue(null);
  const r = await visibilityPost(
    req(
      `/api/r/visibility?slug=${slug}`,
      { value: "public" },
      {
        "x-captureflow-device": base().deviceId,
        authorization: "Bearer revoked",
      },
    ),
  );
  expect(r.status).toBe(403);
  expect(f.update).not.toHaveBeenCalled();
});
test("valid bearer for owner can change visibility", async () => {
  f.token.mockResolvedValue({ userId: "owner" });
  const r = await visibilityPost(
    req(
      `/api/r/visibility?slug=${slug}`,
      { value: "public" },
      { authorization: "Bearer valid" },
    ),
  );
  expect(r.status).toBe(200);
  expect(f.update).toHaveBeenCalledWith(slug, { visibility: "public" });
});
test("workspace policy prevents public links even for owner", async () => {
  f.token.mockResolvedValue({ userId: "owner" });
  f.publish.mockResolvedValue({ allow_public_links: 0 });
  const r = await visibilityPost(
    req(
      `/api/r/visibility?slug=${slug}`,
      { value: "public" },
      { authorization: "Bearer valid" },
    ),
  );
  expect(r.status).toBe(403);
  expect(f.update).not.toHaveBeenCalled();
});
