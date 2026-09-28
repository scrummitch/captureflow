import { beforeEach, expect, test, vi } from "vitest";
const f = vi.hoisted(() => ({
  write: vi.fn(),
  read: vi.fn(),
  remove: vi.fn(),
  available: vi.fn(),
  encrypt: vi.fn(),
  decrypt: vi.fn(),
}));
vi.mock("../../desktop/node_modules/electron", () => ({
  app: { getPath: () => "/synthetic/user-data" },
  safeStorage: {
    isEncryptionAvailable: f.available,
    encryptString: f.encrypt,
    decryptString: f.decrypt,
    getSelectedStorageBackend: () => "keychain",
  },
}));
vi.mock("fs/promises", () => ({
  writeFile: f.write,
  readFile: f.read,
  rm: f.remove,
  mkdir: vi.fn(),
}));
vi.mock("../../desktop/src/main/lib/logger", () => ({
  logInfo: vi.fn(),
  logWarn: vi.fn(),
}));
vi.mock("../../desktop/src/main/lib/recording/recording-connectivity", () => ({
  setRecordingConnectivity: vi.fn(),
}));
import {
  setRecordingAuth,
  clearRecordingAuth,
  loadRecordingAuth,
} from "../../desktop/src/main/lib/recording/recording-auth";
beforeEach(async () => {
  vi.clearAllMocks();
  f.available.mockReturnValue(true);
  f.encrypt.mockReturnValue(Buffer.from("encrypted bytes"));
  f.read.mockRejectedValue({ code: "ENOENT" });
  await clearRecordingAuth();
});
test("credentials are encrypted before persistence with restrictive permissions", async () => {
  const token = "a".repeat(64);
  await setRecordingAuth({ token, tokenId: "test-token" });
  expect(f.encrypt).toHaveBeenCalledWith(expect.stringContaining(token));
  expect(f.write).toHaveBeenCalledWith(
    "/synthetic/user-data/recording-auth.encrypted",
    Buffer.from("encrypted bytes"),
    { mode: 0o600 },
  );
});
test("no plaintext fallback when protected storage is unavailable", async () => {
  f.available.mockReturnValue(false);
  await expect(
    setRecordingAuth({ token: "a".repeat(64), tokenId: "test" }),
  ).rejects.toThrow("Secure credential storage unavailable");
  expect(f.write).not.toHaveBeenCalled();
});
test("legacy plaintext file is discarded on load", async () => {
  await loadRecordingAuth();
  expect(f.remove).toHaveBeenCalledWith(
    "/synthetic/user-data/recording-auth.json",
    { force: true },
  );
});
