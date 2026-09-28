import { setRecordingAuth } from "./recording-auth";
import { consumeRecordingLogin } from "./recording-login";
import { logWarn } from "../logger";
const API_BASE =
  process.env.CAPTUREFLOW_RECORDING_API_BASE ??
  "https://captureflow-private.flindev.workers.dev/api/r";
export async function handleDeepLinkUrl(rawUrl: string): Promise<void> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return;
  }
  if (
    url.protocol !== "captureflow:" ||
    url.host !== "auth" ||
    url.pathname !== "/callback"
  )
    return;
  const code = url.searchParams.get("code") ?? "";
  if (!/^[a-f0-9]{64}$/.test(code)) return;
  const verifier = consumeRecordingLogin(url.searchParams.get("state") ?? "");
  if (!verifier) return;
  try {
    const response = await fetch(`${API_BASE}/auth/exchange`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code, verifier }),
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error("Login exchange rejected");
    const data = (await response.json()) as {
      rawToken?: string;
      id?: string;
      email?: string;
      label?: string;
    };
    if (!data.rawToken || !/^[a-f0-9]{64}$/.test(data.rawToken) || !data.id)
      throw new Error("Invalid login response");
    await setRecordingAuth({
      token: data.rawToken,
      tokenId: data.id,
      email: data.email,
      label: data.label,
    });
  } catch {
    logWarn("recording-auth", "Sign-in failed; start sign-in again.");
  }
}
