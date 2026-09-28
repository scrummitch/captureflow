import { beforeEach, expect, test, vi } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { createHash } from "node:crypto";
const f = vi.hoisted(() => ({
  env: {} as Record<string, unknown>,
  issue: vi.fn(),
  setAuth: vi.fn(),
}));
vi.mock("./cf-env", () => ({ getAppWebEnv: async () => f.env }));
vi.mock("./device-tokens", () => ({ issueDeviceToken: f.issue }));
vi.mock("../../desktop/src/main/lib/recording/recording-auth", () => ({
  setRecordingAuth: f.setAuth,
}));
vi.mock("../../desktop/src/main/lib/logger", () => ({ logWarn: vi.fn() }));
import { issueLoginCode, redeemLoginCode } from "./desktop-login";
import { beginRecordingLogin } from "../../desktop/src/main/lib/recording/recording-login";
import { handleDeepLinkUrl } from "../../desktop/src/main/lib/recording/recording-auth-deeplink";
let db: DatabaseSync;
beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  db?.close();
  db = new DatabaseSync(":memory:");
  db.exec(
    'CREATE TABLE desktop_auth_codes(code_hash TEXT PRIMARY KEY,user_id TEXT,challenge TEXT,label TEXT,expires_at INTEGER); CREATE TABLE users(id TEXT PRIMARY KEY,email TEXT); INSERT INTO users VALUES ("owner","owner@example.invalid")'.replaceAll(
      '"',
      "'",
    ),
  );
  f.env = {
    DB: {
      prepare: (q: string) => ({
        bind: (...args: (string | number | null)[]) => ({
          run: async () => db.prepare(q).run(...args),
          first: async () => db.prepare(q).get(...args) ?? null,
        }),
      }),
    },
  };
  f.issue.mockResolvedValue({ rawToken: "a".repeat(64), id: "issued-id" });
});
test("login code requires correct verifier and is consumed exactly once", async () => {
  const verifier = "b".repeat(43);
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const code = await issueLoginCode("owner", challenge, "test");
  expect(await redeemLoginCode(code, "wrong")).toBeNull();
  expect((await redeemLoginCode(code, verifier))?.id).toBe("issued-id");
  expect(await redeemLoginCode(code, verifier)).toBeNull();
  expect(f.issue).toHaveBeenCalledTimes(1);
});
test("expired login code cannot mint credential", async () => {
  const verifier = "b".repeat(43);
  const code = await issueLoginCode(
    "owner",
    createHash("sha256").update(verifier).digest("base64url"),
    null,
  );
  db.exec("UPDATE desktop_auth_codes SET expires_at=0");
  expect(await redeemLoginCode(code, verifier)).toBeNull();
  expect(f.issue).not.toHaveBeenCalled();
});
test("unsolicited bearer deep link is ignored", async () => {
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  await handleDeepLinkUrl(
    `captureflow://auth/callback?token=${"a".repeat(64)}&id=attacker`,
  );
  expect(f.setAuth).not.toHaveBeenCalled();
  expect(fetchMock).not.toHaveBeenCalled();
});
test("desktop requires pending matching state and exchanges at configured origin", async () => {
  const login = beginRecordingLogin();
  const fetchMock = vi
    .fn()
    .mockResolvedValue(
      Response.json({ rawToken: "a".repeat(64), id: "issued-id" }),
    );
  vi.stubGlobal("fetch", fetchMock);
  await handleDeepLinkUrl(
    `captureflow://auth/callback?code=${"c".repeat(64)}&state=wrong`,
  );
  expect(fetchMock).not.toHaveBeenCalled();
  const url = `captureflow://auth/callback?code=${"c".repeat(64)}&state=${login.state}`;
  await handleDeepLinkUrl(url);
  await handleDeepLinkUrl(url);
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(f.setAuth).toHaveBeenCalledTimes(1);
  expect(fetchMock.mock.calls[0][0]).toBe(
    "https://captureflow-private.flindev.workers.dev/api/r/auth/exchange",
  );
  const body = JSON.parse(fetchMock.mock.calls[0][1].body);
  expect(createHash("sha256").update(body.verifier).digest("base64url")).toBe(
    login.challenge,
  );
});
