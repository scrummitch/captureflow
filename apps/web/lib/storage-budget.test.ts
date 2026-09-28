import { beforeEach, expect, test, vi } from "vitest";
import { DatabaseSync } from "node:sqlite";
const env = vi.hoisted(() => ({ current: {} as Record<string, unknown> }));
vi.mock("./cf-env", () => ({ getAppWebEnv: async () => env.current }));
import {
  reserveStorage,
  releaseStorage,
  readBoundedBody,
} from "./storage-budget";
let sql: DatabaseSync;
beforeEach(() => {
  sql?.close();
  sql = new DatabaseSync(":memory:");
  sql.exec(
    "CREATE TABLE storage_reservations(object_key TEXT PRIMARY KEY, bytes INTEGER NOT NULL CHECK(bytes>=0))",
  );
  env.current = {
    STORAGE_LIMIT_BYTES: "100",
    DB: {
      prepare: (query: string) => ({
        bind: (...values: (string | number)[]) => ({
          first: async () => sql.prepare(query).get(...values) ?? null,
          run: async () => sql.prepare(query).run(...values),
        }),
      }),
    },
  };
});
test("concurrent reservations cannot exceed cap", async () => {
  const results = await Promise.allSettled([
    reserveStorage("a", 60),
    reserveStorage("b", 60),
  ]);
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(
    sql.prepare("SELECT SUM(bytes) AS total FROM storage_reservations").get()
      ?.total,
  ).toBe(60);
});
test("retries reserve only high-water size; source sidecars count", async () => {
  await reserveStorage("screenshots/a.png", 40);
  await reserveStorage("screenshots/a.png", 40);
  await reserveStorage("screenshots/a.source.png", 50);
  await expect(
    reserveStorage("screenshots/a.state.json", 11),
  ).rejects.toThrow();
  await releaseStorage("screenshots/a.png");
  await reserveStorage("screenshots/a.state.json", 11);
  expect(
    sql.prepare("SELECT SUM(bytes) AS total FROM storage_reservations").get()
      ?.total,
  ).toBe(61);
});
test("multipart reservations survive retries and release with object", async () => {
  await reserveStorage("videos/a#upload/1", 40);
  await reserveStorage("videos/a#upload/1", 20);
  await reserveStorage("videos/a#upload/2", 40);
  await expect(reserveStorage("videos/a#upload/3", 30)).rejects.toThrow();
  await releaseStorage("videos/a");
  expect(
    sql.prepare("SELECT COUNT(*) AS total FROM storage_reservations").get()
      ?.total,
  ).toBe(0);
});
test("actual body size bounded without trusting content-length", async () => {
  const request = new Request("https://test.invalid", {
    method: "POST",
    body: new Uint8Array(101),
  });
  await expect(readBoundedBody(request, 100)).rejects.toThrow("too large");
});
