import { beforeEach, expect, test, vi } from "vitest";
const f = vi.hoisted(() => ({ row: vi.fn(), run: vi.fn() }));
vi.mock("./cf-env", () => ({
  getAppWebEnv: async () => ({
    DB: { prepare: () => ({ bind: () => ({ first: f.row, run: f.run }) }) },
  }),
}));
import { resolveDeviceToken } from "./device-tokens";
beforeEach(() => {
  vi.clearAllMocks();
  f.run.mockResolvedValue({});
});
test("expired and revoked tokens fail closed", async () => {
  for (const row of [
    { id: "a", user_id: "owner", created_at: 0, revoked_at: null },
    {
      id: "a",
      user_id: "owner",
      created_at: Date.now(),
      revoked_at: Date.now(),
    },
  ]) {
    f.row.mockResolvedValue(row);
    expect(await resolveDeviceToken("a".repeat(64))).toBeNull();
  }
  expect(f.run).not.toHaveBeenCalled();
});
test("fresh token authenticates user", async () => {
  f.row.mockResolvedValue({
    id: "a",
    user_id: "owner",
    created_at: Date.now(),
    revoked_at: null,
  });
  expect(await resolveDeviceToken("a".repeat(64))).toEqual({
    id: "a",
    userId: "owner",
  });
});
