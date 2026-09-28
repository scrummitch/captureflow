import { EventEmitter } from "events";
import { app, safeStorage } from "electron";
import { join } from "path";
import { readFile, writeFile, mkdir, rm } from "fs/promises";
import type { RecordingAuthState } from "../../../shared/types";
import { logInfo, logWarn } from "../logger";
import { setRecordingConnectivity } from "./recording-connectivity";

// The raw token is the recording-API credential — keep it out of logs and never
// round-trip it to the renderer.

const FILE_NAME = "recording-auth.encrypted";

type StoredAuth = {
  token: string;
  tokenId: string;
  label: string | null;
  email: string | null;
};

let cached: StoredAuth | null = null;
const events = new EventEmitter();

function filePath(): string {
  return join(app.getPath("userData"), FILE_NAME);
}

function stateFromStored(stored: StoredAuth | null): RecordingAuthState {
  if (!stored) return { kind: "signed_out" };
  return {
    kind: "signed_in",
    tokenId: stored.tokenId,
    label: stored.label,
    email: stored.email,
  };
}

// Renderer-safe view; never includes the raw token.
export function getRecordingAuthState(): RecordingAuthState {
  return stateFromStored(cached);
}

// Internal use only — exposes the raw bearer.
export function getRecordingAuthToken(): string | null {
  return cached?.token ?? null;
}

export async function loadRecordingAuth(): Promise<RecordingAuthState> {
  try {
    // Old plaintext credentials are discarded; a fresh sign-in rotates them.
    await rm(join(app.getPath("userData"), "recording-auth.json"), {
      force: true,
    });
    if (!safeStorage.isEncryptionAvailable()) return stateFromStored(null);
    const raw = safeStorage.decryptString(await readFile(filePath()));
    const parsed = JSON.parse(raw) as Partial<StoredAuth>;
    if (
      typeof parsed.token === "string" &&
      parsed.token.length >= 32 &&
      typeof parsed.tokenId === "string" &&
      parsed.tokenId.length > 0
    ) {
      cached = {
        token: parsed.token,
        tokenId: parsed.tokenId,
        label: typeof parsed.label === "string" ? parsed.label : null,
        email: typeof parsed.email === "string" ? parsed.email : null,
      };
      logInfo(
        "recording-auth",
        `loaded saved session (tokenId=${cached.tokenId})`,
      );
    }
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code && code !== "ENOENT") {
      logWarn("recording-auth", `failed to read auth file (${code})`);
    }
  }
  return stateFromStored(cached);
}

export async function setRecordingAuth(input: {
  token: string;
  tokenId: string;
  label?: string | null;
  email?: string | null;
}): Promise<RecordingAuthState> {
  const next: StoredAuth = {
    token: input.token,
    tokenId: input.tokenId,
    label: input.label ?? null,
    email: input.email ?? null,
  };
  if (!safeStorage.isEncryptionAvailable())
    throw new Error("Secure credential storage unavailable");
  if (
    process.platform === "linux" &&
    safeStorage.getSelectedStorageBackend() === "basic_text"
  )
    throw new Error("Secure keyring required");
  cached = next;
  try {
    await mkdir(app.getPath("userData"), { recursive: true });
    await writeFile(
      filePath(),
      safeStorage.encryptString(JSON.stringify(next)),
      { mode: 0o600 },
    );
    logInfo("recording-auth", `saved session (tokenId=${next.tokenId})`);
  } catch (err) {
    logWarn("recording-auth", `failed to persist session: ${String(err)}`);
  }
  const state = stateFromStored(next);
  events.emit("change", state);
  return state;
}

// Runs even with no token cached, purely to track connectivity. Network errors
// never sign the user out — only an explicit 401 from the worker clears the auth.
const AUTH_CHECK_BASE =
  process.env.CAPTUREFLOW_RECORDING_API_BASE ??
  "https://captureflow-private.flindev.workers.dev/api/r";
const AUTH_CHECK_TIMEOUT_MS = 8_000;

export async function validateRecordingAuth(): Promise<RecordingAuthState> {
  const token = cached?.token ?? null;
  try {
    const headers: Record<string, string> = {};
    if (token) headers.authorization = `Bearer ${token}`;
    const res = await fetch(`${AUTH_CHECK_BASE}/auth/check`, {
      method: "GET",
      headers,
      signal: AbortSignal.timeout(AUTH_CHECK_TIMEOUT_MS),
    });
    // Any HTTP response (including 400/401) means the host is reachable.
    setRecordingConnectivity("online");
    if (token && res.status === 401) {
      logInfo(
        "recording-auth",
        "remote check rejected token; clearing local session",
      );
      return clearRecordingAuth();
    }
    if (!res.ok && res.status !== 400) {
      logWarn(
        "recording-auth",
        `remote check returned ${res.status}; keeping cached session`,
      );
    }
  } catch (err) {
    logWarn("recording-auth", `remote check failed (network): ${String(err)}`);
    setRecordingConnectivity("offline");
  }
  return stateFromStored(cached);
}

export async function signOutRecordingAuth(): Promise<RecordingAuthState> {
  const token = cached?.token;
  if (token) {
    const response = await fetch(`${AUTH_CHECK_BASE}/auth/revoke`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(AUTH_CHECK_TIMEOUT_MS),
    });
    if (!response.ok && response.status !== 401)
      throw new Error(
        "Could not revoke session; try signing out again when connected.",
      );
  }
  return clearRecordingAuth();
}

export async function clearRecordingAuth(): Promise<RecordingAuthState> {
  cached = null;
  try {
    await rm(filePath(), { force: true });
    logInfo("recording-auth", "cleared session");
  } catch (err) {
    logWarn("recording-auth", `failed to remove auth file: ${String(err)}`);
  }
  const state = stateFromStored(null);
  events.emit("change", state);
  return state;
}

export function onRecordingAuthChange(
  fn: (state: RecordingAuthState) => void,
): () => void {
  events.on("change", fn);
  return () => {
    events.off("change", fn);
  };
}
