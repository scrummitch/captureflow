import { beforeEach, expect, test, vi } from "vitest";
const mocks = vi.hoisted(() => ({ visitor: vi.fn() }));
vi.mock("./recording/verify-session", () => ({
  verifySessionOrNull: mocks.visitor,
}));
import { authorizeMedia, parseByteRange } from "./media-access";
const request = new Request(
  "https://test.invalid/api/r/media/screenshots/example.source.png",
);
let result: unknown;
const db = {
  prepare: () => ({ bind: () => ({ first: async () => result }) }),
} as unknown as D1Database;
beforeEach(() => {
  mocks.visitor.mockResolvedValue(null);
  result = {
    userId: "owner",
    workspaceId: "team",
    visibility: "public",
    state: "ready",
  };
});
test("public screenshot exports accessible; original and state owner-only", async () => {
  expect(await authorizeMedia(request, "screenshots/example.png", db)).toBe(
    true,
  );
  expect(
    await authorizeMedia(request, "screenshots/example.source.png", db),
  ).toBe(false);
  expect(
    await authorizeMedia(request, "screenshots/example.state.json", db),
  ).toBe(false);
  mocks.visitor.mockResolvedValue({ userId: "member", workspaceIds: ["team"] });
  expect(
    await authorizeMedia(request, "screenshots/example.source.png", db),
  ).toBe(false);
  mocks.visitor.mockResolvedValue({ userId: "owner", workspaceIds: ["team"] });
  expect(
    await authorizeMedia(request, "screenshots/example.source.png", db),
  ).toBe(true);
});
test("deleted screenshot cannot be fetched even by owner", async () => {
  result = {
    userId: "owner",
    workspaceId: "team",
    visibility: "public",
    state: "deleted",
  };
  mocks.visitor.mockResolvedValue({ userId: "owner", workspaceIds: ["team"] });
  expect(await authorizeMedia(request, "screenshots/example.png", db)).toBe(
    false,
  );
});
test.each([
  ["bytes=0-9", 100, { offset: 0, length: 10 }],
  ["bytes=90-", 100, { offset: 90, length: 10 }],
  ["bytes=-10", 100, { offset: 90, length: 10 }],
  ["bytes=90-200", 100, { offset: 90, length: 10 }],
  ["bytes=100-", 100, false],
  ["bytes=10-1", 100, false],
  ["bytes=-0", 100, false],
  ["bytes=0-1,5-6", 100, false],
] as const)("range %s", (range, size, expected) =>
  expect(parseByteRange(range, size)).toEqual(expected),
);

test("active SVG content is never served from the authenticated origin", async () => {
  mocks.visitor.mockResolvedValue({ userId: "owner", workspaceIds: ["team"] });
  expect(await authorizeMedia(request, "workspace-logos/team.svg", db)).toBe(
    false,
  );
});
